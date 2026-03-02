import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorageMap = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageMap.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageMap.delete(key);
    }),
  },
}));

vi.mock('@/i18n', () => ({
  setAppLanguage: vi.fn(),
}));

vi.mock('@/services/backendData', () => ({
  addPayment: vi.fn(),
  clearOutOfStockItems: vi.fn(),
  createBill: vi.fn(),
  createOutOfStockItem: vi.fn(),
  createUdhaarCustomer: vi.fn(),
  createUdhaarEntry: vi.fn(),
  createVendor: vi.fn(),
  deleteBill: vi.fn(),
  deleteOutOfStockItem: vi.fn(),
  deletePayment: vi.fn(),
  deleteUdhaarEntry: vi.fn(),
  editPayment: vi.fn(),
  fetchBillsWithPayments: vi.fn(),
  fetchOutOfStockItems: vi.fn(),
  fetchUdhaarCustomers: vi.fn(),
  fetchVendors: vi.fn(),
  updateOutOfStockStatus: vi.fn(),
}));

import {
  addPayment,
  deletePayment,
  editPayment,
  fetchBillsWithPayments,
  fetchOutOfStockItems,
  fetchUdhaarCustomers,
  fetchVendors,
} from '@/services/backendData';
import { useAppStore } from '@/store/appStore';

const addPaymentMock = vi.mocked(addPayment);
const editPaymentMock = vi.mocked(editPayment);
const deletePaymentMock = vi.mocked(deletePayment);
const fetchVendorsMock = vi.mocked(fetchVendors);
const fetchBillsWithPaymentsMock = vi.mocked(fetchBillsWithPayments);
const fetchOutOfStockItemsMock = vi.mocked(fetchOutOfStockItems);
const fetchUdhaarCustomersMock = vi.mocked(fetchUdhaarCustomers);

const resetStore = () => {
  useAppStore.setState({
    ownerUserId: 'owner-1',
    initialized: true,
    loadingData: false,
    lastSyncAt: null,
    lastFullSyncAt: null,
    syncCursor: {
      vendors: null,
      bills: null,
      outOfStockItems: null,
      customers: null,
    },
    settings: {
      language: 'en',
      overdueThresholdDays: 30,
      defaultPaymentMode: 'cash',
      lockOnOpen: false,
    },
    vendors: [],
    bills: [
      {
        id: 'bill-1',
        billNumber: 'INV-1',
        vendorId: 'vendor-1',
        date: '2026-03-01T00:00:00.000Z',
        totalAmountPaise: 10000,
        imageUrl: 'https://example.com/bill.jpg',
        imageHash: 'hash',
        lineItems: [],
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
        payments: [],
      },
    ],
    outOfStockItems: [],
    customers: [],
    isOffline: false,
  });
};

describe('appStore e2e-like flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asyncStorageMap.clear();
    resetStore();
  });

  it('handles payment add/edit/delete flow', async () => {
    addPaymentMock.mockResolvedValue({
      id: 'payment-1',
      billId: 'bill-1',
      amountPaise: 2000,
      date: '2026-03-01T00:00:00.000Z',
      collectorName: 'Collector',
      mode: 'cash',
      notes: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      editLog: [],
    });
    editPaymentMock.mockResolvedValue({
      id: 'payment-1',
      billId: 'bill-1',
      amountPaise: 2500,
      date: '2026-03-01T00:00:00.000Z',
      collectorName: 'Collector',
      mode: 'cash',
      notes: 'updated',
      createdAt: '2026-03-01T00:00:00.000Z',
      editLog: [
        {
          editedAt: '2026-03-01T01:00:00.000Z',
          previousAmountPaise: 2000,
          previousDate: '2026-03-01T00:00:00.000Z',
        },
      ],
    });
    deletePaymentMock.mockResolvedValue(undefined);

    await useAppStore.getState().addPayment('bill-1', {
      amountPaise: 2000,
      date: '2026-03-01T00:00:00.000Z',
      collectorName: 'Collector',
      mode: 'cash',
      notes: null,
    });
    expect(useAppStore.getState().bills[0]?.payments).toHaveLength(1);

    await useAppStore.getState().editPayment('bill-1', 'payment-1', {
      amountPaise: 2500,
      date: '2026-03-01T00:00:00.000Z',
      collectorName: 'Collector',
      mode: 'cash',
      notes: 'updated',
    });
    expect(useAppStore.getState().bills[0]?.payments[0]?.amountPaise).toBe(2500);

    await useAppStore.getState().deletePayment('bill-1', 'payment-1');
    expect(useAppStore.getState().bills[0]?.payments).toHaveLength(0);
  });

  it('recovers sync after offline/partial failures', async () => {
    useAppStore.getState().setOffline(true);
    await expect(
      useAppStore.getState().addPayment('bill-1', {
        amountPaise: 2000,
        date: '2026-03-01T00:00:00.000Z',
        collectorName: 'Collector',
        mode: 'cash',
        notes: null,
      }),
    ).rejects.toThrow('offline');

    useAppStore.getState().setOffline(false);

    fetchVendorsMock.mockResolvedValueOnce([
      {
        id: 'vendor-1',
        name: 'Vendor 1',
        phone: null,
        gstNumber: null,
        defaultCollectorName: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    fetchBillsWithPaymentsMock.mockRejectedValueOnce(new Error('network'));
    fetchOutOfStockItemsMock.mockRejectedValueOnce(new Error('network'));
    fetchUdhaarCustomersMock.mockResolvedValueOnce([]);

    await useAppStore.getState().syncAll();
    expect(useAppStore.getState().vendors).toHaveLength(1);
    expect(useAppStore.getState().bills).toHaveLength(1);

    fetchVendorsMock.mockResolvedValueOnce([
      {
        id: 'vendor-1',
        name: 'Vendor 1',
        phone: null,
        gstNumber: null,
        defaultCollectorName: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    fetchBillsWithPaymentsMock.mockResolvedValueOnce([
      {
        id: 'bill-2',
        billNumber: 'INV-2',
        vendorId: 'vendor-1',
        date: '2026-03-02T00:00:00.000Z',
        totalAmountPaise: 12000,
        imageUrl: 'https://example.com/bill2.jpg',
        imageHash: 'hash-2',
        lineItems: [],
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
        payments: [],
      },
    ]);
    fetchOutOfStockItemsMock.mockResolvedValueOnce([]);
    fetchUdhaarCustomersMock.mockResolvedValueOnce([]);

    await useAppStore.getState().syncAll();
    expect(useAppStore.getState().bills.some((bill) => bill.id === 'bill-2')).toBe(true);
  });
});
