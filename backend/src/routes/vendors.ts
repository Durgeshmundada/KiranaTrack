import { Router } from 'express';
import { z } from 'zod';

import { createObjectId } from '../db/id';
import { type VendorRow, toVendorDoc } from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { hasVendorIdentityConflict } from '../services/vendorIdentity';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { HttpError, notFound, parseBody, parseQuery, sendCreated, sendOk } from '../utils/http';
import {
  createVendorSchema,
  objectIdSchema,
  updateVendorSchema,
  updatedAfterQuerySchema,
} from '../validators/schemas';

const idParamSchema = z.object({
  id: objectIdSchema,
});

const vendorsRouter = Router();
type PgLikeError = {
  code?: string;
  constraint?: string;
};

const isOwnerVendorNameConflict = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as PgLikeError;
  return pgError.code === '23505' && pgError.constraint === 'ux_vendors_owner_name_ci';
};

vendorsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const ownerUserId = getAuthUserId(_req);
    const query = parseQuery(updatedAfterQuerySchema, _req.query);
    const values: unknown[] = [ownerUserId];
    const filters = ['owner_user_id = $1'];
    if (query.updatedAfter) {
      values.push(query.updatedAfter);
      filters.push(`updated_at >= $${values.length}`);
    }

    const vendors = await dbQuery<VendorRow>(
      `
        select id, name, phone, gst_number, default_collector_name, created_at, updated_at
        from vendors
        where ${filters.join(' and ')}
        order by created_at desc
      `,
      values,
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
    const ownerUserId = getAuthUserId(req);
    const payload = parseBody(createVendorSchema, req.body);

    const existingVendor = await dbQuery<VendorRow>(
      `
        select id, name, phone, gst_number, default_collector_name, created_at, updated_at
        from vendors
        where owner_user_id = $1
          and lower(name) = lower($2)
        limit 1
      `,
      [ownerUserId, payload.name],
    );

    if (existingVendor.rows.length > 0) {
      const existing = existingVendor.rows[0];
      if (
        hasVendorIdentityConflict(
          {
            name: existing.name,
            phone: existing.phone,
            gstNumber: existing.gst_number,
            defaultCollectorName: existing.default_collector_name,
          },
          {
            name: payload.name,
            phone: payload.phone ?? null,
            gstNumber: payload.gstNumber ?? null,
            defaultCollectorName: payload.defaultCollectorName ?? null,
          },
        )
      ) {
        throw new HttpError(
          409,
          'Supplier name already exists with different phone/GST/collector details',
        );
      }

      const refreshed = await dbQuery<VendorRow>(
        `
          update vendors
          set
            phone = coalesce(vendors.phone, $3),
            gst_number = coalesce(vendors.gst_number, $4),
            default_collector_name = coalesce(vendors.default_collector_name, $5),
            updated_at = now()
          where id = $1
            and owner_user_id = $2
          returning id, name, phone, gst_number, default_collector_name, created_at, updated_at
        `,
        [
          existing.id,
          ownerUserId,
          payload.phone ?? null,
          payload.gstNumber ?? null,
          payload.defaultCollectorName ?? null,
        ],
      );

      sendOk(res, toVendorDoc(refreshed.rows[0]));
      return;
    }

    try {
      const vendor = await dbQuery<VendorRow>(
        `
          insert into vendors (id, owner_user_id, name, phone, gst_number, default_collector_name)
          values ($1, $2, $3, $4, $5, $6)
          returning id, name, phone, gst_number, default_collector_name, created_at, updated_at
        `,
        [
          createObjectId(),
          ownerUserId,
          payload.name,
          payload.phone ?? null,
          payload.gstNumber ?? null,
          payload.defaultCollectorName ?? null,
        ],
      );

      sendCreated(res, toVendorDoc(vendor.rows[0]));
    } catch (error) {
      if (!isOwnerVendorNameConflict(error)) {
        throw error;
      }

      const concurrent = await dbQuery<VendorRow>(
        `
          select id, name, phone, gst_number, default_collector_name, created_at, updated_at
          from vendors
          where owner_user_id = $1
            and lower(name) = lower($2)
          limit 1
        `,
        [ownerUserId, payload.name],
      );

      if (concurrent.rows.length === 0) {
        throw error;
      }

      sendOk(res, toVendorDoc(concurrent.rows[0]));
    }
  }),
);

vendorsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
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
            and owner_user_id = $2
        `,
        [id, ownerUserId],
      );
    } else {
      values.push(id, ownerUserId);
      vendor = await dbQuery<VendorRow>(
        `
          update vendors
          set ${updates.join(', ')}, updated_at = now()
          where id = $${values.length - 1}
            and owner_user_id = $${values.length}
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
