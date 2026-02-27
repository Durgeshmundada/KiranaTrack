const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const toIsoFromDateInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!DATE_INPUT_REGEX.test(trimmed)) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (parsed.toISOString().slice(0, 10) !== trimmed) {
    return null;
  }

  return parsed.toISOString();
};
