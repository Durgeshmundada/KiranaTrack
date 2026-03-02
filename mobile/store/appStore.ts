import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  addPayment as addPaymentRemote,
  clearOutOfStockItems,
  createBill as createBillRemote,
  createOutOfStockItem,
  createUdhaarCustomer,
  createUdhaarEntry,
  createVendor,
  deleteBill as deleteBillRemote,
  deleteOutOfStockItem as deleteOutOfStockItemRemote,
  deletePayment as deletePaymentRemote,
  deleteUdhaarEntry as deleteUdhaarEntryRemote,
  editPayment as editPaymentRemote,
  fetchBillsWithPayments,
  fetchOutOfStockItems,
  fetchUdhaarCustomers,
  fetchVendors,
  updateOutOfStockStatus,
} from '@/services/backendData';
import { setAppLanguage } from '@/i18n';
import type {
  AppLanguage,
  AppSettings,
  Bill,
  OutOfStockItem,
  OutOfStockStatus,
  PaymentMode,
  UdhaarCustomer,
  UdhaarEntryType,
  Vendor,
} from '@/types/models';

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  overdueThresholdDays: 30,
  defaultPaymentMode: 'cash',
  lockOnOpen: false,
};

const cycleStatus: Record<OutOfStockStatus, OutOfStockStatus> = {
  pending: 'ordered',
  ordered: 'restocked',
  restocked: 'pending',
};

type NewBillPayload = {
  billNumber: string;
  vendorName: string;
  date: string;
  totalAmountPaise: number;
  imageUrl: string;
  imageHash: string;
  clientRequestId?: string;
  lineItems: Bill['lineItems'];
};

type NewPaymentPayload = {
  amountPaise: number;
  date: string;
  collectorName: string | null;
  mode?: PaymentMode;
  clientRequestId?: string;
  notes?: string | null;
};

interface AppStoreState {
  ownerUserId: string | null;
  initialized: boolean;
  loadingData: boolean;
  lastSyncAt: string | null;
  lastFullSyncAt: string | null;
  syncCursor: {
    vendors: string | null;
    bills: string | null;
    outOfStockItems: string | null;
    customers: string | null;
  };
  settings: AppSettings;
  vendors: Vendor[];
  bills: Bill[];
  outOfStockItems: OutOfStockItem[];
  customers: UdhaarCustomer[];
  isOffline: boolean;

  bootstrap: (ownerUserId: string) => Promise<void>;
  syncAll: () => Promise<void>;
  resetData: () => void;
  setOffline: (value: boolean) => void;
  setLanguage: (language: AppLanguage) => void;
  setOverdueThreshold: (days: number) => void;
  setDefaultPaymentMode: (mode: PaymentMode) => void;
  setLockOnOpen: (value: boolean) => void;

  addBill: (payload: NewBillPayload) => Promise<Bill>;
  deleteBill: (billId: string) => Promise<void>;

  addPayment: (billId: string, payload: NewPaymentPayload) => Promise<void>;
  editPayment: (
    billId: string,
    paymentId: string,
    payload: NewPaymentPayload,
  ) => Promise<void>;
  deletePayment: (billId: string, paymentId: string) => Promise<void>;

  addOutOfStockItem: (name: string) => Promise<void>;
  cycleOutOfStock: (id: string) => Promise<void>;
  deleteOutOfStockItem: (id: string) => Promise<void>;
  clearOutOfStock: () => Promise<void>;
  markItemsRestockedByLineItems: (lineItemNames: string[]) => Promise<number>;

  addCustomer: (name: string, phone: string | null) => Promise<void>;
  addUdhaarEntry: (
    customerId: string,
    type: UdhaarEntryType,
    amountPaise: number,
    description?: string | null,
    date?: string,
  ) => Promise<void>;
  deleteUdhaarEntry: (customerId: string, entryId: string) => Promise<void>;
}

const normalize = (value: string): string => value.trim().toLowerCase();
const OFFLINE_WRITE_ERROR = 'You are offline. Reconnect to internet and retry.';
const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

type WithVersion = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

