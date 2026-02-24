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
  lineItems: Bill['lineItems'];
};

type NewPaymentPayload = {
  amountPaise: number;
  date: string;
  collectorName: string | null;
  mode?: PaymentMode;
  notes?: string | null;
};

interface AppStoreState {
  initialized: boolean;
  loadingData: boolean;
  lastSyncAt: string | null;
  settings: AppSettings;
  vendors: Vendor[];
  bills: Bill[];
  outOfStockItems: OutOfStockItem[];
  customers: UdhaarCustomer[];
  isOffline: boolean;

  bootstrap: () => Promise<void>;
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
    payload: Pick<NewPaymentPayload, 'amountPaise' | 'date'>,
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

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      initialized: false,
      loadingData: false,
      lastSyncAt: null,
      settings: DEFAULT_SETTINGS,
      vendors: [],
      bills: [],
      outOfStockItems: [],
      customers: [],
      isOffline: false,

      bootstrap: async () => {
        setAppLanguage(get().settings.language);
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
          const results = await Promise.allSettled([
            fetchVendors(),
            fetchBillsWithPayments(),
            fetchOutOfStockItems(),
            fetchUdhaarCustomers(),
          ]);

          const [vendorsResult, billsResult, outOfStockResult, customersResult] =
            results;

          const vendors =
            vendorsResult.status === 'fulfilled'
              ? vendorsResult.value
              : current.vendors;
          const bills =
            billsResult.status === 'fulfilled'
              ? billsResult.value
              : current.bills;
          const outOfStockItems =
            outOfStockResult.status === 'fulfilled'
              ? outOfStockResult.value
              : current.outOfStockItems;
          const customers =
            customersResult.status === 'fulfilled'
              ? customersResult.value
              : current.customers;

          const successCount = results.filter(
            (result) => result.status === 'fulfilled',
          ).length;

          if (successCount === 0) {
            throw new Error('Sync failed');
          }

          set({
            vendors,
            bills,
            outOfStockItems,
            customers,
            initialized: true,
            lastSyncAt: new Date().toISOString(),
          });
        } finally {
          set({ loadingData: false });
        }
      },

      resetData: () => {
        set({
          initialized: false,
          lastSyncAt: null,
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
        await deleteBillRemote(billId);
        set((state) => ({
          bills: state.bills.filter((bill) => bill.id !== billId),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      addPayment: async (billId, payload) => {
        const payment = await addPaymentRemote(billId, {
          amountPaise: payload.amountPaise,
          date: payload.date,
          collectorName: payload.collectorName,
          mode: payload.mode ?? get().settings.defaultPaymentMode,
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
        const updatedPayment = await editPaymentRemote(paymentId, {
          amountPaise: payload.amountPaise,
          date: payload.date,
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
        await deleteOutOfStockItemRemote(id);
        set((state) => ({
          outOfStockItems: state.outOfStockItems.filter((item) => item.id !== id),
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      clearOutOfStock: async () => {
        await clearOutOfStockItems();
        set({
          outOfStockItems: [],
          initialized: true,
          lastSyncAt: new Date().toISOString(),
        });
      },

      markItemsRestockedByLineItems: async (lineItemNames) => {
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
        settings: state.settings,
        vendors: state.vendors,
        bills: state.bills,
        outOfStockItems: state.outOfStockItems,
        customers: state.customers,
        isOffline: state.isOffline,
        lastSyncAt: state.lastSyncAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings.language) {
          setAppLanguage(state.settings.language);
        }
      },
    },
  ),
);
