import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dbQuery, withTransaction } from '../db/postgres';
import { createAuthedTestApp } from '../test/testApp';
import { udhaarRouter } from './udhaar';

vi.mock('../db/postgres', () => ({
  dbQuery: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../services/audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

const queryResult = <T>(rows: T[]) =>
  ({
    rows,
    rowCount: rows.length,
  }) as never;

describe('udhaar repayment guard integration', () => {
  const app = createAuthedTestApp('/api/udhaar', udhaarRouter);
  const dbQueryMock = vi.mocked(dbQuery);
  const withTransactionMock = vi.mocked(withTransaction);

  beforeEach(() => {
    withTransactionMock.mockImplementation(async (fn) => fn({} as never));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects repayment greater than outstanding balance', async () => {
    dbQueryMock
      .mockResolvedValueOnce(queryResult([{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }]))
      .mockResolvedValueOnce(queryResult([{ balance_paise: 500 }]));

    const response = await request(app)
      .post('/api/udhaar/aaaaaaaaaaaaaaaaaaaaaaaa/entries')
      .send({
        type: 'repayment',
        amountPaise: 600,
        description: 'overpayment',
        date: '2026-03-01T00:00:00.000Z',
      });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Repayment exceeds');
  });
});
