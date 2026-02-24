const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

const toNumber = (value: number | string): number =>
  typeof value === 'number' ? value : Number(value);

export interface VendorRow {
  id: string;
  name: string;
  phone: string | null;
  gst_number: string | null;
  default_collector_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface VendorDoc {
  _id: string;
  name: string;
  phone: string | null;
  gstNumber: string | null;
  defaultCollectorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toVendorDoc = (row: VendorRow): VendorDoc => ({
  _id: row.id,
  name: row.name,
  phone: row.phone,
  gstNumber: row.gst_number,
  defaultCollectorName: row.default_collector_name,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

export interface BillRow {
  id: string;
  bill_number: string;
  vendor_id: string;
  date: Date | string;
  total_amount_paise: number;
  image_url: string;
  image_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface BillLineItemRow {
  id: string;
  bill_id: string;
  name: string;
  qty: number | string;
  rate_paise: number;
  amount_paise: number;
  created_at: Date | string;
}

export interface BillLineItemDoc {
  name: string;
  qty: number;
  ratePaise: number;
  amountPaise: number;
}

export interface BillDoc {
  _id: string;
  billNumber: string;
  vendorId: string | VendorDoc;
  date: Date;
  totalAmountPaise: number;
  imageUrl: string;
  imageHash: string;
  lineItems: BillLineItemDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export const toBillLineItemDoc = (row: BillLineItemRow): BillLineItemDoc => ({
  name: row.name,
  qty: toNumber(row.qty),
  ratePaise: row.rate_paise,
  amountPaise: row.amount_paise,
});

export const toBillDoc = (
  row: BillRow,
  lineItems: BillLineItemDoc[],
  vendorId: string | VendorDoc,
): BillDoc => ({
  _id: row.id,
  billNumber: row.bill_number,
  vendorId,
  date: toDate(row.date),
  totalAmountPaise: row.total_amount_paise,
  imageUrl: row.image_url,
  imageHash: row.image_hash,
  lineItems,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'other';

export interface PaymentRow {
  id: string;
  bill_id: string;
  amount_paise: number;
  date: Date | string;
  collector_name: string | null;
  mode: PaymentMode;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PaymentEditLogRow {
  id: string;
  payment_id: string;
  edited_at: Date | string;
  previous_amount_paise: number;
  previous_date: Date | string;
}

export interface PaymentEditLogDoc {
  editedAt: Date;
  previousAmountPaise: number;
  previousDate: Date;
}

export interface PaymentDoc {
  _id: string;
  billId: string;
  amountPaise: number;
  date: Date;
  collectorName: string | null;
  mode: PaymentMode;
  notes: string | null;
  editLog: PaymentEditLogDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export const toPaymentEditLogDoc = (
  row: PaymentEditLogRow,
): PaymentEditLogDoc => ({
  editedAt: toDate(row.edited_at),
  previousAmountPaise: row.previous_amount_paise,
  previousDate: toDate(row.previous_date),
});

export const toPaymentDoc = (
  row: PaymentRow,
  editLog: PaymentEditLogDoc[],
): PaymentDoc => ({
  _id: row.id,
  billId: row.bill_id,
  amountPaise: row.amount_paise,
  date: toDate(row.date),
  collectorName: row.collector_name,
  mode: row.mode,
  notes: row.notes,
  editLog,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

export type OutOfStockStatus = 'pending' | 'ordered' | 'restocked';

export interface OutOfStockItemRow {
  id: string;
  item_name: string;
  status: OutOfStockStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface OutOfStockItemDoc {
  _id: string;
  itemName: string;
  status: OutOfStockStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const toOutOfStockItemDoc = (
  row: OutOfStockItemRow,
): OutOfStockItemDoc => ({
  _id: row.id,
  itemName: row.item_name,
  status: row.status,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

export type UdhaarEntryType = 'credit' | 'repayment';

export interface UdhaarCustomerRow {
  id: string;
  customer_name: string;
  phone: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface UdhaarEntryRow {
  id: string;
  customer_id: string;
  type: UdhaarEntryType;
  amount_paise: number;
  description: string | null;
  date: Date | string;
  created_at: Date | string;
}

export interface UdhaarEntryDoc {
  _id: string;
  type: UdhaarEntryType;
  amountPaise: number;
  description: string | null;
  date: Date;
}

export interface UdhaarCustomerDoc {
  _id: string;
  customerName: string;
  phone: string | null;
  entries: UdhaarEntryDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export const toUdhaarEntryDoc = (row: UdhaarEntryRow): UdhaarEntryDoc => ({
  _id: row.id,
  type: row.type,
  amountPaise: row.amount_paise,
  description: row.description,
  date: toDate(row.date),
});

export const toUdhaarCustomerDoc = (
  row: UdhaarCustomerRow,
  entries: UdhaarEntryDoc[],
): UdhaarCustomerDoc => ({
  _id: row.id,
  customerName: row.customer_name,
  phone: row.phone,
  entries,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});
