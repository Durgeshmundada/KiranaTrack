import { describe, expect, it } from 'vitest';

import { toIsoFromDateInput } from '@/utils/dateInput';

describe('toIsoFromDateInput', () => {
  it('parses valid yyyy-mm-dd date', () => {
    expect(toIsoFromDateInput('2026-02-27')).toBe('2026-02-27T00:00:00.000Z');
  });

  it('rejects invalid formats', () => {
    expect(toIsoFromDateInput('27-02-2026')).toBeNull();
    expect(toIsoFromDateInput('2026/02/27')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(toIsoFromDateInput('2026-02-31')).toBeNull();
  });
});
