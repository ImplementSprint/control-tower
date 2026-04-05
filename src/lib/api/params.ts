type BoundedIntegerInput = {
  rawValue: string | null | undefined;
  defaultValue: number;
  min: number;
  max: number;
};

export function parseBoundedIntegerParam({
  rawValue,
  defaultValue,
  min,
  max,
}: BoundedIntegerInput) {
  const parsed = Number(rawValue ?? "");

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function getTrimmedSearchParam(
  searchParams: URLSearchParams,
  key: string,
): string | null {
  const value = searchParams.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseOptionalNumberParam(
  rawValue: string | null,
  fieldName: string,
): { value: number | null; error: string | null } {
  if (!rawValue) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return {
      value: null,
      error: `${fieldName} must be a number.`,
    };
  }

  return {
    value: parsed,
    error: null,
  };
}
