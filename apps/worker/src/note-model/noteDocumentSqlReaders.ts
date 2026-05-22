// Row reader helpers for canonical Note / Section / Block persistence.
// Authority: docs/contracts/data-model.md

import type { BlockContentContract, HeadingLevel } from '../../../../contexts/note-model/src/contract/noteContract.ts';

export function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim().length > 0 && value.trim() === value ? value : undefined;
}

export function readOptionalStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredStringColumn(row, primaryColumn, fallbackColumn) ?? null;
}

export function readStringColumnAllowEmpty(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'string' ? value : undefined;
}

export function readOptionalBooleanColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): boolean | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return null;
}

export function readRequiredFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readOptionalFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }
  return readRequiredFiniteNumberColumn(row, primaryColumn, fallbackColumn) ?? null;
}

export function readOptionalHeadingLevelColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): HeadingLevel | undefined | null {
  const value = readOptionalFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined || value === null) {
    return value;
  }
  return value === 1 || value === 2 || value === 3 ? value : null;
}

export function readContentJsonColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): BlockContentContract | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BlockContentContract;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as BlockContentContract;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function toSqlErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  return prefix;
}
