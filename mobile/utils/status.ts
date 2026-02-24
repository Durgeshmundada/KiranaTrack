import type { Bill, BillStatus } from '@/types/models';
import { daysSince } from '@/utils/date';

export const totalPaidPaise = (bill: Bill): number =>
  bill.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);

export const remainingPaise = (bill: Bill): number =>
  Math.max(0, bill.totalAmountPaise - totalPaidPaise(bill));

export const computeBillStatus = (bill: Bill, overdueThresholdDays: number): BillStatus => {
  const paid = totalPaidPaise(bill);
  const remaining = Math.max(0, bill.totalAmountPaise - paid);

  if (remaining === 0) {
    return 'cleared';
  }

  if (daysSince(bill.date) > overdueThresholdDays) {
    return 'overdue';
  }

  if (paid === 0) {
    return 'unpaid';
  }

  return 'partial';
};

export const statusOrder: BillStatus[] = ['overdue', 'partial', 'unpaid', 'cleared'];
