import { describe, expect, it } from 'vitest';

import { HttpError } from '../utils/http';
import { assertPaymentWithinBillLimit } from './paymentGuards';

describe('assertPaymentWithinBillLimit', () => {
  it('allows payment when new total is within bill amount', () => {
    expect(() =>
      assertPaymentWithinBillLimit({
        totalAmountPaise: 50_000,
        alreadyPaidPaise: 20_000,
        paymentAmountPaise: 10_000,
      }),
    ).not.toThrow();
  });

  it('blocks overpayment on create', () => {
    expect(() =>
      assertPaymentWithinBillLimit({
        totalAmountPaise: 50_000,
        alreadyPaidPaise: 45_000,
        paymentAmountPaise: 10_000,
      }),
    ).toThrowError(HttpError);
  });

  it('allows edit when replacing older amount with valid amount', () => {
    expect(() =>
      assertPaymentWithinBillLimit({
        totalAmountPaise: 50_000,
        alreadyPaidPaise: 45_000,
        paymentAmountPaise: 12_000,
        replacingAmountPaise: 10_000,
      }),
    ).not.toThrow();
  });
});
