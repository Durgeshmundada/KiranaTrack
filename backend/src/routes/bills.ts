import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import {
  type BillLineItemDoc,
  type BillLineItemRow,
  type BillRow,
  type PaymentEditLogRow,
  type PaymentRow,
  type VendorDoc,
  type VendorRow,
  toBillDoc,
  toBillLineItemDoc,
  toPaymentDoc,
  toPaymentEditLogDoc,
  toVendorDoc,
} from '../db/mappers';
import { dbQuery, withTransaction } from '../db/postgres';
import { recordAuditEvent } from '../services/audit';
import { isLineItemTotalWithinTolerance } from '../services/billLineItems';
import { attachBillSummaries, getPaymentTotalsByBillIds } from '../services/billing';
import {
  assertPaymentWithinBillLimit,
  fetchBillFinancialsForUpdate,
} from '../services/paymentGuards';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { HttpError, notFound, parseBody, parseQuery, sendCreated, sendOk } from '../utils/http';
import {
  billsQuerySchema,
  createBillSchema,
  createPaymentSchema,
  objectIdSchema,
  updateBillSchema,
} from '../validators/schemas';

const idParamSchema = z.object({
  id: objectIdSchema,
});

const billsRouter = Router();
type PaymentDoc = ReturnType<typeof toPaymentDoc>;
type PaymentEditLogDoc = ReturnType<typeof toPaymentEditLogDoc>;
type PgLikeError = {
  code?: string;
  constraint?: string;
};

const isUniqueConstraintError = (
  error: unknown,
  constraint: string,
): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as PgLikeError;
  return pgError.code === '23505' && pgError.constraint === constraint;
};

const fetchLineItemsByBillIds = async (
  billIds: string[],
): Promise<Map<string, BillLineItemDoc[]>> => {
  const map = new Map<string, BillLineItemDoc[]>();

  if (billIds.length === 0) {
    return map;
  }

  const lineItems = await dbQuery<BillLineItemRow>(
    `
      select id, bill_id, name, qty, rate_paise, amount_paise, created_at
      from bill_line_items
      where bill_id = any($1::text[])
      order by created_at asc
    `,
    [billIds],
  );

  lineItems.rows.forEach((item) => {
    const current = map.get(item.bill_id) ?? [];
    current.push(toBillLineItemDoc(item));
    map.set(item.bill_id, current);
  });

  return map;
};

const fetchVendorsByIds = async (
  vendorIds: string[],
  ownerUserId: string,
): Promise<Map<string, VendorDoc>> => {
  const map = new Map<string, VendorDoc>();

  if (vendorIds.length === 0) {
    return map;
  }

  const vendors = await dbQuery<VendorRow>(
    `
      select id, name, phone, gst_number, default_collector_name, created_at, updated_at
      from vendors
      where id = any($1::text[])
        and owner_user_id = $2
    `,
    [vendorIds, ownerUserId],
  );

  vendors.rows.forEach((vendor) => {
    map.set(vendor.id, toVendorDoc(vendor));
  });

  return map;
};

const buildBillDocs = async (
  billRows: BillRow[],
  populateVendor: boolean,
  ownerUserId: string,
) => {
  const billIds = billRows.map((row) => row.id);
  const lineItemsByBill = await fetchLineItemsByBillIds(billIds);
  const vendorsById = populateVendor
    ? await fetchVendorsByIds([...new Set(billRows.map((row) => row.vendor_id))], ownerUserId)
    : new Map<string, VendorDoc>();

  return billRows.map((row) =>
    toBillDoc(
      row,
      lineItemsByBill.get(row.id) ?? [],
      populateVendor ? (vendorsById.get(row.vendor_id) ?? row.vendor_id) : row.vendor_id,
    ),
  );
};

