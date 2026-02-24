export type BillStatus = 'unpaid' | 'partial' | 'cleared' | 'overdue';

export interface BillPaymentSummary {
  paidPaise: number;
  remainingPaise: number;
  status: BillStatus;
}

export const computeBillPaymentSummary = (
  totalAmountPaise: number,
  paidPaise: number,
  billDate: Date,
  overdueDays: number,
): BillPaymentSummary => {
  const remainingPaise = Math.max(0, totalAmountPaise - paidPaise);
  if (remainingPaise === 0) {
    return {
      paidPaise,
      remainingPaise,
      status: 'cleared',
    };
  }

  const diffMs = Date.now() - billDate.getTime();
  const ageDays = diffMs / (1000 * 60 * 60 * 24);

  if (ageDays > overdueDays) {
    return {
      paidPaise,
      remainingPaise,
      status: 'overdue',
    };
  }

  if (paidPaise > 0) {
    return {
      paidPaise,
      remainingPaise,
      status: 'partial',
    };
  }

  return {
    paidPaise,
    remainingPaise,
    status: 'unpaid',
  };
};
