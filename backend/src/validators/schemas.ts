import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

const lineItemSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  ratePaise: z.number().nonnegative(),
  amountPaise: z.number().nonnegative(),
});

export const createBillSchema = z.object({
  billNumber: z.string().min(1),
  vendorId: objectIdSchema,
  date: z.coerce.date(),
  totalAmountPaise: z.number().positive(),
  imageUrl: z.string().url(),
  imageHash: z.string().min(1),
  lineItems: z.array(lineItemSchema).default([]),
});

export const updateBillSchema = createBillSchema.partial();

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return value;
}, z.boolean());

export const billsQuerySchema = z.object({
  status: z.enum(['unpaid', 'partial', 'cleared', 'overdue']).optional(),
  vendor: objectIdSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  includePayments: booleanQuerySchema.optional().default(false),
});

export const createPaymentSchema = z.object({
  amountPaise: z.number().positive(),
  date: z.coerce.date(),
  collectorName: z.string().nullable().optional(),
  mode: z.enum(['cash', 'upi', 'cheque', 'other']).default('cash'),
  notes: z.string().nullable().optional(),
});

export const updatePaymentSchema = z.object({
  amountPaise: z.number().positive(),
  date: z.coerce.date(),
  collectorName: z.string().nullable().optional(),
  mode: z.enum(['cash', 'upi', 'cheque', 'other']).optional(),
  notes: z.string().nullable().optional(),
});

export const createVendorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  defaultCollectorName: z.string().nullable().optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const createOutOfStockSchema = z.object({
  itemName: z.string().min(1),
  status: z.enum(['pending', 'ordered', 'restocked']).optional(),
});

export const updateOutOfStockSchema = z.object({
  status: z.enum(['pending', 'ordered', 'restocked']),
});

export const createUdhaarCustomerSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().nullable().optional(),
});

export const createUdhaarEntrySchema = z.object({
  type: z.enum(['credit', 'repayment']),
  amountPaise: z.number().positive(),
  description: z.string().nullable().optional(),
  date: z.coerce.date(),
});

export const parseBillImageSchema = z.object({
  imageDataUrl: z
    .string()
    .min(64)
    .regex(/^data:image\/(png|jpe?g|webp);base64,/i),
});

export const parseBillTextSchema = z.object({
  text: z.string().min(1),
});
