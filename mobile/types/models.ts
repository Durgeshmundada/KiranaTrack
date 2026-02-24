export type Id = string;

export type BillStatus = 'unpaid' | 'partial' | 'cleared' | 'overdue';
export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'other';
export type OutOfStockStatus = 'pending' | 'ordered' | 'restocked';
export type UdhaarEntryType = 'credit' | 'repayment';
export type AppLanguage = 'en' | 'hi' | 'mr';

export interface LineItem {
  id: Id;
  name: string;
  qty: number;
  ratePaise: number;
  amountPaise: number;
}

export interface PaymentEditLog {
  editedAt: string;
  previousAmountPaise: number;
  previousDate: string;
}

export interface Payment {
  id: Id;
  billId: Id;
  amountPaise: number;
  date: string;
  collectorName: string | null;
  mode: PaymentMode;
  notes: string | null;
  createdAt: string;
  editLog: PaymentEditLog[];
}

export interface Bill {
  id: Id;
  billNumber: string;
  vendorId: Id;
  date: string;
  totalAmountPaise: number;
  imageUrl: string;
  imageHash: string;
  lineItems: LineItem[];
  createdAt: string;
  updatedAt: string;
  payments: Payment[];
}

export interface Vendor {
  id: Id;
  name: string;
  phone: string | null;
  gstNumber: string | null;
  defaultCollectorName: string | null;
  createdAt: string;
}

export interface OutOfStockItem {
  id: Id;
  itemName: string;
  status: OutOfStockStatus;
  createdAt: string;
}

export interface UdhaarEntry {
  id: Id;
  type: UdhaarEntryType;
  amountPaise: number;
  description: string | null;
  date: string;
}

export interface UdhaarCustomer {
  id: Id;
  customerName: string;
  phone: string | null;
  entries: UdhaarEntry[];
  createdAt: string;
}

export interface AppSettings {
  language: AppLanguage;
  overdueThresholdDays: number;
  defaultPaymentMode: PaymentMode;
  lockOnOpen: boolean;
}

export interface ParsedBillDraft {
  billNumber: string | null;
  vendorName: string | null;
  date: string | null;
  totalAmountPaise: number | null;
  lineItems: Array<{
    name: string;
    qty: number;
    ratePaise: number;
    amountPaise: number;
  }>;
}

export interface DashboardSummary {
  totalOutstandingPaise: number;
  overdueCount: number;
  todaysBills: number;
  pendingNotepadCount: number;
}
