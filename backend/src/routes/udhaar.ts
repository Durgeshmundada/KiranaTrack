import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import {
  type UdhaarCustomerRow,
  type UdhaarEntryRow,
  toUdhaarCustomerDoc,
  toUdhaarEntryDoc,
} from '../db/mappers';
import { dbQuery, withTransaction } from '../db/postgres';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { HttpError, notFound, parseBody, sendCreated, sendOk } from '../utils/http';
import {
  createUdhaarCustomerSchema,
  createUdhaarEntrySchema,
  objectIdSchema,
} from '../validators/schemas';
import { recordAuditEvent } from '../services/audit';

const customerIdParamSchema = z.object({
  id: objectIdSchema,
});

const entryIdParamSchema = z.object({
  id: objectIdSchema,
});

const udhaarRouter = Router();

const fetchCustomerWithEntries = async (
  id: string,
  ownerUserId: string,
) => {
  const customerResult = await dbQuery<UdhaarCustomerRow>(
    `
      select id, customer_name, phone, created_at, updated_at
      from udhaar_customers
      where id = $1
        and owner_user_id = $2
    `,
    [id, ownerUserId],
  );

  if (customerResult.rows.length === 0) {
    return null;
  }

  const entriesResult = await dbQuery<UdhaarEntryRow>(
    `
      select id, customer_id, type, amount_paise, description, date, created_at
      from udhaar_entries
      where customer_id = $1
        and deleted_at is null
      order by created_at asc
    `,
    [id],
  );

  return toUdhaarCustomerDoc(
    customerResult.rows[0],
    entriesResult.rows.map(toUdhaarEntryDoc),
  );
};

udhaarRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const customers = await dbQuery<UdhaarCustomerRow>(
      `
        select id, customer_name, phone, created_at, updated_at
        from udhaar_customers
        where owner_user_id = $1
        order by created_at desc
      `,
      [ownerUserId],
    );

    const customerIds = customers.rows.map((row) => row.id);
    const entriesByCustomer = new Map<string, ReturnType<typeof toUdhaarEntryDoc>[]>();

    if (customerIds.length > 0) {
      const entries = await dbQuery<UdhaarEntryRow>(
        `
          select id, customer_id, type, amount_paise, description, date, created_at
          from udhaar_entries
          where customer_id = any($1::text[])
            and deleted_at is null
          order by created_at asc
        `,
        [customerIds],
      );

      entries.rows.forEach((entry) => {
        const current = entriesByCustomer.get(entry.customer_id) ?? [];
        current.push(toUdhaarEntryDoc(entry));
        entriesByCustomer.set(entry.customer_id, current);
      });
    }

    sendOk(
      res,
      customers.rows.map((customer) =>
        toUdhaarCustomerDoc(customer, entriesByCustomer.get(customer.id) ?? []),
      ),
    );
  }),
);

udhaarRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const payload = parseBody(createUdhaarCustomerSchema, req.body);

    const customer = await dbQuery<UdhaarCustomerRow>(
      `
        insert into udhaar_customers (id, owner_user_id, customer_name, phone)
        values ($1, $2, $3, $4)
        returning id, customer_name, phone, created_at, updated_at
      `,
      [createObjectId(), ownerUserId, payload.customerName, payload.phone ?? null],
    );

    sendCreated(res, toUdhaarCustomerDoc(customer.rows[0], []));
  }),
);

udhaarRouter.post(
  '/:id/entries',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = customerIdParamSchema.parse(req.params);
    const payload = parseBody(createUdhaarEntrySchema, req.body);

    await withTransaction(async (client) => {
      const customer = await dbQuery<{ id: string }>(
        `
          select id
          from udhaar_customers
          where id = $1
            and owner_user_id = $2
          for update
        `,
        [id, ownerUserId],
        client,
      );

      if (customer.rows.length === 0) {
        notFound('Udhaar customer');
      }

      if (payload.type === 'repayment') {
        const balanceResult = await dbQuery<{ balance_paise: number }>(
          `
            select coalesce(
              sum(
                case
                  when type = 'credit' then amount_paise
                  when type = 'repayment' then -amount_paise
                  else 0
                end
              ),
              0
            )::int as balance_paise
            from udhaar_entries
            where customer_id = $1
              and deleted_at is null
          `,
          [id],
          client,
        );

        const balancePaise = balanceResult.rows[0]?.balance_paise ?? 0;
        if (payload.amountPaise > balancePaise) {
          throw new HttpError(
            409,
            'Repayment exceeds outstanding udhaar balance for this customer',
          );
        }
      }

      const entryId = createObjectId();
      await dbQuery(
        `
          insert into udhaar_entries (id, customer_id, type, amount_paise, description, date)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [
          entryId,
          id,
          payload.type,
          payload.amountPaise,
          payload.description ?? null,
          payload.date,
        ],
        client,
      );

      await recordAuditEvent({
        ownerUserId,
        actorUserId: ownerUserId,
        entityType: 'udhaar_entry',
        entityId: entryId,
        action: 'create',
        payload: {
          customerId: id,
          type: payload.type,
          amountPaise: payload.amountPaise,
          description: payload.description ?? null,
          date: payload.date.toISOString(),
        },
        client,
      });

      await dbQuery(
        `
          update udhaar_customers
          set updated_at = now()
          where id = $1
            and owner_user_id = $2
        `,
        [id, ownerUserId],
        client,
      );
    });

    const updatedCustomer = await fetchCustomerWithEntries(id, ownerUserId);
    if (!updatedCustomer) {
      notFound('Udhaar customer');
      return;
    }

    sendCreated(res, updatedCustomer);
  }),
);

udhaarRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = entryIdParamSchema.parse(req.params);

    const customerId = await withTransaction(async (client) => {
      const entry = await dbQuery<UdhaarEntryRow>(
        `
          select ue.id, ue.customer_id, ue.type, ue.amount_paise, ue.description, ue.date, ue.created_at
          from udhaar_entries ue
          join udhaar_customers uc on uc.id = ue.customer_id
          where ue.id = $1
            and uc.owner_user_id = $2
            and ue.deleted_at is null
          for update of ue, uc
        `,
        [id, ownerUserId],
        client,
      );

      if (entry.rows.length === 0) {
        notFound('Udhaar entry');
      }

      const existingEntry = entry.rows[0];
      const ownerCustomerId = existingEntry.customer_id;
      await dbQuery(
        `
          select id
          from udhaar_customers
          where id = $1
            and owner_user_id = $2
          for update
        `,
        [ownerCustomerId, ownerUserId],
        client,
      );

      await dbQuery(
        `
          update udhaar_entries
          set deleted_at = now()
          where id = $1
            and deleted_at is null
        `,
        [id],
        client,
      );

      await recordAuditEvent({
        ownerUserId,
        actorUserId: ownerUserId,
        entityType: 'udhaar_entry',
        entityId: id,
        action: 'delete',
        payload: {
          customerId: existingEntry.customer_id,
          type: existingEntry.type,
          amountPaise: existingEntry.amount_paise,
          description: existingEntry.description,
          date: existingEntry.date instanceof Date
            ? existingEntry.date.toISOString()
            : existingEntry.date,
        },
        client,
      });

      await dbQuery(
        `
          update udhaar_customers
          set updated_at = now()
          where id = $1
            and owner_user_id = $2
        `,
        [ownerCustomerId, ownerUserId],
        client,
      );

      return ownerCustomerId;
    });

    const customer = await fetchCustomerWithEntries(customerId, ownerUserId);

    sendOk(res, { deleted: true, customer });
  }),
);

export { udhaarRouter };