const toVersionEpoch = (value: WithVersion): number => {
  const candidate = value.updatedAt ?? value.createdAt;
  const parsed = candidate ? Date.parse(candidate) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const mergeByLatestVersion = <T extends WithVersion>(
  current: T[],
  incoming: T[],
): T[] => {
  if (current.length === 0) {
    return incoming;
  }

  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((nextItem) => {
    const existing = map.get(nextItem.id);
    if (!existing) {
      map.set(nextItem.id, nextItem);
      return;
    }

    const existingVersion = toVersionEpoch(existing);
    const nextVersion = toVersionEpoch(nextItem);
    if (nextVersion >= existingVersion) {
      map.set(nextItem.id, nextItem);
    }
  });

  return [...map.values()];
};

const computeCursorFromEntities = <T extends WithVersion>(
  entities: T[],
  fallback: string | null,
): string | null => {
  let maxEpoch = fallback ? Date.parse(fallback) : 0;
  if (!Number.isFinite(maxEpoch)) {
    maxEpoch = 0;
  }

  entities.forEach((entity) => {
    const epoch = toVersionEpoch(entity);
    if (epoch > maxEpoch) {
      maxEpoch = epoch;
    }
  });

  return maxEpoch > 0 ? new Date(maxEpoch).toISOString() : fallback;
};

const assertOnlineForWrite = (isOffline: boolean): void => {
  if (isOffline) {
    throw new Error(OFFLINE_WRITE_ERROR);
  }
};

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      initialized: false,
      ownerUserId: null,
      loadingData: false,
      lastSyncAt: null,
      lastFullSyncAt: null,
      syncCursor: {
        vendors: null,
        bills: null,
        outOfStockItems: null,
        customers: null,
      },
      settings: DEFAULT_SETTINGS,
      vendors: [],
      bills: [],
      outOfStockItems: [],
      customers: [],
      isOffline: false,

      bootstrap: async (ownerUserId) => {
        setAppLanguage(get().settings.language);

        const currentOwner = get().ownerUserId;
        if (currentOwner !== ownerUserId) {
          set({
            ownerUserId,
            initialized: false,
            lastSyncAt: null,
            lastFullSyncAt: null,
            syncCursor: {
              vendors: null,
              bills: null,
              outOfStockItems: null,
              customers: null,
            },
            vendors: [],
            bills: [],
            outOfStockItems: [],
            customers: [],
          });
        }

        try {
          await get().syncAll();
        } catch {
          set((state) => ({ initialized: state.initialized || true }));
        }
      },

      syncAll: async () => {
        set({ loadingData: true });
        try {
          const current = get();
          const now = Date.now();
          const lastFullSyncEpoch = current.lastFullSyncAt
            ? Date.parse(current.lastFullSyncAt)
            : Number.NaN;
          const shouldRunFullSync =
            !current.lastFullSyncAt ||
            !Number.isFinite(lastFullSyncEpoch) ||
            now - lastFullSyncEpoch >= FULL_SYNC_INTERVAL_MS;

          const vendorsUpdatedAfter = shouldRunFullSync
            ? undefined
            : current.syncCursor.vendors ?? undefined;
          const billsUpdatedAfter = shouldRunFullSync
            ? undefined
            : current.syncCursor.bills ?? undefined;
          const outOfStockUpdatedAfter = shouldRunFullSync
            ? undefined
            : current.syncCursor.outOfStockItems ?? undefined;
          const customersUpdatedAfter = shouldRunFullSync
            ? undefined
            : current.syncCursor.customers ?? undefined;

          const results = await Promise.allSettled([
            fetchVendors({ updatedAfter: vendorsUpdatedAfter }),
            fetchBillsWithPayments({ updatedAfter: billsUpdatedAfter }),
            fetchOutOfStockItems({ updatedAfter: outOfStockUpdatedAfter }),
            fetchUdhaarCustomers({ updatedAfter: customersUpdatedAfter }),
          ]);

          const [vendorsResult, billsResult, outOfStockResult, customersResult] =
            results;

          const vendors = (() => {
            if (vendorsResult.status !== 'fulfilled') {
              return current.vendors;
            }
            if (shouldRunFullSync || !vendorsUpdatedAfter) {
              return vendorsResult.value;
            }
            return mergeByLatestVersion(current.vendors, vendorsResult.value);
          })();
          const bills = (() => {
            if (billsResult.status !== 'fulfilled') {
              return current.bills;
            }
            if (shouldRunFullSync || !billsUpdatedAfter) {
              return billsResult.value;
            }
            return mergeByLatestVersion(current.bills, billsResult.value);
          })();
          const outOfStockItems = (() => {
            if (outOfStockResult.status !== 'fulfilled') {
              return current.outOfStockItems;
            }
            if (shouldRunFullSync || !outOfStockUpdatedAfter) {
              return outOfStockResult.value;
            }
            return mergeByLatestVersion(current.outOfStockItems, outOfStockResult.value);
          })();
          const customers = (() => {
            if (customersResult.status !== 'fulfilled') {
              return current.customers;
            }
            if (shouldRunFullSync || !customersUpdatedAfter) {
              return customersResult.value;
            }
            return mergeByLatestVersion(current.customers, customersResult.value);
          })();

          const successCount = results.filter(
            (result) => result.status === 'fulfilled',
          ).length;

          if (successCount === 0) {
            throw new Error('Sync failed');
          }

          const syncedAtIso = new Date().toISOString();
          const nextSyncCursor = {
            vendors: computeCursorFromEntities(vendors, current.syncCursor.vendors),
            bills: computeCursorFromEntities(bills, current.syncCursor.bills),
            outOfStockItems: computeCursorFromEntities(
              outOfStockItems,
              current.syncCursor.outOfStockItems,
            ),
            customers: computeCursorFromEntities(customers, current.syncCursor.customers),
          };

          set({
            vendors,
            bills,
            outOfStockItems,
            customers,
            initialized: true,
            lastSyncAt: syncedAtIso,
            lastFullSyncAt: shouldRunFullSync
              ? syncedAtIso
              : current.lastFullSyncAt,
            syncCursor: nextSyncCursor,
          });
        } finally {
          set({ loadingData: false });
        }
      },

      resetData: () => {
        set({
          ownerUserId: null,
          initialized: false,
          lastSyncAt: null,
          lastFullSyncAt: null,
          syncCursor: {
            vendors: null,
            bills: null,
            outOfStockItems: null,
            customers: null,
          },
          vendors: [],
          bills: [],
          outOfStockItems: [],
          customers: [],
        });
      },

      setOffline: (value) => set({ isOffline: value }),

      setLanguage: (language) => {
        set((state) => ({ settings: { ...state.settings, language } }));
        setAppLanguage(language);
      },

      setOverdueThreshold: (days) => {
        set((state) => ({
          settings: {
            ...state.settings,
            overdueThresholdDays: days,
          },
        }));
      },

      setDefaultPaymentMode: (mode) => {
        set((state) => ({
          settings: {
            ...state.settings,
            defaultPaymentMode: mode,
          },
        }));
      },

      setLockOnOpen: (value) => {
        set((state) => ({
          settings: {
            ...state.settings,
            lockOnOpen: value,
          },
        }));
      },

      addBill: async (payload) => {
        assertOnlineForWrite(get().isOffline);
        const state = get();
        const vendorNameNormalized = normalize(payload.vendorName);
        let vendor = state.vendors.find(
          (item) => normalize(item.name) === vendorNameNormalized,
        );

        if (!vendor) {
          vendor = await createVendor({
            name: payload.vendorName,
            phone: null,
            gstNumber: null,
            defaultCollectorName: payload.vendorName,
          });
        }

        if (!vendor) {
          throw new Error('Vendor resolution failed');
        }

        const bill = await createBillRemote({
          billNumber: payload.billNumber,
          vendorId: vendor.id,
          date: payload.date,
          totalAmountPaise: payload.totalAmountPaise,
          imageUrl: payload.imageUrl,
          imageHash: payload.imageHash,
          clientRequestId: payload.clientRequestId,
          lineItems: payload.lineItems.map((item) => ({
            name: item.name,
            qty: item.qty,
            ratePaise: item.ratePaise,
            amountPaise: item.amountPaise,
          })),
        });

        await get().markItemsRestockedByLineItems(
          payload.lineItems.map((item) => item.name),
        );
        set((current) => ({
          vendors: current.vendors.some((item) => item.id === vendor.id)
            ? current.vendors
            : [vendor, ...current.vendors],
          bills: [bill, ...current.bills.filter((item) => item.id !== bill.id)],
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));

        return bill;
      },

      deleteBill: async (billId) => {
        assertOnlineForWrite(get().isOffline);
        await deleteBillRemote(billId);
        set((state) => ({
          bills: state.bills.filter((bill) => bill.id !== billId),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      addPayment: async (billId, payload) => {
        assertOnlineForWrite(get().isOffline);
        const payment = await addPaymentRemote(billId, {
          amountPaise: payload.amountPaise,
          date: payload.date,
          collectorName: payload.collectorName,
          mode: payload.mode ?? get().settings.defaultPaymentMode,
          clientRequestId: payload.clientRequestId,
          notes: payload.notes ?? null,
        });
        set((state) => ({
          bills: state.bills.map((bill) =>
            bill.id === billId
              ? {
                  ...bill,
                  payments: [
                    payment,
                    ...bill.payments.filter((entry) => entry.id !== payment.id),
                  ],
                  updatedAt: new Date().toISOString(),
                }
              : bill,
          ),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      editPayment: async (billId, paymentId, payload) => {
        assertOnlineForWrite(get().isOffline);
        const updatedPayment = await editPaymentRemote(paymentId, {
          amountPaise: payload.amountPaise,
          date: payload.date,
          collectorName: payload.collectorName,
          mode: payload.mode,
          notes: payload.notes,
        });
        set((state) => ({
          bills: state.bills.map((bill) =>
            bill.id === billId
              ? {
                  ...bill,
                  payments: bill.payments.map((payment) =>
                    payment.id === paymentId ? updatedPayment : payment,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : bill,
          ),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      deletePayment: async (billId, paymentId) => {
        assertOnlineForWrite(get().isOffline);
        await deletePaymentRemote(paymentId);
        set((state) => ({
          bills: state.bills.map((bill) =>
            bill.id === billId
              ? {
                  ...bill,
                  payments: bill.payments.filter((payment) => payment.id !== paymentId),
                  updatedAt: new Date().toISOString(),
                }
              : bill,
          ),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      addOutOfStockItem: async (name) => {
        assertOnlineForWrite(get().isOffline);
        const trimmed = name.trim();
        if (!trimmed) {
          return;
        }

        const created = await createOutOfStockItem(trimmed);
        set((state) => ({
          outOfStockItems: [
            created,
            ...state.outOfStockItems.filter((item) => item.id !== created.id),
          ],
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      cycleOutOfStock: async (id) => {
        assertOnlineForWrite(get().isOffline);
        const item = get().outOfStockItems.find((entry) => entry.id === id);
        if (!item) {
          return;
        }

        const updated = await updateOutOfStockStatus(id, cycleStatus[item.status]);
        set((state) => ({
          outOfStockItems: state.outOfStockItems.map((entry) =>
            entry.id === updated.id ? updated : entry,
          ),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      deleteOutOfStockItem: async (id) => {
        assertOnlineForWrite(get().isOffline);
        await deleteOutOfStockItemRemote(id);
        set((state) => ({
          outOfStockItems: state.outOfStockItems.filter((item) => item.id !== id),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      clearOutOfStock: async () => {
        assertOnlineForWrite(get().isOffline);
        await clearOutOfStockItems();
        set({
          outOfStockItems: [],
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        });
      },

      markItemsRestockedByLineItems: async (lineItemNames) => {
        assertOnlineForWrite(get().isOffline);
        const normalizedLineNames = lineItemNames.map((name) => normalize(name));
        const matches = get().outOfStockItems.filter((item) =>
          normalizedLineNames.some(
            (lineItem) =>
              lineItem.includes(normalize(item.itemName)) ||
              normalize(item.itemName).includes(lineItem),
          ),
        );

        if (matches.length === 0) {
          return 0;
        }

        const updatedRows = await Promise.all(
          matches
            .filter((item) => item.status !== 'restocked')
            .map((item) => updateOutOfStockStatus(item.id, 'restocked')),
        );

        if (updatedRows.length > 0) {
          const updateMap = new Map(updatedRows.map((item) => [item.id, item]));
          set((state) => ({
            outOfStockItems: state.outOfStockItems.map((item) =>
              updateMap.get(item.id) ?? item,
            ),
            initialized: true,
            lastSyncAt: new Date().toISOString(),
          }));
        }

        return matches.length;
      },

      addCustomer: async (name, phone) => {
        assertOnlineForWrite(get().isOffline);
        const trimmed = name.trim();
        if (!trimmed) {
          return;
        }

        const created = await createUdhaarCustomer({
          customerName: trimmed,
          phone,
        });
        set((state) => ({
          customers: [
            created,
            ...state.customers.filter((customer) => customer.id !== created.id),
          ],
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      addUdhaarEntry: async (
        customerId,
        type,
        amountPaise,
        description = null,
        date,
      ) => {
        assertOnlineForWrite(get().isOffline);
        if (amountPaise <= 0) {
          return;
        }

        const updatedCustomer = await createUdhaarEntry(customerId, {
          type,
          amountPaise,
          description,
          date: date ?? new Date().toISOString(),
        });
        set((state) => ({
          customers: state.customers.map((customer) =>
            customer.id === updatedCustomer.id ? updatedCustomer : customer,
          ),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      deleteUdhaarEntry: async (customerId, entryId) => {
        assertOnlineForWrite(get().isOffline);
        const updatedCustomer = await deleteUdhaarEntryRemote(entryId);
        set((state) => ({
          customers: state.customers.map((customer) => {
            if (customer.id !== customerId) {
              return customer;
            }

            if (updatedCustomer && updatedCustomer.id === customerId) {
              return updatedCustomer;
            }

            return {
              ...customer,
              entries: customer.entries.filter((entry) => entry.id !== entryId),
            };
          }),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },
    }),
    {
      name: 'kiranatrack-state',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        initialized: state.initialized,
        ownerUserId: state.ownerUserId,
        settings: state.settings,
        vendors: state.vendors,
        bills: state.bills,
        outOfStockItems: state.outOfStockItems,
        customers: state.customers,
        isOffline: state.isOffline,
        lastSyncAt: state.lastSyncAt,
        lastFullSyncAt: state.lastFullSyncAt,
        syncCursor: state.syncCursor,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings.language) {
          setAppLanguage(state.settings.language);
        }
      },
    },
  ),
);
