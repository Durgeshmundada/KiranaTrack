import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dbQuery, withTransaction } from '../db/postgres';
import { recordAuditEvent } from '../services/audit';
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

const queryResult = <T>(rows: T[]) =>
  ({
    rows,
    rowCount: rows.length,
  }) as never;

describe('billsRouter integration', () => {
  const app = createAuthedTestApp('/api/bills', billsRouter);
  const dbQueryMock = vi.mocked(dbQuery);
  const withTransactionMock = vi.mocked(withTransaction);
  const recordAuditEventMock = vi.mocked(recordAuditEvent);

  beforeEach(() => {
    withTransactionMock.mockImplementation(async (fn) => fn({} as never));
  });

  afterEach(() => {
    vi.resetAllMocks();
    withTransactionMock.mockImplementation(async (fn) => fn({} as never));
  });

  it('creates a bill with line items', async () => {
    const createdAt = new Date('2026-03-01T00:00:00.000Z');
    const billRow = {
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      bill_number: 'INV-100',
      vendor_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      date: createdAt,
      total_amount_paise: 10000,
      image_url: 'https://example.com/bill.jpg',
      image_hash: 'hash-123',
      created_at: createdAt,
      updated_at: createdAt,
    };

    dbQueryMock.mockImplementation(async (text: string) => {
      if (text.includes('from vendors')) {
        return queryResult([{ id: billRow.vendor_id }]);
      }
      if (text.includes('from bills') && text.includes('bill_number =')) {
        return queryResult([]);
      }
      if (text.includes('insert into bills')) {
        return queryResult([billRow]);
      }
      if (text.includes('from bill_line_items')) {
        return queryResult([]);
      }
      if (text.includes('insert into bill_line_items')) {
        return queryResult([]);
      }
      return queryResult([]);
    });

    const response = await request(app).post('/api/bills').send({
      billNumber: 'INV-100',
      vendorId: billRow.vendor_id,
      date: createdAt.toISOString(),
      totalAmountPaise: 10000,
      imageUrl: 'https://example.com/bill.jpg',
      imageHash: 'hash-123',
      lineItems: [
        {
          name: 'Oil',
          qty: 1,
          ratePaise: 10000,
          amountPaise: 10000,
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data._id).toBe(billRow.id);
    expect(response.body.data.billNumber).toBe('INV-100');
  });

  it('updates bill metadata and preserves line items', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const billId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const vendorId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const lineItemRow = {
      id: 'cccccccccccccccccccccccc',
      bill_id: billId,
      name: 'Oil',
      qty: 1,
      rate_paise: 10000,
      amount_paise: 10000,
      created_at: now,
    };

    dbQueryMock.mockImplementation(async (text: string) => {
      if (text.includes('from bills') && text.includes('for update')) {
        return queryResult([
          {
            id: billId,
            bill_number: 'INV-100',
            vendor_id: vendorId,
            date: now,
            total_amount_paise: 10000,
            image_url: 'https://example.com/bill.jpg',
            image_hash: 'hash-123',
            created_at: now,
            updated_at: now,
          },
        ]);
      }
      if (text.includes('update bills')) {
        return queryResult([
          {
            id: billId,
            bill_number: 'INV-101',
            vendor_id: vendorId,
            date: now,
            total_amount_paise: 10000,
            image_url: 'https://example.com/bill.jpg',
            image_hash: 'hash-123',
            created_at: now,
            updated_at: now,
          },
        ]);
      }
      if (text.includes('from bill_line_items')) {
        return queryResult([lineItemRow]);
      }
      return queryResult([]);
    });

    const response = await request(app).put(`/api/bills/${billId}`).send({
      billNumber: 'INV-101',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.billNumber).toBe('INV-101');
    expect(response.body.data.lineItems).toHaveLength(1);
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes bill and linked payments', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const billId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const vendorId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

    dbQueryMock.mockImplementation(async (text: string) => {
      if (text.includes('from bills') && text.includes('for update')) {
        return queryResult([
          {
            id: billId,
            bill_number: 'INV-101',
            vendor_id: vendorId,
            date: now,
            total_amount_paise: 10000,
            image_url: 'https://example.com/bill.jpg',
            image_hash: 'hash-123',
            created_at: now,
            updated_at: now,
          },
        ]);
      }
      if (text.includes('update bills') || text.includes('update payments')) {
        return queryResult([]);
      }
      return queryResult([]);
    });

    const response = await request(app).delete(`/api/bills/${billId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.deleted).toBe(true);
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
  });
});
