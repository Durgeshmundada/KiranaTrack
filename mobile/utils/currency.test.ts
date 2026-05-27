import { describe, expect, it } from 'vitest';

import {
  formatCompactINRFromPaise,
  formatINRFromPaise,
  rupeeToPaise,
} from './currency';

describe('currency utils', () => {
  it('converts rupees to paise', () => {
    expect(rupeeToPaise(123.45)).toBe(12345);
  });

  it('formats INR from paise without decimals', () => {
    expect(formatINRFromPaise(123400)).toBe('\u20b91,234');
  });

  it('formats compact INR using Indian units', () => {
    expect(formatCompactINRFromPaise(30223200)).toBe('\u20b93L');
    expect(formatCompactINRFromPaise(150000)).toBe('\u20b91.5K');
  });
});
