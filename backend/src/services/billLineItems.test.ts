import { describe, expect, it } from 'vitest';

import {
  isLineItemTotalWithinTolerance,
  sumLineItemAmounts,
} from './billLineItems';

describe('bill line item helpers', () => {
  it('sums line item amounts correctly', () => {
    const total = sumLineItemAmounts([
      { amountPaise: 1_000 },
      { amountPaise: 2_500 },
      { amountPaise: 9_999 },
    ]);

    expect(total).toBe(13_499);
  });

  it('accepts totals within Rs 1 tolerance', () => {
    const valid = isLineItemTotalWithinTolerance(10_000, [
      { amountPaise: 9_950 },
    ]);

    expect(valid).toBe(true);
  });

  it('rejects totals outside tolerance', () => {
    const valid = isLineItemTotalWithinTolerance(10_000, [
      { amountPaise: 9_700 },
    ]);

    expect(valid).toBe(false);
  });
});

