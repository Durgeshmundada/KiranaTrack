import { authApiRequest } from '@/services/backendClient';
import type {
  Bill,
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
});

const toUdhaarCustomer = (row: RawUdhaarCustomer): UdhaarCustomer => ({
  id: row._id,
  customerName: row.customerName,
  phone: row.phone,
  createdAt: row.createdAt,
  entries: row.entries.map((entry) => ({
    id: entry._id,
    type: entry.type,
    amountPaise: entry.amountPaise,
    description: entry.description,
    date: entry.date,
  })),
});

export const fetchVendors = async (): Promise<Vendor[]> => {
  const response = await authApiRequest<ApiEnvelope<RawVendor[]>>('/api/vendors', {
    method: 'GET',
  });
  return response.data.map(toVendor);
};

export const fetchBillsWithPayments = async (): Promise<Bill[]> => {
  const listResponse = await authApiRequest<ApiEnvelope<RawBill[]>>(
    '/api/bills?includePayments=true',
    {
      method: 'GET',
      timeoutMs: 20000,
    },
  );

  return listResponse.data.map(toBill).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const fetchOutOfStockItems = async (): Promise<OutOfStockItem[]> => {
  const response = await authApiRequest<ApiEnvelope<RawOutOfStockItem[]>>(
    '/api/outofstock',
    {
      method: 'GET',
    },
  );
  return response.data.map(toOutOfStockItem);
};

export const fetchUdhaarCustomers = async (): Promise<UdhaarCustomer[]> => {
  const response = await authApiRequest<ApiEnvelope<RawUdhaarCustomer[]>>(
    '/api/udhaar',
    {
      method: 'GET',
    },
  );

  return response.data.map(toUdhaarCustomer);
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
