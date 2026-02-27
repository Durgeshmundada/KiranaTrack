import { z } from 'zod';
import { isLineItemTotalWithinTolerance } from '../services/billLineItems';

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const nonFutureDateSchema = z.coerce
  .date()
  .refine(
    (value) => value.getTime() <= Date.now() + DAY_IN_MS,
    'Date cannot be in the future',
  );

const paiseSchema = z
  .number()
  .int('Amount must be an integer paise value')
  .nonnegative()
  .max(1_000_000_000);

const lineItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  qty: z.number().positive().max(100_000),
  ratePaise: paiseSchema,
  amountPaise: paiseSchema,
});

const billFieldSchema = {
  billNumber: z.string().trim().min(1).max(64),
  vendorId: objectIdSchema,
  date: nonFutureDateSchema,
  totalAmountPaise: paiseSchema.positive(),
  imageUrl: z.string().url(),
  imageHash: z.string().trim().min(1).max(255),
  clientRequestId: z.string().trim().min(8).max(100).optional(),
};

export const createBillSchema = z
  .object({
    ...billFieldSchema,
    lineItems: z.array(lineItemSchema).max(200).default([]),
  })
  .superRefine((value, context) => {
    if (!isLineItemTotalWithinTolerance(value.totalAmountPaise, value.lineItems)) {
      context.addIssue({
        code: 'custom',
        path: ['lineItems'],
        message: 'Line item total must match bill total (within Rs 1 tolerance)',
      });
    }
  });

export const updateBillSchema = z
  .object({
    billNumber: billFieldSchema.billNumber.optional(),
    vendorId: billFieldSchema.vendorId.optional(),
    date: billFieldSchema.date.optional(),
    totalAmountPaise: billFieldSchema.totalAmountPaise.optional(),
    imageUrl: billFieldSchema.imageUrl.optional(),
    imageHash: billFieldSchema.imageHash.optional(),
    lineItems: z.array(lineItemSchema).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.totalAmountPaise !== undefined &&
      value.lineItems !== undefined &&
      !isLineItemTotalWithinTolerance(value.totalAmountPaise, value.lineItems)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lineItems'],
        message: 'Line item total must match bill total (within Rs 1 tolerance)',
      });
    }
  });

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

const optionalQueryDateSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}, z.coerce.date());

export const billsQuerySchema = z.object({
  status: z.enum(['unpaid', 'partial', 'cleared', 'overdue']).optional(),
  vendor: objectIdSchema.optional(),
  dateFrom: optionalQueryDateSchema.optional(),
  dateTo: optionalQueryDateSchema.optional(),
  includePayments: booleanQuerySchema.optional().default(false),
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({
      code: 'custom',
      path: ['dateFrom'],
      message: 'dateFrom cannot be after dateTo',
    });
  }
});

export const createPaymentSchema = z.object({
  amountPaise: paiseSchema.positive(),
  date: nonFutureDateSchema,
  collectorName: z.string().trim().min(1).max(120).nullable().optional(),
  mode: z.enum(['cash', 'upi', 'cheque', 'other']).default('cash'),
  notes: z.string().trim().max(500).nullable().optional(),
  clientRequestId: z.string().trim().min(8).max(100).optional(),
});

export const updatePaymentSchema = z.object({
  amountPaise: paiseSchema.positive(),
  date: nonFutureDateSchema,
  collectorName: z.string().trim().min(1).max(120).nullable().optional(),
  mode: z.enum(['cash', 'upi', 'cheque', 'other']).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  gstNumber: z.string().trim().max(40).nullable().optional(),
  defaultCollectorName: z.string().trim().max(120).nullable().optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const createOutOfStockSchema = z.object({
  itemName: z.string().trim().min(1).max(120),
  status: z.enum(['pending', 'ordered', 'restocked']).optional(),
});

export const updateOutOfStockSchema = z.object({
  status: z.enum(['pending', 'ordered', 'restocked']),
});

export const createUdhaarCustomerSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
});

export const createUdhaarEntrySchema = z.object({
  type: z.enum(['credit', 'repayment']),
  amountPaise: paiseSchema.positive(),
  description: z.string().trim().max(500).nullable().optional(),
  date: nonFutureDateSchema,
});

export const parseBillImageSchema = z.object({
  imageDataUrl: z
    .string()
    .min(64)
    .regex(/^data:image\/(png|jpe?g|webp);base64,/i),
});

export const parseBillTextSchema = z.object({
  text: z.string().trim().min(1).max(30_000),
});

export const authCredentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});
