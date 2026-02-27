import { describe, expect, it } from 'vitest';

import { hasVendorIdentityConflict } from './vendorIdentity';

describe('hasVendorIdentityConflict', () => {
  it('does not treat same normalized identity as conflict', () => {
    const conflict = hasVendorIdentityConflict(
      {
        name: 'Shree Traders',
        phone: '98765 43210',
        gstNumber: '27ABCDE1234F1Z5',
        defaultCollectorName: 'Raju',
      },
      {
        name: '  shree traders ',
        phone: '9876543210',
        gstNumber: '27abcde1234f1z5',
        defaultCollectorName: 'raju',
      },
    );

    expect(conflict).toBe(false);
  });

  it('flags conflict when phone differs for same supplier name', () => {
    const conflict = hasVendorIdentityConflict(
      {
        name: 'Shree Traders',
        phone: '9876543210',
        gstNumber: null,
        defaultCollectorName: null,
      },
      {
        name: 'shree traders',
        phone: '9999999999',
        gstNumber: null,
        defaultCollectorName: null,
      },
    );

    expect(conflict).toBe(true);
  });

  it('flags conflict when GST differs for same supplier name', () => {
    const conflict = hasVendorIdentityConflict(
      {
        name: 'Shree Traders',
        phone: null,
        gstNumber: '27ABCDE1234F1Z5',
        defaultCollectorName: null,
      },
      {
        name: 'Shree Traders',
        phone: null,
        gstNumber: '29ABCDE1234F1Z5',
        defaultCollectorName: null,
      },
    );

    expect(conflict).toBe(true);
  });
});

