export function readDescriptorString(
  source: Record<string, unknown>,
  dataset: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = source[field] ?? dataset?.[field];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function readDescriptorRawString(
  source: Record<string, unknown>,
  dataset: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = source[field] ?? dataset?.[field];
  return typeof value === 'string' ? value : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
