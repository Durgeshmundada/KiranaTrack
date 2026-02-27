export interface LineItemAmountLike {
  amountPaise: number;
}

const DEFAULT_TOLERANCE_PAISE = 100; // Rs 1 rounding tolerance.

export const sumLineItemAmounts = (
  lineItems: LineItemAmountLike[],
): number => lineItems.reduce((sum, item) => sum + item.amountPaise, 0);

export const isLineItemTotalWithinTolerance = (
  totalAmountPaise: number,
  lineItems: LineItemAmountLike[],
  tolerancePaise = DEFAULT_TOLERANCE_PAISE,
): boolean => {
  if (lineItems.length === 0) {
    return true;
  }

  const computedTotal = sumLineItemAmounts(lineItems);
  return Math.abs(computedTotal - totalAmountPaise) <= tolerancePaise;
};

