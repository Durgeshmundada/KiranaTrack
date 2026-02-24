export const paiseToRupee = (paise: number): number => paise / 100;

export const rupeeToPaise = (rupee: number): number => Math.round(rupee * 100);

export const formatINRFromPaise = (paise: number): string => {
  const rupee = paiseToRupee(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupee);
};

export const formatCompactINRFromPaise = (paise: number): string => {
  const rupee = paiseToRupee(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(rupee);
};
