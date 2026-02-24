import { Router } from 'express';

import { type BillRow, type VendorRow, toVendorDoc } from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { attachBillSummaries, getPaymentTotalsByBillIds } from '../services/billing';
import { asyncHandler } from '../utils/asyncHandler';
import { sendOk } from '../utils/http';

const analyticsRouter = Router();

analyticsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const bills = await dbQuery<Pick<BillRow, 'id' | 'total_amount_paise' | 'date'>>(
      `
        select id, total_amount_paise, date
        from bills
      `,
    );

    const normalizedBills = bills.rows.map((bill) => ({
      _id: bill.id,
      totalAmountPaise: bill.total_amount_paise,
      date: bill.date instanceof Date ? bill.date : new Date(bill.date),
    }));

    const paidByBill = await getPaymentTotalsByBillIds(
      normalizedBills.map((bill) => bill._id),
    );
    const summarized = attachBillSummaries(normalizedBills, paidByBill, 30);
    const outstandingPaise = summarized.reduce((sum, bill) => sum + bill.remainingPaise, 0);

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
        from udhaar_entries
      `,
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
  asyncHandler(async (_req, res) => {
    const [vendors, bills] = await Promise.all([
      dbQuery<VendorRow>(
        `
          select id, name, phone, gst_number, default_collector_name, created_at, updated_at
          from vendors
        `,
      ),
      dbQuery<Pick<BillRow, 'id' | 'vendor_id' | 'total_amount_paise' | 'date'>>(
        `
          select id, vendor_id, total_amount_paise, date
          from bills
        `,
      ),
    ]);

    const vendorMap = vendors.rows.reduce((map, vendor) => {
      map.set(vendor.id, toVendorDoc(vendor).name);
      return map;
    }, new Map<string, string>());

    const normalizedBills = bills.rows.map((bill) => ({
      _id: bill.id,
      vendorId: bill.vendor_id,
      totalAmountPaise: bill.total_amount_paise,
      date: bill.date instanceof Date ? bill.date : new Date(bill.date),
    }));

    const paidByBill = await getPaymentTotalsByBillIds(normalizedBills.map((bill) => bill._id));
    const summarized = attachBillSummaries(normalizedBills, paidByBill, 30);

    const grouped = summarized.reduce((map, bill) => {
      const vendorId = String(bill.vendorId);
      map.set(vendorId, (map.get(vendorId) ?? 0) + bill.remainingPaise);
      return map;
    }, new Map<string, number>());

    const data = [...grouped.entries()]
      .map(([vendorId, outstandingPaise]) => ({
        vendorId,
        vendorName: vendorMap.get(vendorId) ?? 'Unknown',
        outstandingPaise,
      }))
      .sort((a, b) => b.outstandingPaise - a.outstandingPaise);

    sendOk(res, data);
  }),
);

analyticsRouter.get(
  '/monthly-spend',
  asyncHandler(async (_req, res) => {
    const monthly = await dbQuery<{
      year: number;
      month: number;
      total_paid_paise: number;
    }>(
      `
        select
          extract(year from date)::int as year,
          extract(month from date)::int as month,
          coalesce(sum(amount_paise), 0)::int as total_paid_paise
        from payments
        group by year, month
        order by year asc, month asc
      `,
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
  asyncHandler(async (_req, res) => {
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
        order by b.date asc
      `,
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
