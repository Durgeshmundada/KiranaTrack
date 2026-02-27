import { dbQuery } from '../db/postgres';
import { computeBillPaymentSummary } from '../utils/billStatus';

interface BillLike {
  _id: string;
  totalAmountPaise: number;
  date: Date;
}

export const getPaymentTotalsByBillIds = async (
  billIds: string[],
): Promise<Map<string, number>> => {
  if (billIds.length === 0) {
    return new Map();
  }

  const totals = await dbQuery<{
    bill_id: string;
    paid_paise: number;
  }>(
    `
      select bill_id, coalesce(sum(amount_paise), 0)::int as paid_paise
      from payments
      where bill_id = any($1::text[])
        and deleted_at is null
      group by bill_id
    `,
    [billIds],
  );

  return totals.rows.reduce((map, row) => {
    map.set(row.bill_id, row.paid_paise);
    return map;
  }, new Map<string, number>());
};

export const attachBillSummaries = <T extends BillLike>(
  bills: T[],
  paidByBillId: Map<string, number>,
  overdueDays: number,
): Array<T & { paidPaise: number; remainingPaise: number; status: string }> => {
  return bills.map((bill) => {
    const paidPaise = paidByBillId.get(String(bill._id)) ?? 0;
    const summary = computeBillPaymentSummary(
      bill.totalAmountPaise,
      paidPaise,
      bill.date,
      overdueDays,
    );

    return {
      ...bill,
      paidPaise: summary.paidPaise,
      remainingPaise: summary.remainingPaise,
      status: summary.status,
    };
  });
};
