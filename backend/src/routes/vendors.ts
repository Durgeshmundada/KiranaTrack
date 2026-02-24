import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import { type VendorRow, toVendorDoc } from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, parseBody, sendCreated, sendOk } from '../utils/http';
import { createVendorSchema, objectIdSchema, updateVendorSchema } from '../validators/schemas';

const idParamSchema = z.object({
  id: objectIdSchema,
});

const vendorsRouter = Router();

vendorsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const vendors = await dbQuery<VendorRow>(
      `
        select id, name, phone, gst_number, default_collector_name, created_at, updated_at
        from vendors
        order by created_at desc
      `,
    );
    sendOk(
      res,
      vendors.rows.map(toVendorDoc),
    );
  }),
);

vendorsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = parseBody(createVendorSchema, req.body);
    const vendor = await dbQuery<VendorRow>(
      `
        insert into vendors (id, name, phone, gst_number, default_collector_name)
        values ($1, $2, $3, $4, $5)
        returning id, name, phone, gst_number, default_collector_name, created_at, updated_at
      `,
      [
        createObjectId(),
        payload.name,
        payload.phone ?? null,
        payload.gstNumber ?? null,
        payload.defaultCollectorName ?? null,
      ],
    );

    sendCreated(res, toVendorDoc(vendor.rows[0]));
  }),
);

vendorsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const payload = parseBody(updateVendorSchema, req.body);

    const updates: string[] = [];
    const values: unknown[] = [];

    if (payload.name !== undefined) {
      values.push(payload.name);
      updates.push(`name = $${values.length}`);
    }
    if (payload.phone !== undefined) {
      values.push(payload.phone);
      updates.push(`phone = $${values.length}`);
    }
    if (payload.gstNumber !== undefined) {
      values.push(payload.gstNumber);
      updates.push(`gst_number = $${values.length}`);
    }
    if (payload.defaultCollectorName !== undefined) {
      values.push(payload.defaultCollectorName);
      updates.push(`default_collector_name = $${values.length}`);
    }

    let vendor;
    if (updates.length === 0) {
      vendor = await dbQuery<VendorRow>(
        `
          select id, name, phone, gst_number, default_collector_name, created_at, updated_at
          from vendors
          where id = $1
        `,
        [id],
      );
    } else {
      values.push(id);
      vendor = await dbQuery<VendorRow>(
        `
          update vendors
          set ${updates.join(', ')}, updated_at = now()
          where id = $${values.length}
          returning id, name, phone, gst_number, default_collector_name, created_at, updated_at
        `,
        values,
      );
    }

    if (vendor.rows.length === 0) {
      notFound('Vendor');
      return;
    }

    sendOk(res, toVendorDoc(vendor.rows[0]));
  }),
);

export { vendorsRouter };
