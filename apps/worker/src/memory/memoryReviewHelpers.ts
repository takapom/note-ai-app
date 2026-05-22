// Helper behavior for source-backed memory candidate review.
// Authority: docs/contracts/memory.md

import type { MemoryItemContract } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import type { MemoryReviewDecision, MemoryReviewInput, MemoryReviewRecord, MemoryReviewSqlWriteResult } from './memoryReviewTypes.ts';

export function validateMemoryReviewInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['memory review input must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.userId)) {
    errors.push('userId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.memoryId)) {
    errors.push('memoryId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

export function validateReviewableMemory(memory: MemoryItemContract): string[] {
  const validation = validateMemoryItem(memory);
  if (!validation.valid) {
    return validation.errors;
  }
  if (memory.status !== 'candidate' && memory.status !== 'pending') {
    return [`memory ${memory.id} must be candidate or pending for review`];
  }
  return [];
}

export function readMemoryEditContent(
  body: unknown,
): { ok: true; content: string } | { ok: false; errors: string[] } {
  if (!isRecord(body)) {
    return { ok: false, errors: ['body.content must be a non-empty string'] };
  }
  if (!isNonEmptyString(body.content)) {
    return { ok: false, errors: ['body.content must be a non-empty string'] };
  }
  if (body.content !== body.content.trim()) {
    return { ok: false, errors: ['body.content must not include leading or trailing whitespace'] };
  }
  return { ok: true, content: body.content };
}

export function isStatusOnlyMemoryReviewDecision(
  value: unknown,
): value is Exclude<MemoryReviewDecision, 'edited'> {
  return value === 'accepted' ||
    value === 'rejected' ||
    value === 'archived' ||
    value === 'held';
}

export function memoryKey(workspaceId: string, userId: string, memoryId: string): string {
  return `${workspaceId}\u0000${userId}\u0000${memoryId}`;
}

export function cloneMemory<T extends MemoryReviewRecord | MemoryItemContract>(memory: T): T {
  return {
    ...memory,
    ...(memory.sourceSpan === undefined ? {} : { sourceSpan: { ...memory.sourceSpan } }),
  };
}

export function readRowsAffected(result: MemoryReviewSqlWriteResult | void): number | undefined {
  if (result === undefined) {
    return undefined;
  }
  if (typeof result.rowsAffected === 'number') {
    return result.rowsAffected;
  }
  if (typeof result.changes === 'number') {
    return result.changes;
  }
  return undefined;
}

export function readRequiredString(value: unknown): string | undefined {
  return isStableRuntimeId(value) ? value : undefined;
}

export function readRequiredNonEmptyString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

export function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  return isNonEmptyString(value) ? value : null;
}

export function readRequiredBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  return undefined;
}

export function readRequiredConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

export function readRequiredFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readOptionalNonNegativeNumber(value: unknown): number | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toPersistenceErrorMessage(prefix: string, error: unknown): string {
  return error instanceof Error ? `${prefix}: ${error.message}` : prefix;
}
