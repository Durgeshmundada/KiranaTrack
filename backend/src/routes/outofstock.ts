import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import { type OutOfStockItemRow, toOutOfStockItemDoc } from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { notFound, parseBody, parseQuery, sendCreated, sendOk } from '../utils/http';
import {
  createOutOfStockSchema,
  objectIdSchema,
  updatedAfterQuerySchema,
  updateOutOfStockSchema,
} from '../validators/schemas';

const idParamSchema = z.object({
  id: objectIdSchema,
});

const outOfStockRouter = Router();

outOfStockRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const query = parseQuery(updatedAfterQuerySchema, req.query);
    const values: unknown[] = [ownerUserId];
    const filters = ['owner_user_id = $1'];
    if (query.updatedAfter) {
      values.push(query.updatedAfter);
      filters.push(`updated_at >= $${values.length}`);
    }

    const items = await dbQuery<OutOfStockItemRow>(
      `
        select id, item_name, status, created_at, updated_at
        from out_of_stock_items
        where ${filters.join(' and ')}
        order by created_at desc
      `,
      values,
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
    const ownerUserId = getAuthUserId(req);
    const payload = parseBody(createOutOfStockSchema, req.body);
    const item = await dbQuery<OutOfStockItemRow>(
      `
        insert into out_of_stock_items (id, owner_user_id, item_name, status)
        values ($1, $2, $3, $4)
        returning id, item_name, status, created_at, updated_at
      `,
      [createObjectId(), ownerUserId, payload.itemName, payload.status ?? 'pending'],
    );
    sendCreated(res, toOutOfStockItemDoc(item.rows[0]));
  }),
);

outOfStockRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(updateOutOfStockSchema, req.body);

    const item = await dbQuery<OutOfStockItemRow>(
      `
        update out_of_stock_items
        set status = $1, updated_at = now()
        where id = $2
          and owner_user_id = $3
        returning id, item_name, status, created_at, updated_at
      `,
      [payload.status, id, ownerUserId],
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
    const ownerUserId = getAuthUserId(req);
    const { id } = idParamSchema.parse(req.params);
    const item = await dbQuery<{ id: string }>(
      `
        delete from out_of_stock_items
        where id = $1
          and owner_user_id = $2
        returning id
      `,
      [id, ownerUserId],
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
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const result = await dbQuery(
      `
        delete from out_of_stock_items
        where owner_user_id = $1
      `,
      [ownerUserId],
    );
    sendOk(res, { deletedCount: result.rowCount ?? 0 });
  }),
);

export { outOfStockRouter };
