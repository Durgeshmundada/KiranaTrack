import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import {
  type UdhaarCustomerRow,
  type UdhaarEntryRow,
  toUdhaarCustomerDoc,
  toUdhaarEntryDoc,
} from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, parseBody, sendCreated, sendOk } from '../utils/http';
import {
  createUdhaarCustomerSchema,
  createUdhaarEntrySchema,
  objectIdSchema,
} from '../validators/schemas';

const customerIdParamSchema = z.object({
  id: objectIdSchema,
});

const entryIdParamSchema = z.object({
  id: objectIdSchema,
});

const udhaarRouter = Router();

const fetchCustomerWithEntries = async (id: string) => {
  const customerResult = await dbQuery<UdhaarCustomerRow>(
    `
      select id, customer_name, phone, created_at, updated_at
      from udhaar_customers
      where id = $1
    `,
    [id],
  );

  if (customerResult.rows.length === 0) {
    return null;
  }

  const entriesResult = await dbQuery<UdhaarEntryRow>(
    `
      select id, customer_id, type, amount_paise, description, date, created_at
      from udhaar_entries
      where customer_id = $1
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
  asyncHandler(async (_req, res) => {
    const customers = await dbQuery<UdhaarCustomerRow>(
      `
        select id, customer_name, phone, created_at, updated_at
        from udhaar_customers
        order by created_at desc
      `,
    );

    const customerIds = customers.rows.map((row) => row.id);
    const entriesByCustomer = new Map<string, ReturnType<typeof toUdhaarEntryDoc>[]>();

    if (customerIds.length > 0) {
      const entries = await dbQuery<UdhaarEntryRow>(
        `
          select id, customer_id, type, amount_paise, description, date, created_at
          from udhaar_entries
          where customer_id = any($1::text[])
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
    const payload = parseBody(createUdhaarCustomerSchema, req.body);

    const customer = await dbQuery<UdhaarCustomerRow>(
      `
        insert into udhaar_customers (id, customer_name, phone)
        values ($1, $2, $3)
        returning id, customer_name, phone, created_at, updated_at
      `,
      [createObjectId(), payload.customerName, payload.phone ?? null],
    );

    sendCreated(res, toUdhaarCustomerDoc(customer.rows[0], []));
  }),
);

udhaarRouter.post(
  '/:id/entries',
  asyncHandler(async (req, res) => {
    const { id } = customerIdParamSchema.parse(req.params);
    const payload = parseBody(createUdhaarEntrySchema, req.body);

    const customer = await dbQuery<{ id: string }>(
      `
        select id
        from udhaar_customers
        where id = $1
      `,
      [id],
    );

    if (customer.rows.length === 0) {
      notFound('Udhaar customer');
      return;
    }

    await dbQuery(
      `
        insert into udhaar_entries (id, customer_id, type, amount_paise, description, date)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        createObjectId(),
        id,
        payload.type,
        payload.amountPaise,
        payload.description ?? null,
        payload.date,
      ],
    );

    await dbQuery(
      `
        update udhaar_customers
        set updated_at = now()
        where id = $1
      `,
      [id],
    );

    const updatedCustomer = await fetchCustomerWithEntries(id);
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
    const { id } = entryIdParamSchema.parse(req.params);

    const entry = await dbQuery<{ customer_id: string }>(
      `
        select customer_id
        from udhaar_entries
        where id = $1
      `,
      [id],
    );

    if (entry.rows.length === 0) {
      notFound('Udhaar entry');
      return;
    }

    const customerId = entry.rows[0].customer_id;

    await dbQuery(
      `
        delete from udhaar_entries
        where id = $1
      `,
      [id],
    );

    await dbQuery(
      `
        update udhaar_customers
        set updated_at = now()
        where id = $1
      `,
      [customerId],
    );

    const customer = await fetchCustomerWithEntries(customerId);

    sendOk(res, { deleted: true, customer });
  }),
);

export { udhaarRouter };
