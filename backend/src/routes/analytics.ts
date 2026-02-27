import { Router } from 'express';

import { dbQuery } from '../db/postgres';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { sendOk } from '../utils/http';

const analyticsRouter = Router();

analyticsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const outstanding = await dbQuery<{ outstanding_paise: number }>(
      `
        select coalesce(
          sum(greatest(b.total_amount_paise - coalesce(p.paid_paise, 0), 0)),
          0
        )::int as outstanding_paise
        from bills b
        left join (
          select bill_id, coalesce(sum(amount_paise), 0)::int as paid_paise
          from payments
          where deleted_at is null
          group by bill_id
        ) p on p.bill_id = b.id
        where b.owner_user_id = $1
          and b.deleted_at is null
      `,
      [ownerUserId],
    );

    const outstandingPaise = outstanding.rows[0]?.outstanding_paise ?? 0;

    const receivable = await dbQuery<{ receivable_paise: number }>(
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
        )::int as receivable_paise
        from udhaar_entries ue
        join udhaar_customers uc on uc.id = ue.customer_id
        where uc.owner_user_id = $1
          and ue.deleted_at is null
      `,
      [ownerUserId],
    );

    const receivablePaise = receivable.rows[0]?.receivable_paise ?? 0;

    sendOk(res, {
      outstandingPaise,
      receivablePaise,
      netPositionPaise: receivablePaise - outstandingPaise,
    });
  }),
);

analyticsRouter.get(
  '/vendor-wise',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const grouped = await dbQuery<{
      vendor_id: string;
      vendor_name: string | null;
      outstanding_paise: number;
    }>(
      `
        select
          v.id as vendor_id,
          v.name as vendor_name,
          coalesce(
            sum(greatest(b.total_amount_paise - coalesce(p.paid_paise, 0), 0)),
            0
          )::int as outstanding_paise
        from vendors v
        left join bills b on b.vendor_id = v.id and b.deleted_at is null
        left join (
          select bill_id, coalesce(sum(amount_paise), 0)::int as paid_paise
          from payments
          where deleted_at is null
          group by bill_id
        ) p on p.bill_id = b.id
        where v.owner_user_id = $1
        group by v.id, v.name
        order by outstanding_paise desc
      `,
      [ownerUserId],
    );

    const data = grouped.rows
      .map((row) => ({
        vendorId: row.vendor_id,
        vendorName: row.vendor_name ?? 'Unknown',
        outstandingPaise: row.outstanding_paise,
      }))
      .sort((a, b) => b.outstandingPaise - a.outstandingPaise);

    sendOk(res, data);
  }),
);

analyticsRouter.get(
  '/monthly-spend',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    const monthly = await dbQuery<{
      year: number;
      month: number;
      total_paid_paise: number;
    }>(
      `
        select
          extract(year from p.date)::int as year,
          extract(month from p.date)::int as month,
          coalesce(sum(p.amount_paise), 0)::int as total_paid_paise
        from payments p
        join bills b on b.id = p.bill_id
        where b.owner_user_id = $1
          and b.deleted_at is null
          and p.deleted_at is null
        group by year, month
        order by year asc, month asc
      `,
      [ownerUserId],
    );

    const data = monthly.rows.slice(-6).map((item) => ({
      month: `${item.year}-${String(item.month).padStart(2, '0')}`,
      totalPaidPaise: item.total_paid_paise,
    }));

    sendOk(res, data);
  }),
);

analyticsRouter.get(
  '/price-anomalies',
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    type ItemRatePoint = {
      date: Date;
      ratePaise: number;
      vendorName: string;
      itemName: string;
      billNumber: string;
    };

    const rows = await dbQuery<{
      vendor_id: string;
      vendor_name: string | null;
      bill_number: string;
      bill_date: Date | string;
      item_name: string;
      rate_paise: number;
    }>(
      `
        select
          b.vendor_id,
          v.name as vendor_name,
          b.bill_number,
          b.date as bill_date,
          li.name as item_name,
          li.rate_paise
        from bills b
        left join vendors v on v.id = b.vendor_id
        join bill_line_items li on li.bill_id = b.id
        where b.owner_user_id = $1
          and b.deleted_at is null
        order by b.date asc
      `,
      [ownerUserId],
    );

    const grouped = new Map<string, ItemRatePoint[]>();

    rows.rows.forEach((row) => {
      const key = `${row.vendor_id}::${row.item_name.trim().toLowerCase()}`;
      const points = grouped.get(key) ?? [];
      points.push({
        date: row.bill_date instanceof Date ? row.bill_date : new Date(row.bill_date),
        ratePaise: row.rate_paise,
        vendorName: row.vendor_name ?? 'Unknown',
        itemName: row.item_name,
        billNumber: row.bill_number,
      });
      grouped.set(key, points);
    });

    const anomalies = [...grouped.values()]
      .filter((series) => series.length >= 3)
      .map((series) => {
        const sorted = [...series].sort((a, b) => a.date.getTime() - b.date.getTime());
        const latest = sorted.at(-1);
        const historical = sorted.slice(0, -1);
        if (!latest || historical.length === 0) {
          return null;
        }

        const avgRate = historical.reduce((sum, row) => sum + row.ratePaise, 0) / historical.length;
        if (latest.ratePaise < avgRate * 1.15) {
          return null;
        }

        return {
          vendorName: latest.vendorName,
          itemName: latest.itemName,
          latestRatePaise: latest.ratePaise,
          averageRatePaise: Math.round(avgRate),
          differencePaise: latest.ratePaise - Math.round(avgRate),
          billNumber: latest.billNumber,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((a, b) => b.differencePaise - a.differencePaise);

    sendOk(res, anomalies);
  }),
);

export { analyticsRouter };
