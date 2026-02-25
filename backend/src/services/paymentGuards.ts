import type { PoolClient } from 'pg';

import { type BillRow } from '../db/mappers';
import { dbQuery } from '../db/postgres';
import { HttpError } from '../utils/http';

interface BillFinancialRow extends Pick<BillRow, 'id' | 'total_amount_paise'> {
  paid_paise: number;
}

const formatRupees = (amountPaise: number): string => (amountPaise / 100).toFixed(2);

export const fetchBillFinancialsForUpdate = async (
  billId: string,
  client: PoolClient,
): Promise<BillFinancialRow | null> => {
  const result = await dbQuery<BillFinancialRow>(
    `
      select
        b.id,
        b.total_amount_paise,
        coalesce(sum(p.amount_paise), 0)::int as paid_paise
      from bills b
      left join payments p on p.bill_id = b.id
      where b.id = $1
      group by b.id, b.total_amount_paise
      for update of b
    `,
    [billId],
    client,
  );

  return result.rows[0] ?? null;
};

export const assertPaymentWithinBillLimit = (params: {
  totalAmountPaise: number;
  alreadyPaidPaise: number;
  paymentAmountPaise: number;
  replacingAmountPaise?: number;
}): void => {
  const replacingAmountPaise = params.replacingAmountPaise ?? 0;
  const nextPaidPaise =
    params.alreadyPaidPaise - replacingAmountPaise + params.paymentAmountPaise;

  if (nextPaidPaise <= params.totalAmountPaise) {
    return;
  }

  const remainingPaise = Math.max(
    0,
    params.totalAmountPaise - (params.alreadyPaidPaise - replacingAmountPaise),
  );
  throw new HttpError(
    409,
    `Payment exceeds bill total. Remaining allowed is Rs ${formatRupees(remainingPaise)}.`,
  );
};
