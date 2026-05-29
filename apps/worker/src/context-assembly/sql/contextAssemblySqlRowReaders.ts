// SQL row reader helpers for context assembly retrieval adapters.
// Authority: docs/contracts/context-assembly.md

import {
  hasForbiddenContextDumpField,
  relatedContextRetrievalOrder,
  type RelatedContextRetrievalReason,
  type TargetScopeKind,
} from '../../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { ContextAssemblyRuntimeRequest } from '../contextAssemblyRuntimeFlow.ts';

const forbiddenContextDumpRowMessage = 'row must not include full workspace, full note, dump, all notes, or all memory fields';

export function validateNoForbiddenContextDumpFields(row: Record<string, unknown>): string[] {
  return hasForbiddenContextDumpField(row) ? [forbiddenContextDumpRowMessage] : [];
}

export function validateRelatedContextCandidateScope(
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

export function validateMemoryContextCandidateScope(
  row: Record<string, unknown>,
  expected: { workspaceId: string; userId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): string[] {
  const errors: string[] = [];
  const candidateWorkspaceId = readRequiredStringColumn(row, 'candidate_workspace_id', 'workspace_id');
  const candidateUserId = readRequiredStringColumn(row, 'candidate_user_id', 'user_id');
  const candidateSourceNoteId = readRequiredStringColumn(row, 'candidate_source_note_id', 'sourceNoteId');
  const sourceScope = readRequiredStringColumn(row, 'source_scope', 'sourceScope');
  const sourceTargetId = readOptionalStringColumn(row, 'source_target_id', 'sourceTargetId');

  if (candidateWorkspaceId === undefined) {
    errors.push('candidate_workspace_id must be a non-empty string');
  } else if (candidateWorkspaceId !== expected.workspaceId) {
    errors.push('candidate_workspace_id must match requested workspaceId');
  }
  if (candidateUserId === undefined) {
    errors.push('candidate_user_id must be a non-empty string');
  } else if (candidateUserId !== expected.userId) {
    errors.push('candidate_user_id must match requested userId');
  }
  if (candidateSourceNoteId === undefined) {
    errors.push('candidate_source_note_id must be a non-empty string');
  } else if (candidateSourceNoteId !== expected.noteId) {
    errors.push('candidate_source_note_id must match requested noteId');
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
  const errors = validateSupportedTargetScope(input);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function validateSupportedMemoryContextRequest(
  input: ContextAssemblyRuntimeRequest,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isTrimmedNonEmptyString(input.userId)) {
    errors.push('userId must be provided for memory context retrieval');
  }
  errors.push(...validateSupportedTargetScope(input));

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function assertSupportedRelatedContextSqlRequest(input: {
  targetScope: TargetScopeKind;
  targetId?: string;
}): void {
  assertSupportedTargetScope(input);
}

export function assertSupportedMemoryContextSqlRequest(input: {
  userId?: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): void {
  if (!isTrimmedNonEmptyString(input.userId)) {
    throw new Error('userId must be provided for memory context retrieval');
  }
  assertSupportedTargetScope(input);
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
  const value = readColumn(row, primaryColumn, fallbackColumn);
  return isTrimmedNonEmptyString(value) ? value : undefined;
}

export function readOptionalStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined | null {
  const value = readColumn(row, primaryColumn, fallbackColumn);
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
  const value = readColumn(row, primaryColumn, fallbackColumn);
  return typeof value === 'string' ? value : undefined;
}

export function readRequiredBooleanColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): boolean | undefined {
  const value = readColumn(row, primaryColumn, fallbackColumn);
  return typeof value === 'boolean' ? value : undefined;
}

export function readRequiredFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = readColumn(row, primaryColumn, fallbackColumn);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readRequiredNonNegativeFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = readRequiredFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  return value !== undefined && value >= 0 ? value : undefined;
}

export function readOptionalFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = readColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readOptionalNonNegativeFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = readOptionalFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined || value === null) {
    return value;
  }

  return value >= 0 ? value : null;
}

export function readRequiredConfidenceColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = readRequiredFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined) {
    return undefined;
  }

  return value >= 0 && value <= 1 ? value : undefined;
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
  const value = readColumn(row, primaryColumn, fallbackColumn);
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
  const value = readColumn(row, primaryColumn, fallbackColumn);
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

function validateSupportedTargetScope(input: { targetScope: TargetScopeKind; targetId?: string }): string[] {
  const targetScope: string = input.targetScope;
  if (targetScope === 'chunk') {
    return ['targetScope chunk is unsupported until a stable chunk SQL schema exists'];
  }
  if (targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    return ['targetId must be provided for section target scope'];
  }
  if (targetScope !== 'section' && targetScope !== 'note') {
    return ['targetScope must be section or note'];
  }

  return [];
}

function assertSupportedTargetScope(input: { targetScope: TargetScopeKind; targetId?: string }): void {
  const errors = validateSupportedTargetScope(input);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}

function readColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): unknown {
  return row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
}
