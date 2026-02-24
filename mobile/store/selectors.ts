import type { Bill, BillStatus, DashboardSummary, UdhaarCustomer, Vendor } from '@/types/models';
import { monthKey } from '@/utils/date';
import { computeBillStatus, remainingPaise, totalPaidPaise } from '@/utils/status';

export const resolveVendor = (vendors: Vendor[], vendorId: string): Vendor | undefined =>
  vendors.find((vendor) => vendor.id === vendorId);

export const withComputedStatus = (
  bills: Bill[],
  overdueDays: number,
): Array<Bill & { computedStatus: BillStatus; remainingPaise: number; paidPaise: number }> =>
  bills.map((bill) => ({
    ...bill,
    computedStatus: computeBillStatus(bill, overdueDays),
    remainingPaise: remainingPaise(bill),
    paidPaise: totalPaidPaise(bill),
  }));

export const dashboardSummary = (
  bills: Bill[],
  overdueDays: number,
  pendingNotepadCount: number,
): DashboardSummary => {
  const statusReady = withComputedStatus(bills, overdueDays);
  return {
    totalOutstandingPaise: statusReady.reduce((sum, bill) => sum + bill.remainingPaise, 0),
    overdueCount: statusReady.filter((bill) => bill.computedStatus === 'overdue').length,
    todaysBills: bills.filter((bill) => {
      const today = new Date().toISOString().slice(0, 10);
      return bill.createdAt.slice(0, 10) === today;
    }).length,
    pendingNotepadCount,
  };
};

export const customerBalancePaise = (customer: UdhaarCustomer): number => {
  const credit = customer.entries
    .filter((entry) => entry.type === 'credit')
    .reduce((sum, entry) => sum + entry.amountPaise, 0);
  const repayment = customer.entries
    .filter((entry) => entry.type === 'repayment')
    .reduce((sum, entry) => sum + entry.amountPaise, 0);

  return credit - repayment;
};

export const totalsForCustomers = (customers: UdhaarCustomer[]): { receivablePaise: number } => ({
  receivablePaise: customers.reduce((sum, customer) => sum + customerBalancePaise(customer), 0),
});

export const vendorWiseOutstanding = (
  bills: Bill[],
  vendors: Vendor[],
  overdueDays: number,
): Array<{ vendorName: string; outstandingPaise: number }> => {
  const grouped = new Map<string, number>();
  withComputedStatus(bills, overdueDays).forEach((bill) => {
    const vendorName = resolveVendor(vendors, bill.vendorId)?.name ?? 'Unknown';
    grouped.set(vendorName, (grouped.get(vendorName) ?? 0) + bill.remainingPaise);
  });

  return [...grouped.entries()]
    .map(([vendorName, outstandingPaise]) => ({ vendorName, outstandingPaise }))
    .sort((a, b) => b.outstandingPaise - a.outstandingPaise);
};

export const monthlySpend = (bills: Bill[]): Array<{ month: string; totalPaidPaise: number }> => {
  const grouped = new Map<string, number>();

  bills.forEach((bill) => {
    bill.payments.forEach((payment) => {
      const key = monthKey(payment.date);
      grouped.set(key, (grouped.get(key) ?? 0) + payment.amountPaise);
    });
  });

  return [...grouped.entries()]
    .map(([month, totalPaidPaise]) => ({ month, totalPaidPaise }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);
};

export const statusBreakdown = (bills: Bill[], overdueDays: number): Array<{ status: BillStatus; count: number }> => {
  const counts: Record<BillStatus, number> = {
    unpaid: 0,
    partial: 0,
    overdue: 0,
    cleared: 0,
  };

  withComputedStatus(bills, overdueDays).forEach((bill) => {
    counts[bill.computedStatus] += 1;
  });

  return Object.entries(counts).map(([status, count]) => ({
    status: status as BillStatus,
    count,
  }));
};

export const recentPayments = (bills: Bill[], vendors: Vendor[]) =>
  bills
    .flatMap((bill) =>
      bill.payments.map((payment) => ({
        ...payment,
        vendorName: resolveVendor(vendors, bill.vendorId)?.name ?? 'Unknown',
        billNumber: bill.billNumber,
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
