import { describe, expect, it } from 'vitest';

import type { Bill } from '@/types/models';
import { computeBillStatus, remainingPaise, totalPaidPaise } from './status';

const daysAgoIso = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const billTemplate = (overrides: Partial<Bill> = {}): Bill => ({
  id: 'bill-test',
  billNumber: 'INV-001',
  vendorId: 'vendor-1',
  date: daysAgoIso(5),
  totalAmountPaise: 100000,
  imageUrl: 'https://example.com/image.jpg',
  imageHash: 'hash',
  lineItems: [],
  createdAt: daysAgoIso(5),
  updatedAt: daysAgoIso(5),
  payments: [],
  ...overrides,
});

describe('status utils', () => {
  it('calculates paid and remaining correctly', () => {
    const bill = billTemplate({
      payments: [
        {
          id: 'p1',
          billId: 'bill-test',
          amountPaise: 25000,
          date: daysAgoIso(4),
          collectorName: null,
          mode: 'cash',
          notes: null,
          createdAt: daysAgoIso(4),
          editLog: [],
        },
      ],
    });

    expect(totalPaidPaise(bill)).toBe(25000);
    expect(remainingPaise(bill)).toBe(75000);
  });

  it('returns overdue when bill is old and unpaid', () => {
    const bill = billTemplate({ date: daysAgoIso(45) });
    expect(computeBillStatus(bill, 30)).toBe('overdue');
  });
});
