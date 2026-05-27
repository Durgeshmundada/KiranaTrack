import { authApiRequest } from '@/services/backendClient';
import type {
  Bill,
  AppSubscriptionStatus,
  OutOfStockItem,
  Payment,
  UdhaarCustomer,
  Vendor,
} from '@/types/models';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface RawVendor {
  _id: string;
  name: string;
  phone: string | null;
  gstNumber: string | null;
  defaultCollectorName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawPayment {
  _id: string;
  billId: string;
  amountPaise: number;
  date: string;
  collectorName: string | null;
  mode: Payment['mode'];
  notes: string | null;
  createdAt: string;
  editLog: Array<{
    editedAt: string;
    previousAmountPaise: number;
    previousDate: string;
  }>;
}

interface RawLineItem {
  name: string;
  qty: number;
  ratePaise: number;
  amountPaise: number;
}

interface RawBill {
  _id: string;
  billNumber: string;
  vendorId:
    | string
    | {
        _id: string;
        name?: string;
      };
  date: string;
  totalAmountPaise: number;
  imageUrl: string;
  imageHash: string;
  lineItems: RawLineItem[];
  createdAt: string;
  updatedAt: string;
  payments?: RawPayment[];
}

interface RawOutOfStockItem {
  _id: string;
  itemName: string;
  status: OutOfStockItem['status'];
  createdAt: string;
  updatedAt: string;
}

interface RawUdhaarEntry {
  _id: string;
  type: 'credit' | 'repayment';
  amountPaise: number;
  description: string | null;
  date: string;
}

interface RawUdhaarCustomer {
  _id: string;
  customerName: string;
  phone: string | null;
  entries: RawUdhaarEntry[];
  createdAt: string;
  updatedAt: string;
}

interface PaginatedApiData<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface RawAnalyticsSummary {
  outstandingPaise: number;
  receivablePaise: number;
  netPositionPaise: number;
}

interface RawVendorOutstanding {
  vendorId: string;
  vendorName: string;
  outstandingPaise: number;
}

interface RawMonthlySpendPoint {
  month: string;
  totalPaidPaise: number;
}

interface RawPriceAnomaly {
  vendorName: string;
  itemName: string;
  latestRatePaise: number;
  averageRatePaise: number;
  differencePaise: number;
  billNumber: string;
}

export const generateClientRequestId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const toVendor = (row: RawVendor): Vendor => ({
  id: row._id,
  name: row.name,
  phone: row.phone,
  gstNumber: row.gstNumber,
  defaultCollectorName: row.defaultCollectorName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toPayment = (row: RawPayment): Payment => ({
  id: row._id,
  billId: row.billId,
  amountPaise: row.amountPaise,
  date: row.date,
  collectorName: row.collectorName,
  mode: row.mode,
  notes: row.notes,
  createdAt: row.createdAt,
  editLog: row.editLog.map((item) => ({
    editedAt: item.editedAt,
    previousAmountPaise: item.previousAmountPaise,
    previousDate: item.previousDate,
  })),
});

const toBill = (row: RawBill): Bill => {
  const vendorId =
    typeof row.vendorId === 'string' ? row.vendorId : row.vendorId._id;

  return {
    id: row._id,
    billNumber: row.billNumber,
    vendorId,
    date: row.date,
    totalAmountPaise: row.totalAmountPaise,
    imageUrl: row.imageUrl,
    imageHash: row.imageHash,
    lineItems: (row.lineItems ?? []).map((item, index) => ({
      id: `${row._id}-li-${index + 1}`,
      name: item.name,
      qty: item.qty,
      ratePaise: item.ratePaise,
      amountPaise: item.amountPaise,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    payments: (row.payments ?? []).map(toPayment),
  };
};

const toOutOfStockItem = (row: RawOutOfStockItem): OutOfStockItem => ({
  id: row._id,
  itemName: row.itemName,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toUdhaarCustomer = (row: RawUdhaarCustomer): UdhaarCustomer => ({
  id: row._id,
  customerName: row.customerName,
  phone: row.phone,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  entries: row.entries.map((entry) => ({
    id: entry._id,
    type: entry.type,
    amountPaise: entry.amountPaise,
    description: entry.description,
    date: entry.date,
  })),
});

const withUpdatedAfter = (path: string, updatedAfter?: string): string => {
  if (!updatedAfter) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}updatedAfter=${encodeURIComponent(updatedAfter)}`;
};

const toArrayPayload = <T>(
  data: T[] | PaginatedApiData<T>,
): T[] => {
  if (Array.isArray(data)) {
    return data;
  }
  return data.items ?? [];
};

export const fetchVendors = async (options?: {
  updatedAfter?: string;
}): Promise<Vendor[]> => {
  const response = await authApiRequest<ApiEnvelope<RawVendor[]>>(
    withUpdatedAfter('/api/vendors', options?.updatedAfter),
    {
    method: 'GET',
    },
  );
  return response.data.map(toVendor);
};

export const fetchBillsWithPayments = async (options?: {
  updatedAfter?: string;
}): Promise<Bill[]> => {
  if (!options?.updatedAfter) {
    const listResponse = await authApiRequest<ApiEnvelope<RawBill[]>>(
      '/api/bills?includePayments=true',
      {
        method: 'GET',
        timeoutMs: 20000,
      },
    );

    return listResponse.data.map(toBill).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const pageSize = 100;
  let page = 1;
  const rows: RawBill[] = [];

  while (true) {
    const response = await authApiRequest<
      ApiEnvelope<RawBill[] | PaginatedApiData<RawBill>>
    >(
      `/api/bills?includePayments=true&page=${page}&pageSize=${pageSize}&updatedAfter=${encodeURIComponent(options.updatedAfter)}`,
      {
        method: 'GET',
        timeoutMs: 20000,
      },
    );

    const payloadRows = toArrayPayload(response.data);
    rows.push(...payloadRows);

    if (!Array.isArray(response.data)) {
      if (page >= response.data.totalPages) {
        break;
      }
      page += 1;
      continue;
    }

    if (payloadRows.length < pageSize) {
      break;
    }
    page += 1;
  }

  return rows.map(toBill).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const fetchOutOfStockItems = async (options?: {
  updatedAfter?: string;
}): Promise<OutOfStockItem[]> => {
  const response = await authApiRequest<ApiEnvelope<RawOutOfStockItem[]>>(
    withUpdatedAfter('/api/outofstock', options?.updatedAfter),
    {
      method: 'GET',
    },
  );
  return response.data.map(toOutOfStockItem);
};

export const fetchUdhaarCustomers = async (options?: {
  updatedAfter?: string;
}): Promise<UdhaarCustomer[]> => {
  const response = await authApiRequest<ApiEnvelope<RawUdhaarCustomer[]>>(
    withUpdatedAfter('/api/udhaar', options?.updatedAfter),
    {
      method: 'GET',
    },
  );

  return response.data.map(toUdhaarCustomer);
};

export const fetchAnalyticsSummary = async (): Promise<RawAnalyticsSummary> => {
  const response = await authApiRequest<ApiEnvelope<RawAnalyticsSummary>>(
    '/api/analytics/summary',
    {
      method: 'GET',
    },
  );
  return response.data;
};

export const fetchVendorOutstandingAnalytics = async (): Promise<RawVendorOutstanding[]> => {
  const response = await authApiRequest<ApiEnvelope<RawVendorOutstanding[]>>(
    '/api/analytics/vendor-wise',
    {
      method: 'GET',
    },
  );
  return response.data;
};

export const fetchMonthlySpendAnalytics = async (): Promise<RawMonthlySpendPoint[]> => {
  const response = await authApiRequest<ApiEnvelope<RawMonthlySpendPoint[]>>(
    '/api/analytics/monthly-spend',
    {
      method: 'GET',
    },
  );
  return response.data;
};

export const fetchPriceAnomaliesAnalytics = async (): Promise<RawPriceAnomaly[]> => {
  const response = await authApiRequest<ApiEnvelope<RawPriceAnomaly[]>>(
    '/api/analytics/price-anomalies',
    {
      method: 'GET',
    },
  );
  return response.data;
};

export const createVendor = async (payload: {
  name: string;
  phone?: string | null;
  gstNumber?: string | null;
  defaultCollectorName?: string | null;
}): Promise<Vendor> => {
  const response = await authApiRequest<ApiEnvelope<RawVendor>>('/api/vendors', {
    method: 'POST',
    body: payload,
  });
  return toVendor(response.data);
};

export const createBill = async (payload: {
  billNumber: string;
  vendorId: string;
  date: string;
  totalAmountPaise: number;
  imageUrl: string;
  imageHash: string;
  clientRequestId?: string;
  lineItems: Array<{
    name: string;
    qty: number;
    ratePaise: number;
    amountPaise: number;
  }>;
}): Promise<Bill> => {
  const response = await authApiRequest<ApiEnvelope<RawBill>>('/api/bills', {
    method: 'POST',
    body: {
      ...payload,
      clientRequestId: payload.clientRequestId ?? generateClientRequestId('bill'),
    },
  });
  return toBill(response.data);
};

export const deleteBill = async (billId: string): Promise<void> => {
  await authApiRequest(`/api/bills/${billId}`, {
    method: 'DELETE',
  });
};

export const addPayment = async (
  billId: string,
  payload: {
    amountPaise: number;
    date: string;
    collectorName: string | null;
    mode: Payment['mode'];
    clientRequestId?: string;
    notes?: string | null;
  },
): Promise<Payment> => {
  const response = await authApiRequest<ApiEnvelope<RawPayment>>(
    `/api/bills/${billId}/payments`,
    {
      method: 'POST',
      body: {
        ...payload,
        clientRequestId: payload.clientRequestId ?? generateClientRequestId('payment'),
      },
    },
  );
  return toPayment(response.data);
};

export const editPayment = async (
  paymentId: string,
  payload: {
    amountPaise: number;
    date: string;
    collectorName?: string | null;
    mode?: Payment['mode'];
    notes?: string | null;
  },
): Promise<Payment> => {
  const response = await authApiRequest<ApiEnvelope<RawPayment>>(
    `/api/payments/${paymentId}`,
    {
      method: 'PUT',
      body: payload,
    },
  );
  return toPayment(response.data);
};

export const deletePayment = async (paymentId: string): Promise<void> => {
  await authApiRequest(`/api/payments/${paymentId}`, {
    method: 'DELETE',
  });
};

export const createOutOfStockItem = async (
  itemName: string,
): Promise<OutOfStockItem> => {
  const response = await authApiRequest<ApiEnvelope<RawOutOfStockItem>>('/api/outofstock', {
    method: 'POST',
    body: { itemName },
  });
  return toOutOfStockItem(response.data);
};

export const updateOutOfStockStatus = async (
  id: string,
  status: OutOfStockItem['status'],
): Promise<OutOfStockItem> => {
  const response = await authApiRequest<ApiEnvelope<RawOutOfStockItem>>(
    `/api/outofstock/${id}`,
    {
      method: 'PUT',
      body: { status },
    },
  );
  return toOutOfStockItem(response.data);
};

export const deleteOutOfStockItem = async (id: string): Promise<void> => {
  await authApiRequest(`/api/outofstock/${id}`, {
    method: 'DELETE',
  });
};

export const clearOutOfStockItems = async (): Promise<number> => {
  const response = await authApiRequest<ApiEnvelope<{ deletedCount?: number }>>(
    '/api/outofstock',
    {
      method: 'DELETE',
    },
  );
  return response.data.deletedCount ?? 0;
};

export const createUdhaarCustomer = async (payload: {
  customerName: string;
  phone: string | null;
}): Promise<UdhaarCustomer> => {
  const response = await authApiRequest<ApiEnvelope<RawUdhaarCustomer>>('/api/udhaar', {
    method: 'POST',
    body: payload,
  });
  return toUdhaarCustomer(response.data);
};

export const createUdhaarEntry = async (
  customerId: string,
  payload: {
    type: 'credit' | 'repayment';
    amountPaise: number;
    description?: string | null;
    date: string;
  },
): Promise<UdhaarCustomer> => {
  const response = await authApiRequest<ApiEnvelope<RawUdhaarCustomer>>(
    `/api/udhaar/${customerId}/entries`,
    {
      method: 'POST',
      body: payload,
    },
  );
  return toUdhaarCustomer(response.data);
};

export const deleteUdhaarEntry = async (
  entryId: string,
): Promise<UdhaarCustomer | null> => {
  const response = await authApiRequest<
    ApiEnvelope<{ deleted: boolean; customer: RawUdhaarCustomer | null }>
  >(`/api/udhaar/entries/${entryId}`, {
    method: 'DELETE',
  });
  return response.data.customer ? toUdhaarCustomer(response.data.customer) : null;
};

export const fetchSubscriptionStatus = async (): Promise<AppSubscriptionStatus> => {
  const response = await authApiRequest<ApiEnvelope<AppSubscriptionStatus>>(
    '/api/subscription/status',
    {
      method: 'GET',
    },
  );
  return response.data;
};

export const startSubscription = async (): Promise<AppSubscriptionStatus> => {
  const response = await authApiRequest<ApiEnvelope<AppSubscriptionStatus>>(
    '/api/subscription/start',
    {
      method: 'POST',
      timeoutMs: 15000,
    },
  );
  return response.data;
};

export const refreshSubscription = async (): Promise<AppSubscriptionStatus> => {
  const response = await authApiRequest<ApiEnvelope<AppSubscriptionStatus>>(
    '/api/subscription/refresh',
    {
      method: 'POST',
      timeoutMs: 15000,
    },
  );
  return response.data;
};

export const cancelSubscription = async (): Promise<AppSubscriptionStatus> => {
  const response = await authApiRequest<ApiEnvelope<AppSubscriptionStatus>>(
    '/api/subscription/cancel',
    {
      method: 'POST',
      timeoutMs: 15000,
    },
  );
  return response.data;
};
