import { describe, expect, it } from 'vitest';

import { computeBillPaymentSummary } from './billStatus';

const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

describe('computeBillPaymentSummary', () => {
  it('returns cleared when full payment is done', () => {
    const result = computeBillPaymentSummary(100000, 100000, daysAgo(1), 30);
    expect(result.status).toBe('cleared');
    expect(result.remainingPaise).toBe(0);
  });

  it('returns overdue when unpaid older than threshold', () => {
    const result = computeBillPaymentSummary(100000, 0, daysAgo(45), 30);
    expect(result.status).toBe('overdue');
    expect(result.remainingPaise).toBe(100000);
  });

  it('returns partial for recent partial payment', () => {
    const result = computeBillPaymentSummary(100000, 30000, daysAgo(10), 30);
    expect(result.status).toBe('partial');
    expect(result.remainingPaise).toBe(70000);
  });

  it('returns unpaid for recent unpaid bill', () => {
    const result = computeBillPaymentSummary(100000, 0, daysAgo(4), 30);
    expect(result.status).toBe('unpaid');
  });
});