const insertLineItems = async (
  billId: string,
  lineItems: Array<{
    name: string;
    qty: number;
    ratePaise: number;
    amountPaise: number;
  }>,
  client: Parameters<typeof dbQuery>[2],
): Promise<void> => {
  if (lineItems.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const tuples = lineItems.map((item) => {
    values.push(
      createObjectId(),
      billId,
      item.name,
      item.qty,
      item.ratePaise,
      item.amountPaise,
    );
    const offset = values.length;
    return `($${offset - 5}, $${offset - 4}, $${offset - 3}, $${offset - 2}, $${offset - 1}, $${offset})`;
  });

  await dbQuery(
    `
      insert into bill_line_items (id, bill_id, name, qty, rate_paise, amount_paise)
      values ${tuples.join(', ')}
    `,
    values,
    client,
  );
};

const fetchPaymentEditLogsByPaymentIds = async (
  paymentIds: string[],
): Promise<Map<string, PaymentEditLogDoc[]>> => {
  const editLogByPayment = new Map<string, PaymentEditLogDoc[]>();

  if (paymentIds.length === 0) {
    return editLogByPayment;
  }

  const logs = await dbQuery<PaymentEditLogRow>(
    `
      select id, payment_id, edited_at, previous_amount_paise, previous_date
      from payment_edit_logs
      where payment_id = any($1::text[])
      order by edited_at asc
    `,
    [paymentIds],
  );

  logs.rows.forEach((row) => {
    const current = editLogByPayment.get(row.payment_id) ?? [];
    current.push(toPaymentEditLogDoc(row));
    editLogByPayment.set(row.payment_id, current);
  });

  return editLogByPayment;
};

const fetchPaymentsByBillIds = async (
  billIds: string[],
): Promise<Map<string, PaymentDoc[]>> => {
  const paymentsByBill = new Map<string, PaymentDoc[]>();

  if (billIds.length === 0) {
    return paymentsByBill;
  }

  const payments = await dbQuery<PaymentRow>(
    `
      select id, bill_id, amount_paise, date, collector_name, mode, notes, created_at, updated_at
      from payments
      where bill_id = any($1::text[])
        and deleted_at is null
      order by date desc
    `,
    [billIds],
  );

  const paymentIds = payments.rows.map((payment) => payment.id);
  const editLogByPayment = await fetchPaymentEditLogsByPaymentIds(paymentIds);

  payments.rows.forEach((payment) => {
    const current = paymentsByBill.get(payment.bill_id) ?? [];
    current.push(toPaymentDoc(payment, editLogByPayment.get(payment.id) ?? []));
    paymentsByBill.set(payment.bill_id, current);
  });

  return paymentsByBill;
};

const fetchPaymentsForBill = async (billId: string): Promise<PaymentDoc[]> => {
  const paymentsByBill = await fetchPaymentsByBillIds([billId]);
  return paymentsByBill.get(billId) ?? [];
};

billsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const payload = parseBody(createBillSchema, req.body);
    const clientRequestId = payload.clientRequestId ?? null;

    if (clientRequestId) {
      const existingByRequest = await dbQuery<BillRow>(
        `
          select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
          from bills
          where owner_user_id = $1
            and vendor_id = $2
            and client_request_id = $3
            and deleted_at is null
          limit 1
        `,
        [ownerUserId, payload.vendorId, clientRequestId],
      );
      if (existingByRequest.rows.length > 0) {
        const [existingBill] = await buildBillDocs(existingByRequest.rows, true, ownerUserId);
        sendOk(res, existingBill);
        return;
      }
    }

    const vendor = await dbQuery<{ id: string }>(
      `
        select id
        from vendors
        where id = $1
          and owner_user_id = $2
      `,
      [payload.vendorId, ownerUserId],
    );

    if (vendor.rows.length === 0) {
      notFound('Vendor');
      return;
    }

    const bill = await withTransaction(async (client) => {
      const duplicate = await dbQuery<BillRow>(
        `
          select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
          from bills
          where owner_user_id = $1
            and vendor_id = $2
            and deleted_at is null
            and (
              bill_number = $3
              or ($4 <> 'pending' and image_hash = $4)
            )
          limit 1
        `,
        [ownerUserId, payload.vendorId, payload.billNumber, payload.imageHash],
        client,
      );

      if (duplicate.rows.length > 0) {
        throw new HttpError(409, 'Duplicate bill detected for this vendor');
      }

      const billId = createObjectId();
      const inserted = await (async () => {
        try {
          return await dbQuery<BillRow>(
            `
              insert into bills (
                id,
                owner_user_id,
                bill_number,
                vendor_id,
                date,
                total_amount_paise,
                image_url,
                image_hash,
                client_request_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              returning id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
            `,
            [
              billId,
              ownerUserId,
              payload.billNumber,
              payload.vendorId,
              payload.date,
              payload.totalAmountPaise,
              payload.imageUrl,
              payload.imageHash,
              clientRequestId,
            ],
            client,
          );
        } catch (error) {
          if (
            clientRequestId &&
            isUniqueConstraintError(error, 'ux_bills_owner_vendor_client_request')
          ) {
            const existing = await dbQuery<BillRow>(
              `
                select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
                from bills
                where owner_user_id = $1
                  and vendor_id = $2
                  and client_request_id = $3
                  and deleted_at is null
                limit 1
              `,
              [ownerUserId, payload.vendorId, clientRequestId],
              client,
            );

            if (existing.rows.length > 0) {
              return existing;
            }
          }

          throw error;
        }
      })();

      const insertedRow = inserted.rows[0];
      const billCreatedFresh = insertedRow.id === billId;

      const existingLineItems = await dbQuery<BillLineItemRow>(
        `
          select id, bill_id, name, qty, rate_paise, amount_paise, created_at
          from bill_line_items
          where bill_id = $1
          order by created_at asc
        `,
        [insertedRow.id],
        client,
      );

      if (existingLineItems.rows.length === 0) {
        await insertLineItems(insertedRow.id, payload.lineItems, client);
      }

      if (billCreatedFresh) {
        await recordAuditEvent({
          ownerUserId,
          actorUserId: ownerUserId,
          entityType: 'bill',
          entityId: insertedRow.id,
          action: 'create',
          payload: {
            billNumber: insertedRow.bill_number,
            vendorId: insertedRow.vendor_id,
            totalAmountPaise: insertedRow.total_amount_paise,
            imageHash: insertedRow.image_hash,
            clientRequestId,
          },
          client,
        });
      }

      const lineItemDocs: BillLineItemDoc[] =
        existingLineItems.rows.length > 0
          ? existingLineItems.rows.map(toBillLineItemDoc)
          : payload.lineItems.map((lineItem) => ({
              name: lineItem.name,
              qty: lineItem.qty,
              ratePaise: lineItem.ratePaise,
              amountPaise: lineItem.amountPaise,
            }));

      return toBillDoc(insertedRow, lineItemDocs, insertedRow.vendor_id);
    });

    sendCreated(res, bill);
  }),
);

billsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const query = parseQuery(billsQuerySchema, req.query);

    const filters: string[] = ['owner_user_id = $1'];
    const values: unknown[] = [ownerUserId];

    if (query.vendor) {
      values.push(query.vendor);
      filters.push(`vendor_id = $${values.length}`);
    }
    if (query.dateFrom || query.dateTo) {
      if (query.dateFrom) {
        values.push(query.dateFrom);
        filters.push(`date >= $${values.length}`);
      }
      if (query.dateTo) {
        values.push(query.dateTo);
        filters.push(`date <= $${values.length}`);
      }
    }
    filters.push('deleted_at is null');

    const whereClause = `where ${filters.join(' and ')}`;
    const billRows = await dbQuery<BillRow>(
      `
        select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
        from bills
        ${whereClause}
        order by date desc
      `,
      values,
    );

    const bills = await buildBillDocs(billRows.rows, true, ownerUserId);
    const paidByBill = await getPaymentTotalsByBillIds(bills.map((bill) => bill._id));
    const summarized = attachBillSummaries(bills, paidByBill, 30);
    const filtered = query.status
      ? summarized.filter((bill) => bill.status === query.status)
      : summarized;

    if (!query.includePayments) {
      sendOk(res, filtered);
      return;
    }

    const paymentsByBill = await fetchPaymentsByBillIds(
      filtered.map((bill) => String(bill._id)),
    );

    sendOk(
      res,
      filtered.map((bill) => ({
        ...bill,
        payments: paymentsByBill.get(String(bill._id)) ?? [],
      })),
    );
  }),
);

billsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);

    const billResult = await dbQuery<BillRow>(
      `
        select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
        from bills
        where id = $1
          and owner_user_id = $2
          and deleted_at is null
      `,
      [id, ownerUserId],
    );

    if (billResult.rows.length === 0) {
      notFound('Bill');
      return;
    }

    const [bill] = await buildBillDocs([billResult.rows[0]], true, ownerUserId);
    const payments = await fetchPaymentsForBill(id);
    const paidPaise = payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
    const [summary] = attachBillSummaries([bill], new Map([[String(bill._id), paidPaise]]), 30);

    sendOk(res, {
      ...summary,
      payments,
    });
  }),
);

billsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(updateBillSchema, req.body);

    if (payload.vendorId) {
      const vendor = await dbQuery<{ id: string }>(
        `
          select id
          from vendors
          where id = $1
            and owner_user_id = $2
        `,
        [payload.vendorId, ownerUserId],
      );

      if (vendor.rows.length === 0) {
        notFound('Vendor');
        return;
      }
    }

    const bill = await withTransaction(async (client) => {
      const existing = await dbQuery<BillRow>(
        `
          select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
          from bills
          where id = $1
            and owner_user_id = $2
            and deleted_at is null
          for update
        `,
        [id, ownerUserId],
        client,
      );

      if (existing.rows.length === 0) {
        notFound('Bill');
      }

      const existingRow = existing.rows[0];

      let paidPaise = 0;
      if (payload.totalAmountPaise !== undefined || payload.lineItems !== undefined) {
        const paid = await dbQuery<{ paid_paise: number }>(
          `
            select coalesce(sum(amount_paise), 0)::int as paid_paise
            from payments
            where bill_id = $1
              and deleted_at is null
          `,
          [id],
          client,
        );
        paidPaise = paid.rows[0]?.paid_paise ?? 0;
      }

      if (payload.totalAmountPaise !== undefined) {
        if (payload.totalAmountPaise < paidPaise) {
          throw new HttpError(
            409,
            'Bill total cannot be lower than the amount already paid',
          );
        }
      }

      if (payload.lineItems !== undefined) {
        const effectiveTotalPaise =
          payload.totalAmountPaise ?? existingRow.total_amount_paise;
        if (!isLineItemTotalWithinTolerance(effectiveTotalPaise, payload.lineItems)) {
          throw new HttpError(
            400,
            'Line item total must match bill total (within Rs 1 tolerance)',
          );
        }
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (payload.billNumber !== undefined) {
        values.push(payload.billNumber);
        updates.push(`bill_number = $${values.length}`);
      }

      if (payload.vendorId !== undefined) {
        values.push(payload.vendorId);
        updates.push(`vendor_id = $${values.length}`);
      }

      if (payload.date !== undefined) {
        values.push(payload.date);
        updates.push(`date = $${values.length}`);
      }

      if (payload.totalAmountPaise !== undefined) {
        values.push(payload.totalAmountPaise);
        updates.push(`total_amount_paise = $${values.length}`);
      }

      if (payload.imageUrl !== undefined) {
        values.push(payload.imageUrl);
        updates.push(`image_url = $${values.length}`);
      }

      if (payload.imageHash !== undefined) {
        values.push(payload.imageHash);
        updates.push(`image_hash = $${values.length}`);
      }

      let updatedRow = existingRow;

      if (updates.length > 0 || payload.lineItems !== undefined) {
        values.push(id, ownerUserId);
        const updated = await dbQuery<BillRow>(
          `
            update bills
            set ${updates.length > 0 ? `${updates.join(', ')},` : ''} updated_at = now()
            where id = $${values.length - 1}
              and owner_user_id = $${values.length}
              and deleted_at is null
            returning id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
          `,
          values,
          client,
        );
        updatedRow = updated.rows[0];
      }

      if (payload.lineItems !== undefined) {
        await dbQuery(
          `
            delete from bill_line_items
            where bill_id = $1
          `,
          [id],
          client,
        );
        await insertLineItems(id, payload.lineItems, client);
      }

      const lineItems = await dbQuery<BillLineItemRow>(
        `
          select id, bill_id, name, qty, rate_paise, amount_paise, created_at
          from bill_line_items
          where bill_id = $1
          order by created_at asc
        `,
        [id],
        client,
      );

      if (updates.length > 0 || payload.lineItems !== undefined) {
        await recordAuditEvent({
          ownerUserId,
          actorUserId: ownerUserId,
          entityType: 'bill',
          entityId: id,
          action: 'update',
          payload: {
            changes: {
              billNumber: payload.billNumber,
              vendorId: payload.vendorId,
              date: payload.date?.toISOString?.() ?? payload.date,
              totalAmountPaise: payload.totalAmountPaise,
              imageUrl: payload.imageUrl,
              imageHash: payload.imageHash,
              lineItemsUpdated: payload.lineItems !== undefined,
            },
            previous: {
              billNumber: existingRow.bill_number,
              vendorId: existingRow.vendor_id,
              date: existingRow.date instanceof Date
                ? existingRow.date.toISOString()
                : existingRow.date,
              totalAmountPaise: existingRow.total_amount_paise,
              imageUrl: existingRow.image_url,
              imageHash: existingRow.image_hash,
            },
          },
          client,
        });
      }

      return toBillDoc(
        updatedRow,
        lineItems.rows.map(toBillLineItemDoc),
        updatedRow.vendor_id,
      );
    });

    sendOk(res, bill);
  }),
);

billsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);

    await withTransaction(async (client) => {
      const existing = await dbQuery<BillRow>(
        `
          select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
          from bills
          where id = $1
            and owner_user_id = $2
            and deleted_at is null
          for update
        `,
        [id, ownerUserId],
        client,
      );

      if (existing.rows.length === 0) {
        notFound('Bill');
      }

      await dbQuery(
        `
          update bills
          set deleted_at = now(), updated_at = now()
          where id = $1
            and owner_user_id = $2
            and deleted_at is null
        `,
        [id, ownerUserId],
        client,
      );

      await dbQuery(
        `
          update payments
          set deleted_at = now(), updated_at = now()
          where bill_id = $1
            and deleted_at is null
        `,
        [id],
        client,
      );

      const deleted = existing.rows[0];
      await recordAuditEvent({
        ownerUserId,
        actorUserId: ownerUserId,
        entityType: 'bill',
        entityId: id,
        action: 'delete',
        payload: {
          billNumber: deleted.bill_number,
          vendorId: deleted.vendor_id,
          totalAmountPaise: deleted.total_amount_paise,
        },
        client,
      });
    });

    sendOk(res, { deleted: true });
  }),
);

billsRouter.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(createPaymentSchema, req.body);
    const clientRequestId = payload.clientRequestId ?? null;

    if (clientRequestId) {
      const existingByRequest = await dbQuery<PaymentRow>(
        `
          select p.id, p.bill_id, p.amount_paise, p.date, p.collector_name, p.mode, p.notes, p.created_at, p.updated_at
          from payments p
          join bills b on b.id = p.bill_id
          where p.bill_id = $1
            and p.client_request_id = $2
            and b.owner_user_id = $3
            and p.deleted_at is null
            and b.deleted_at is null
          limit 1
        `,
        [id, clientRequestId, ownerUserId],
      );
      if (existingByRequest.rows.length > 0) {
        sendOk(res, toPaymentDoc(existingByRequest.rows[0], []));
        return;
      }
    }

    const payment = await withTransaction(async (client) => {
      const billFinancials = await fetchBillFinancialsForUpdate(
        id,
        ownerUserId,
        client,
      );
      const lockedBill = billFinancials ?? notFound('Bill');

      assertPaymentWithinBillLimit({
        totalAmountPaise: lockedBill.total_amount_paise,
        alreadyPaidPaise: lockedBill.paid_paise,
        paymentAmountPaise: payload.amountPaise,
      });

      const paymentId = createObjectId();
      const insertedPayment = await (async () => {
        try {
          return await dbQuery<PaymentRow>(
            `
              insert into payments (
                id,
                bill_id,
                amount_paise,
                date,
                collector_name,
                mode,
                notes,
                client_request_id
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8)
              returning id, bill_id, amount_paise, date, collector_name, mode, notes, created_at, updated_at
            `,
            [
              paymentId,
              id,
              payload.amountPaise,
              payload.date,
              payload.collectorName ?? null,
              payload.mode,
              payload.notes ?? null,
              clientRequestId,
            ],
            client,
          );
        } catch (error) {
          if (
            clientRequestId &&
            isUniqueConstraintError(error, 'ux_payments_bill_client_request')
          ) {
            const existing = await dbQuery<PaymentRow>(
              `
                select id, bill_id, amount_paise, date, collector_name, mode, notes, created_at, updated_at
                from payments
                where bill_id = $1
                  and client_request_id = $2
                  and deleted_at is null
                limit 1
              `,
              [id, clientRequestId],
              client,
            );

            if (existing.rows.length > 0) {
              return existing;
            }
          }

          throw error;
        }
      })();
      const paymentRow = insertedPayment.rows[0];
      const paymentCreatedFresh = paymentRow.id === paymentId;
      if (paymentCreatedFresh) {
        await recordAuditEvent({
          ownerUserId,
          actorUserId: ownerUserId,
          entityType: 'payment',
          entityId: paymentRow.id,
          action: 'create',
          payload: {
            billId: paymentRow.bill_id,
            amountPaise: paymentRow.amount_paise,
            date: paymentRow.date instanceof Date
              ? paymentRow.date.toISOString()
              : paymentRow.date,
            mode: paymentRow.mode,
            collectorName: paymentRow.collector_name,
            clientRequestId,
          },
          client,
        });
      }

      return paymentRow;
    });

    sendCreated(res, toPaymentDoc(payment, []));
  }),
);

export { billsRouter };
