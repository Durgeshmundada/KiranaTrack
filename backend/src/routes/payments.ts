import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import {
  type PaymentEditLogRow,
  type PaymentRow,
  toPaymentDoc,
  toPaymentEditLogDoc,
} from '../db/mappers';
import { dbQuery, withTransaction } from '../db/postgres';
import {
  assertPaymentWithinBillLimit,
  fetchBillFinancialsForUpdate,
} from '../services/paymentGuards';
import { recordAuditEvent } from '../services/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { notFound, parseBody, sendOk } from '../utils/http';
import { objectIdSchema, updatePaymentSchema } from '../validators/schemas';

const idParamSchema = z.object({
  id: objectIdSchema,
});

const paymentsRouter = Router();

const fetchPaymentEditLogs = async (paymentId: string): Promise<ReturnType<typeof toPaymentEditLogDoc>[]> => {
  const logs = await dbQuery<PaymentEditLogRow>(
    `
      select id, payment_id, edited_at, previous_amount_paise, previous_date
      from payment_edit_logs
      where payment_id = $1
      order by edited_at asc
    `,
    [paymentId],
  );

  return logs.rows.map(toPaymentEditLogDoc);
};

paymentsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(updatePaymentSchema, req.body);

    const payment = await withTransaction(async (client) => {
      const current = await dbQuery<PaymentRow>(
        `
          select p.id, p.bill_id, p.amount_paise, p.date, p.collector_name, p.mode, p.notes, p.created_at, p.updated_at
          from payments p
          join bills b on b.id = p.bill_id
          where p.id = $1
            and b.owner_user_id = $2
            and p.deleted_at is null
            and b.deleted_at is null
          for update of p, b
        `,
        [id, ownerUserId],
        client,
      );

      if (current.rows.length === 0) {
        notFound('Payment');
      }

      const row = current.rows[0];
      const billFinancials = await fetchBillFinancialsForUpdate(
        row.bill_id,
        ownerUserId,
        client,
      );
      const lockedBill = billFinancials ?? notFound('Bill');

      assertPaymentWithinBillLimit({
        totalAmountPaise: lockedBill.total_amount_paise,
        alreadyPaidPaise: lockedBill.paid_paise,
        paymentAmountPaise: payload.amountPaise,
        replacingAmountPaise: row.amount_paise,
      });

      await dbQuery(
        `
          insert into payment_edit_logs (id, payment_id, edited_at, previous_amount_paise, previous_date)
          values ($1, $2, $3, $4, $5)
        `,
        [createObjectId(), id, new Date(), row.amount_paise, row.date],
        client,
      );

      const updates: string[] = [];
      const values: unknown[] = [];

      values.push(payload.amountPaise);
      updates.push(`amount_paise = $${values.length}`);

      values.push(payload.date);
      updates.push(`date = $${values.length}`);

      if (payload.collectorName !== undefined) {
        values.push(payload.collectorName);
        updates.push(`collector_name = $${values.length}`);
      }

      if (payload.mode !== undefined) {
        values.push(payload.mode);
        updates.push(`mode = $${values.length}`);
      }

      if (payload.notes !== undefined) {
        values.push(payload.notes);
        updates.push(`notes = $${values.length}`);
      }

      values.push(id);

      const updated = await dbQuery<PaymentRow>(
        `
          update payments
          set ${updates.join(', ')}, updated_at = now()
          where id = $${values.length}
            and deleted_at is null
          returning id, bill_id, amount_paise, date, collector_name, mode, notes, created_at, updated_at
        `,
        values,
        client,
      );

      const updatedRow = updated.rows[0];
      await recordAuditEvent({
        ownerUserId,
        actorUserId: ownerUserId,
        entityType: 'payment',
        entityId: id,
        action: 'update',
        payload: {
          previous: {
            amountPaise: row.amount_paise,
            date: row.date instanceof Date ? row.date.toISOString() : row.date,
            collectorName: row.collector_name,
            mode: row.mode,
            notes: row.notes,
          },
          next: {
            amountPaise: updatedRow.amount_paise,
            date: updatedRow.date instanceof Date
              ? updatedRow.date.toISOString()
              : updatedRow.date,
            collectorName: updatedRow.collector_name,
            mode: updatedRow.mode,
            notes: updatedRow.notes,
          },
        },
        client,
      });

      return updatedRow;
    });

    const editLog = await fetchPaymentEditLogs(id);
    sendOk(res, toPaymentDoc(payment, editLog));
  }),
);

paymentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);

    const payment = await withTransaction(async (client) => {
      const existing = await dbQuery<PaymentRow>(
        `
          select p.id, p.bill_id, p.amount_paise, p.date, p.collector_name, p.mode, p.notes, p.created_at, p.updated_at
          from payments p
          join bills b on b.id = p.bill_id
          where p.id = $1
            and b.owner_user_id = $2
            and p.deleted_at is null
            and b.deleted_at is null
          for update of p, b
        `,
        [id, ownerUserId],
        client,
      );

      if (existing.rows.length === 0) {
        notFound('Payment');
      }

      const deleted = await dbQuery<{ id: string }>(
        `
          update payments
          set deleted_at = now(), updated_at = now()
          where id = $1
            and deleted_at is null
          returning id
        `,
        [id],
        client,
      );

      const removed = existing.rows[0];
      await recordAuditEvent({
        ownerUserId,
        actorUserId: ownerUserId,
        entityType: 'payment',
        entityId: id,
        action: 'delete',
        payload: {
          billId: removed.bill_id,
          amountPaise: removed.amount_paise,
          date: removed.date instanceof Date
            ? removed.date.toISOString()
            : removed.date,
          mode: removed.mode,
          collectorName: removed.collector_name,
          notes: removed.notes,
        },
        client,
      });

      return deleted;
    });

    if (payment.rows.length === 0) {
      notFound('Payment');
      return;
    }

    sendOk(res, { deleted: true });
  }),
);

export { paymentsRouter };
