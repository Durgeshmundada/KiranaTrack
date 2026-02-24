import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import { type OutOfStockItemRow, toOutOfStockItemDoc } from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, parseBody, sendCreated, sendOk } from '../utils/http';
import {
  createOutOfStockSchema,
  objectIdSchema,
  updateOutOfStockSchema,
} from '../validators/schemas';

const idParamSchema = z.object({
  id: objectIdSchema,
});

const outOfStockRouter = Router();

outOfStockRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await dbQuery<OutOfStockItemRow>(
      `
        select id, item_name, status, created_at, updated_at
        from out_of_stock_items
        order by created_at desc
      `,
    );
    sendOk(
      res,
      items.rows.map(toOutOfStockItemDoc),
    );
  }),
);

outOfStockRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = parseBody(createOutOfStockSchema, req.body);
    const item = await dbQuery<OutOfStockItemRow>(
      `
        insert into out_of_stock_items (id, item_name, status)
        values ($1, $2, $3)
        returning id, item_name, status, created_at, updated_at
      `,
      [createObjectId(), payload.itemName, payload.status ?? 'pending'],
    );
    sendCreated(res, toOutOfStockItemDoc(item.rows[0]));
  }),
);

outOfStockRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(updateOutOfStockSchema, req.body);

    const item = await dbQuery<OutOfStockItemRow>(
      `
        update out_of_stock_items
        set status = $1, updated_at = now()
        where id = $2
        returning id, item_name, status, created_at, updated_at
      `,
      [payload.status, id],
    );

    if (item.rows.length === 0) {
      notFound('Out-of-stock item');
      return;
    }

    sendOk(res, toOutOfStockItemDoc(item.rows[0]));
  }),
);

outOfStockRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const item = await dbQuery<{ id: string }>(
      `
        delete from out_of_stock_items
        where id = $1
        returning id
      `,
      [id],
    );

    if (item.rows.length === 0) {
      notFound('Out-of-stock item');
      return;
    }

    sendOk(res, { deleted: true });
  }),
);

outOfStockRouter.delete(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await dbQuery(
      `
        delete from out_of_stock_items
        where true
      `,
    );
    sendOk(res, { deletedCount: result.rowCount ?? 0 });
  }),
);

export { outOfStockRouter };
