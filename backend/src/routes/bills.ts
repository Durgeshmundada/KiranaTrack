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
import { attachBillSummaries, getPaymentTotalsByBillIds } from '../services/billing';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, parseBody, parseQuery, sendCreated, sendOk } from '../utils/http';
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

const fetchVendorsByIds = async (vendorIds: string[]): Promise<Map<string, VendorDoc>> => {
  const map = new Map<string, VendorDoc>();

  if (vendorIds.length === 0) {
    return map;
  }

  const vendors = await dbQuery<VendorRow>(
    `
      select id, name, phone, gst_number, default_collector_name, created_at, updated_at
      from vendors
      where id = any($1::text[])
    `,
    [vendorIds],
  );

  vendors.rows.forEach((vendor) => {
    map.set(vendor.id, toVendorDoc(vendor));
  });

  return map;
};

const buildBillDocs = async (
  billRows: BillRow[],
  populateVendor: boolean,
) => {
  const billIds = billRows.map((row) => row.id);
  const lineItemsByBill = await fetchLineItemsByBillIds(billIds);
  const vendorsById = populateVendor
    ? await fetchVendorsByIds([...new Set(billRows.map((row) => row.vendor_id))])
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
    const payload = parseBody(createBillSchema, req.body);

    const vendor = await dbQuery<{ id: string }>(
      `
        select id
        from vendors
        where id = $1
      `,
      [payload.vendorId],
    );

    if (vendor.rows.length === 0) {
      notFound('Vendor');
      return;
    }

    const bill = await withTransaction(async (client) => {
      const billId = createObjectId();
      const inserted = await dbQuery<BillRow>(
        `
          insert into bills (
            id,
            bill_number,
            vendor_id,
            date,
            total_amount_paise,
            image_url,
            image_hash
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
        `,
        [
          billId,
          payload.billNumber,
          payload.vendorId,
          payload.date,
          payload.totalAmountPaise,
          payload.imageUrl,
          payload.imageHash,
        ],
        client,
      );

      await insertLineItems(billId, payload.lineItems, client);

      const lines = await dbQuery<BillLineItemRow>(
        `
          select id, bill_id, name, qty, rate_paise, amount_paise, created_at
          from bill_line_items
          where bill_id = $1
          order by created_at asc
        `,
        [billId],
        client,
      );

      return toBillDoc(
        inserted.rows[0],
        lines.rows.map(toBillLineItemDoc),
        inserted.rows[0].vendor_id,
      );
    });

    sendCreated(res, bill);
  }),
);

billsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parseQuery(billsQuerySchema, req.query);

    const filters: string[] = [];
    const values: unknown[] = [];

    if (query.vendor) {
      values.push(query.vendor);
      filters.push(`vendor_id = $${values.length}`);
    }
    if (query.dateFrom || query.dateTo) {
      if (query.dateFrom) {
        values.push(new Date(query.dateFrom));
        filters.push(`date >= $${values.length}`);
      }
      if (query.dateTo) {
        values.push(new Date(query.dateTo));
        filters.push(`date <= $${values.length}`);
      }
    }

    const whereClause = filters.length > 0 ? `where ${filters.join(' and ')}` : '';
    const billRows = await dbQuery<BillRow>(
      `
        select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
        from bills
        ${whereClause}
        order by date desc
      `,
      values,
    );

    const bills = await buildBillDocs(billRows.rows, true);
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
    const { id } = idParamSchema.parse(req.params);

    const billResult = await dbQuery<BillRow>(
      `
        select id, bill_number, vendor_id, date, total_amount_paise, image_url, image_hash, created_at, updated_at
        from bills
        where id = $1
      `,
      [id],
    );

    if (billResult.rows.length === 0) {
      notFound('Bill');
      return;
    }

    const [bill] = await buildBillDocs([billResult.rows[0]], true);
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
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(updateBillSchema, req.body);

    if (payload.vendorId) {
      const vendor = await dbQuery<{ id: string }>(
        `
          select id
          from vendors
          where id = $1
        `,
        [payload.vendorId],
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
        `,
        [id],
        client,
      );

      if (existing.rows.length === 0) {
        notFound('Bill');
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

      let updatedRow = existing.rows[0];

      if (updates.length > 0 || payload.lineItems !== undefined) {
        values.push(id);
        const updated = await dbQuery<BillRow>(
          `
            update bills
            set ${updates.length > 0 ? `${updates.join(', ')},` : ''} updated_at = now()
            where id = $${values.length}
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
    const { id } = idParamSchema.parse(req.params);

    const bill = await dbQuery<{ id: string }>(
      `
        delete from bills
        where id = $1
        returning id
      `,
      [id],
    );

    if (bill.rows.length === 0) {
      notFound('Bill');
      return;
    }

    sendOk(res, { deleted: true });
  }),
);

billsRouter.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(createPaymentSchema, req.body);

    const bill = await dbQuery<{ id: string }>(
      `
        select id
        from bills
        where id = $1
      `,
      [id],
    );

    if (bill.rows.length === 0) {
      notFound('Bill');
      return;
    }

    const payment = await dbQuery<PaymentRow>(
      `
        insert into payments (
          id,
          bill_id,
          amount_paise,
          date,
          collector_name,
          mode,
          notes
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, bill_id, amount_paise, date, collector_name, mode, notes, created_at, updated_at
      `,
      [
        createObjectId(),
        id,
        payload.amountPaise,
        payload.date,
        payload.collectorName ?? null,
        payload.mode,
        payload.notes ?? null,
      ],
    );

    sendCreated(res, toPaymentDoc(payment.rows[0], []));
  }),
);

export { billsRouter };
