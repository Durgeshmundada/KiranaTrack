import { describe, expect, it } from 'vitest';

import { createPaymentSchema, parseBillImageSchema } from './schemas';

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
});
