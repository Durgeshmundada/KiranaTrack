export const paiseToRupee = (paise: number): number => paise / 100;

export const rupeeToPaise = (rupee: number): number => Math.round(rupee * 100);

const INR_SYMBOL = '\u20b9';

const trimTrailingZero = (value: string): string => value.replace(/\.0$/, '');

const formatSigned = (value: number, formatter: (absoluteValue: number) => string): string => {
  const sign = value < 0 ? '-' : '';
  return `${sign}${INR_SYMBOL}${formatter(Math.abs(value))}`;
};

export const formatINRFromPaise = (paise: number): string => {
  const rupee = Math.round(paiseToRupee(paise));
  return formatSigned(rupee, (absoluteRupee) =>
    Math.round(absoluteRupee).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    }),
  );
};

export const formatCompactINRFromPaise = (paise: number): string => {
  const rupee = paiseToRupee(paise);
  return formatSigned(rupee, (absoluteRupee) => {
    if (absoluteRupee >= 1_00_00_000) {
      return `${trimTrailingZero((absoluteRupee / 1_00_00_000).toFixed(1))}Cr`;
    }
    if (absoluteRupee >= 1_00_000) {
      return `${trimTrailingZero((absoluteRupee / 1_00_000).toFixed(1))}L`;
    }
    if (absoluteRupee >= 1_000) {
      return `${trimTrailingZero((absoluteRupee / 1_000).toFixed(1))}K`;
    }
    return Math.round(absoluteRupee).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    });
  });
};
