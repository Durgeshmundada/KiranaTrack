interface VendorIdentityInput {
  name: string;
  phone: string | null;
  gstNumber: string | null;
  defaultCollectorName: string | null;
}

const normalizeText = (value: string | null): string =>
  (value ?? '').trim().toLowerCase();

const normalizePhone = (value: string | null): string =>
  normalizeText(value).replace(/[\s()-]/g, '');

const normalizeGst = (value: string | null): string =>
  normalizeText(value).toUpperCase();

export const hasVendorIdentityConflict = (
  existing: VendorIdentityInput,
  incoming: VendorIdentityInput,
): boolean => {
  const sameName = normalizeText(existing.name) === normalizeText(incoming.name);
  if (!sameName) {
    return false;
  }

  const existingPhone = normalizePhone(existing.phone);
  const incomingPhone = normalizePhone(incoming.phone);
  if (existingPhone && incomingPhone && existingPhone !== incomingPhone) {
    return true;
  }

  const existingGst = normalizeGst(existing.gstNumber);
  const incomingGst = normalizeGst(incoming.gstNumber);
  if (existingGst && incomingGst && existingGst !== incomingGst) {
    return true;
  }

  const existingCollector = normalizeText(existing.defaultCollectorName);
  const incomingCollector = normalizeText(incoming.defaultCollectorName);
  if (
    existingCollector &&
    incomingCollector &&
    existingCollector !== incomingCollector
  ) {
    return true;
  }

  return false;
};

