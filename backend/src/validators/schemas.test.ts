import { describe, expect, it } from 'vitest';

import {
  billsQuerySchema,
  createBillSchema,
  createPaymentSchema,
  parseBillImageSchema,
  parseBillTextSchema,
} from './schemas';

describe('schema validation', () => {
  it('validates payment payload', () => {
    const parsed = createPaymentSchema.parse({
      amountPaise: 120000,
      date: '2026-02-22',
      collectorName: 'Raju',
      mode: 'cash',
      notes: null,
    });

    expect(parsed.amountPaise).toBe(120000);
    expect(parsed.mode).toBe('cash');
  });

  it('rejects invalid image data URL', () => {
    const result = parseBillImageSchema.safeParse({
      imageDataUrl: 'not-a-data-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects oversized OCR text payload', () => {
    const result = parseBillTextSchema.safeParse({
      text: 'A'.repeat(30_001),
    });

    expect(result.success).toBe(false);
  });

  it('rejects future payment date', () => {
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = createPaymentSchema.safeParse({
      amountPaise: 1000,
      date: twoDaysFromNow,
      collectorName: 'Raju',
      mode: 'cash',
      notes: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects bill payload when line item total mismatches bill total', () => {
    const result = createBillSchema.safeParse({
      billNumber: 'INV-1',
      vendorId: '0123456789abcdef01234567',
      date: '2026-02-24',
      totalAmountPaise: 10_000,
      imageUrl: 'https://example.com/bill.jpg',
      imageHash: 'hash-1',
      lineItems: [
        {
          name: 'Rice',
          qty: 1,
          ratePaise: 9_000,
          amountPaise: 9_000,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects bills query when dateFrom is after dateTo', () => {
    const result = billsQuerySchema.safeParse({
      dateFrom: '2026-02-27',
      dateTo: '2026-02-20',
    });

    expect(result.success).toBe(false);
  });
});
