import type { ParsedBillDraft } from '@/types/models';
import { rupeeToPaise } from '@/utils/currency';

const toIsoDate = (raw: string): string | null => {
  const normalized = raw.replace(/-/g, '/');
  const [dd, mm, yyyy] = normalized.split('/');
  if (!dd || !mm || !yyyy) {
    return null;
  }

  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const parseBillWithRegex = (text: string): ParsedBillDraft => {
  const billNo = text.match(/(?:Bill\s*No|Invoice\s*No|Inv#)[:\s-]*([A-Z0-9-]+)/i)?.[1] ?? null;
  const dateRaw = text.match(/(\d{2}[/-]\d{2}[/-]\d{4})/)?.[1] ?? null;
  const totalRaw = text.match(/(?:Total(?:\s*Amount)?|TOTAL)[:\sRs]*([\d,.]+)/i)?.[1] ?? null;

  const vendorLine = text.split('\n')[0]?.trim() ?? null;
  const totalAmount = totalRaw ? Number(totalRaw.replace(/,/g, '')) : null;

  return {
    billNumber: billNo,
    vendorName: vendorLine,
    date: dateRaw ? toIsoDate(dateRaw) : null,
    totalAmountPaise: totalAmount ? rupeeToPaise(totalAmount) : null,
    lineItems: [],
  };
};
