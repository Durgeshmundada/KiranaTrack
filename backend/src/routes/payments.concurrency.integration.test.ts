import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dbQuery, withTransaction } from '../db/postgres';
import { fetchBillFinancialsForUpdate } from '../services/paymentGuards';
import { createAuthedTestApp } from '../test/testApp';
import { billsRouter } from './bills';

vi.mock('../db/postgres', () => ({
  dbQuery: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../services/audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('../services/billing', () => ({
  attachBillSummaries: vi.fn((bills: unknown[]) => bills),
  getPaymentTotalsByBillIds: vi.fn(async () => new Map()),
}));

vi.mock('../services/paymentGuards', async () => {
  const actual = await vi.importActual<typeof import('../services/paymentGuards')>(
    '../services/paymentGuards',
  );
  return {
    ...actual,
    fetchBillFinancialsForUpdate: vi.fn(),
  };
});

const queryResult = <T>(rows: T[]) =>
  ({
    rows,
    rowCount: rows.length,
  }) as never;

describe('payment concurrency guard integration', () => {
  const app = createAuthedTestApp('/api/bills', billsRouter);
  const dbQueryMock = vi.mocked(dbQuery);
  const withTransactionMock = vi.mocked(withTransaction);
  const fetchBillFinancialsForUpdateMock = vi.mocked(fetchBillFinancialsForUpdate);

  beforeEach(() => {
    withTransactionMock.mockImplementation(async (fn) => fn({} as never));
    dbQueryMock.mockImplementation(async (text: string) => {
      if (text.includes('insert into payments')) {
        return queryResult([
          {
            id: 'dddddddddddddddddddddddd',
            bill_id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            amount_paise: 1000,
            date: new Date('2026-03-01T00:00:00.000Z'),
            collector_name: 'Collector',
            mode: 'cash',
            notes: null,
            created_at: new Date('2026-03-01T00:00:00.000Z'),
            updated_at: new Date('2026-03-01T00:00:00.000Z'),
          },
        ]);
      }
      return queryResult([]);
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    withTransactionMock.mockImplementation(async (fn) => fn({} as never));
  });

  it('allows first payment and rejects concurrent overpayment', async () => {
    fetchBillFinancialsForUpdateMock
      .mockResolvedValueOnce({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        total_amount_paise: 10000,
        paid_paise: 9000,
      })
      .mockResolvedValueOnce({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        total_amount_paise: 10000,
        paid_paise: 10000,
      });

    const payload = {
      amountPaise: 1000,
      date: '2026-03-01T00:00:00.000Z',
      collectorName: 'Collector',
      mode: 'cash',
      notes: null,
    };

    const [first, second] = await Promise.all([
      request(app).post('/api/bills/aaaaaaaaaaaaaaaaaaaaaaaa/payments').send(payload),
      request(app).post('/api/bills/aaaaaaaaaaaaaaaaaaaaaaaa/payments').send(payload),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 409]);
  });
});
