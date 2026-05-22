// Row reader helpers for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md

import {
  relatedContextRetrievalOrder,
  type RelatedContextRetrievalReason,
  type TargetScopeKind,
} from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { ContextAssemblyRuntimeRequest } from './contextAssemblyRuntimeFlow.ts';

export function validateCandidateScope(
  row: Record<string, unknown>,
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): string[] {
  const errors: string[] = [];
  const candidateWorkspaceId = readRequiredStringColumn(row, 'candidate_workspace_id', 'workspace_id');
  const sourceNoteId = readRequiredStringColumn(row, 'source_note_id', 'sourceNoteId');
  const sourceScope = readRequiredStringColumn(row, 'source_scope', 'sourceScope');
  const sourceTargetId = readOptionalStringColumn(row, 'source_target_id', 'sourceTargetId');

  if (candidateWorkspaceId === undefined) {
    errors.push('candidate_workspace_id must be a non-empty string');
  } else if (candidateWorkspaceId !== expected.workspaceId) {
    errors.push('candidate_workspace_id must match requested workspaceId');
  }
  if (sourceNoteId === undefined) {
    errors.push('source_note_id must be a non-empty string');
  } else if (sourceNoteId !== expected.noteId) {
    errors.push('source_note_id must match requested noteId');
  }
  if (sourceScope === undefined) {
    errors.push('source_scope must be section or note');
  } else if (sourceScope !== expected.targetScope) {
    errors.push('source_scope must match requested targetScope');
  }
  if (sourceTargetId === null) {
    errors.push('source_target_id must be a non-empty string when provided');
  } else if (expected.targetScope === 'section') {
    if (sourceTargetId === undefined) {
      errors.push('source_target_id must be provided for section target scope');
    } else if (sourceTargetId !== expected.targetId) {
      errors.push('source_target_id must match requested targetId');
    }
  } else if (sourceTargetId !== undefined) {
    errors.push('source_target_id must be absent for note target scope');
  }

  return errors;
}

export function validateSupportedRelatedContextRequest(
  input: ContextAssemblyRuntimeRequest,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (input.targetScope === 'chunk') {
    errors.push('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  } else if (input.targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    errors.push('targetId must be provided for section target scope');
  } else if (input.targetScope !== 'section' && input.targetScope !== 'note') {
    errors.push('targetScope must be section or note');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function assertSupportedRelatedContextSqlRequest(input: {
  targetScope: TargetScopeKind;
  targetId?: string;
}): void {
  if (input.targetScope === 'chunk') {
    throw new Error('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  }
  if (input.targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    throw new Error('targetId must be provided for section target scope');
  }
}

export function readRequiredSourceBlockIds(
  row: Record<string, unknown>,
  sourceBlockId: string | undefined | null,
): string[] | undefined | null {
  const sourceBlockIds = readStringArrayColumn(row, 'source_block_ids', 'sourceBlockIds');
  if (sourceBlockIds !== undefined) {
    return sourceBlockIds;
  }

  return typeof sourceBlockId === 'string' ? [sourceBlockId] : undefined;
}

export function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return isTrimmedNonEmptyString(value) ? value : undefined;
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

export function readRequiredTextColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'string' ? value : undefined;
}

export function readRequiredNonNegativeFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function readOptionalNonNegativeFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredNonNegativeFiniteNumberColumn(row, primaryColumn, fallbackColumn) ?? null;
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

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readOptionalConfidenceColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = readOptionalFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined || value === null) {
    return value;
  }

  return value >= 0 && value <= 1 ? value : null;
}

export function readStringArrayColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string[] | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.every(isTrimmedNonEmptyString) ? [...value] : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isTrimmedNonEmptyString) ? [...parsed] : null;
  } catch {
    return null;
  }
}

export function readOptionalRetrievalReasonColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): RelatedContextRetrievalReason | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' && (relatedContextRetrievalOrder as readonly string[]).includes(value)
    ? (value as RelatedContextRetrievalReason)
    : null;
}


export function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}
