import { describe, expect, it } from 'vitest';

import { formatINRFromPaise, rupeeToPaise } from './currency';

describe('currency utils', () => {
  it('converts rupees to paise', () => {
    expect(rupeeToPaise(123.45)).toBe(12345);
  });

  it('formats INR from paise', () => {
    const formatted = formatINRFromPaise(123400);
    expect(formatted).toContain('₹');
  });
});
