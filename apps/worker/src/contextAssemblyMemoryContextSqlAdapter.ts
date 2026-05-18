// SQL adapter for context assembly memory context projections.
// Authority: docs/contracts/context-assembly.md
// Companion: docs/contracts/memory.md, docs/contracts/repository-topology.md, docs/contracts/cloudflare-agents-turso.md

import type {
  ContextAssemblyInput,
  TargetScopeKind,
} from '../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import {
  isMemoryStatus,
  isMemoryType,
} from '../../../contexts/memory/src/contract/memoryContract.ts';
import type {
  ContextAssemblyMemoryRetrievalPort,
  ContextAssemblyRuntimeRequest,
} from './contextAssemblyRuntimeFlow.ts';

type MemoryContextInput = NonNullable<ContextAssemblyInput['memoryContext']>;
type MemoryContextItemInput = NonNullable<MemoryContextInput['items']>[number];

export interface ContextAssemblyMemoryContextSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ContextAssemblyMemoryContextSqlExecutor {
  query(statement: ContextAssemblyMemoryContextSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export class TursoContextAssemblyMemoryContextSqlAdapter implements ContextAssemblyMemoryRetrievalPort {
  private readonly executor: ContextAssemblyMemoryContextSqlExecutor;

  constructor(input: { executor: ContextAssemblyMemoryContextSqlExecutor }) {
    this.executor = input.executor;
  }

  async loadMemoryContext(
    input: ContextAssemblyRuntimeRequest,
  ): Promise<ContextAssemblyInput['memoryContext']> {
    const requestResult = validateSupportedMemoryContextRequest(input);
    if (!requestResult.ok) {
      throw new Error(requestResult.errors.join('; '));
    }

    const rows = await this.executor.query(mapMemoryContextCandidatesLookupToSql(input));
    const result = mapMemoryContextRowsToMemoryContext(rows, input);
    if (!result.ok) {
      throw new Error(result.errors.join('; '));
    }

    return {
      items: result.items,
    };
  }
}

export function mapMemoryContextCandidatesLookupToSql(input: {
  workspaceId: string;
  userId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyMemoryContextSqlStatement {
  assertSupportedMemoryContextSqlRequest(input);

  const select = [
    'select memory_context_candidates.workspace_id as candidate_workspace_id, memory_context_candidates.user_id as candidate_user_id, memory_context_candidates.source_note_id as candidate_source_note_id, memory_context_candidates.source_scope, memory_context_candidates.source_target_id, memory_context_candidates.relevance_score, memory_items.id, memory_items.workspace_id, memory_items.user_id, memory_items.type, memory_items.content, memory_items.status, memory_items.pinned, memory_items.source_unit_id, memory_items.source_note_id as memory_source_note_id, memory_items.source_block_id, memory_items.source_start_offset, memory_items.source_end_offset, memory_items.confidence, memory_items.updated_at',
    'from memory_context_candidates',
    'inner join memory_items on memory_items.id = memory_context_candidates.memory_item_id',
  ];

  if (input.targetScope === 'section') {
    return {
      sql: [
        ...select,
        'where memory_context_candidates.workspace_id = ? and memory_context_candidates.user_id = ? and memory_context_candidates.source_note_id = ? and memory_context_candidates.source_scope = ? and memory_context_candidates.source_target_id = ? and memory_items.workspace_id = ? and memory_items.user_id = ?',
        'order by memory_context_candidates.retrieval_rank asc, memory_context_candidates.relevance_score desc, memory_items.id asc',
      ].join(' '),
      args: [
        input.workspaceId,
        input.userId,
        input.noteId,
        'section',
        input.targetId,
        input.workspaceId,
        input.userId,
      ],
    };
  }

  return {
    sql: [
      ...select,
      'where memory_context_candidates.workspace_id = ? and memory_context_candidates.user_id = ? and memory_context_candidates.source_note_id = ? and memory_context_candidates.source_scope = ? and memory_context_candidates.source_target_id is null and memory_items.workspace_id = ? and memory_items.user_id = ?',
      'order by memory_context_candidates.retrieval_rank asc, memory_context_candidates.relevance_score desc, memory_items.id asc',
    ].join(' '),
    args: [
      input.workspaceId,
      input.userId,
      input.noteId,
      'note',
      input.workspaceId,
      input.userId,
    ],
  };
}

export function mapMemoryContextRowsToMemoryContext(
  rows: readonly Record<string, unknown>[],
  expected: { workspaceId: string; userId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; items: MemoryContextItemInput[] } | { ok: false; errors: string[] } {
  const items: MemoryContextItemInput[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const item = mapMemoryContextRow(row, expected);
    if (!item.ok) {
      errors.push(...item.errors.map((error) => `memory context rows[${index}].${error}`));
      continue;
    }

    items.push(item.item);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, items };
}

function mapMemoryContextRow(
  row: Record<string, unknown>,
  expected: { workspaceId: string; userId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; item: MemoryContextItemInput } | { ok: false; errors: string[] } {
  const errors: string[] = validateCandidateScope(row, expected);
  if (hasForbiddenDumpField(row)) {
    errors.push('row must not include full workspace, full note, dump, all notes, or all memory fields');
  }

  const id = readRequiredStringColumn(row, 'id');
  const workspaceId = readRequiredStringColumn(row, 'workspace_id', 'workspaceId');
  const userId = readRequiredStringColumn(row, 'user_id', 'userId');
  const type = readRequiredStringColumn(row, 'type');
  const content = readRequiredStringColumn(row, 'content');
  const status = readRequiredStringColumn(row, 'status');
  const pinned = readRequiredBooleanColumn(row, 'pinned');
  const sourceUnitId = readOptionalStringColumn(row, 'source_unit_id', 'sourceUnitId');
  const sourceNoteId = readOptionalStringColumn(row, 'memory_source_note_id', 'sourceNoteId');
  const sourceBlockId = readOptionalStringColumn(row, 'source_block_id', 'sourceBlockId');
  const sourceStartOffset = readOptionalNonNegativeFiniteNumberColumn(
    row,
    'source_start_offset',
    'sourceStartOffset',
  );
  const sourceEndOffset = readOptionalNonNegativeFiniteNumberColumn(row, 'source_end_offset', 'sourceEndOffset');
  const confidence = readRequiredConfidenceColumn(row, 'confidence');
  const relevanceScore = readOptionalFiniteNumberColumn(row, 'relevance_score', 'relevanceScore');
  const updatedAt = readRequiredFiniteNumberColumn(row, 'updated_at', 'updatedAt');

  if (id === undefined) errors.push('id must be a non-empty string');
  if (workspaceId === undefined) {
    errors.push('workspace_id must be a non-empty string');
  } else if (workspaceId !== expected.workspaceId) {
    errors.push('workspace_id must match requested workspaceId');
  }
  if (userId === undefined) {
    errors.push('user_id must be a non-empty string');
  } else if (userId !== expected.userId) {
    errors.push('user_id must match requested userId');
  }
  if (type === undefined) {
    errors.push('type must be a memory type');
  } else if (!isMemoryType(type)) {
    errors.push('type must be a memory type');
  }
  if (content === undefined) errors.push('content must be a non-empty string');
  if (status === undefined) {
    errors.push('status must be a memory status');
  } else if (!isMemoryStatus(status)) {
    errors.push('status must be a memory status');
  }
  if (pinned === undefined) errors.push('pinned must be a boolean');
  if (sourceUnitId === null) errors.push('source_unit_id must be a non-empty string when provided');
  if (sourceNoteId === null) errors.push('source_note_id must be a non-empty string when provided');
  if (sourceBlockId === null) errors.push('source_block_id must be a non-empty string when provided');
  if (sourceStartOffset === null) errors.push('source_start_offset must be a non-negative finite number when provided');
  if (sourceEndOffset === null) errors.push('source_end_offset must be a non-negative finite number when provided');
  if (confidence === undefined) errors.push('confidence must be a finite number between 0 and 1');
  if (relevanceScore === null) errors.push('relevance_score must be a finite number when provided');
  if (updatedAt === undefined) errors.push('updated_at must be a finite number');

  const spanTouched =
    sourceBlockId !== undefined || sourceStartOffset !== undefined || sourceEndOffset !== undefined;
  if (spanTouched) {
    if (sourceBlockId === undefined) errors.push('source_block_id must be provided when source offsets are provided');
    if (sourceStartOffset === undefined) {
      errors.push('source_start_offset must be provided when source_block_id or source_end_offset is provided');
    }
    if (sourceEndOffset === undefined) {
      errors.push('source_end_offset must be provided when source_block_id or source_start_offset is provided');
    }
  }
  if (
    typeof sourceStartOffset === 'number' &&
    typeof sourceEndOffset === 'number' &&
    sourceEndOffset < sourceStartOffset
  ) {
    errors.push('source_end_offset must be greater than or equal to source_start_offset');
  }

  const hasSourceSpan =
    typeof sourceBlockId === 'string' &&
    typeof sourceStartOffset === 'number' &&
    typeof sourceEndOffset === 'number' &&
    sourceEndOffset >= sourceStartOffset;
  if (sourceUnitId === undefined && sourceNoteId === undefined && !hasSourceSpan) {
    errors.push('memory item must include source provenance');
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    workspaceId === undefined ||
    workspaceId !== expected.workspaceId ||
    userId === undefined ||
    userId !== expected.userId ||
    type === undefined ||
    !isMemoryType(type) ||
    content === undefined ||
    status === undefined ||
    !isMemoryStatus(status) ||
    pinned === undefined ||
    confidence === undefined ||
    updatedAt === undefined ||
    sourceUnitId === null ||
    sourceNoteId === null ||
    sourceBlockId === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    item: {
      id,
      type,
      content,
      status,
      pinned,
      ...(typeof sourceUnitId === 'string' ? { sourceUnitId } : {}),
      ...(typeof sourceNoteId === 'string' ? { sourceNoteId } : {}),
      ...(hasSourceSpan
        ? {
            sourceSpan: {
              sourceBlockId,
              startOffset: sourceStartOffset,
              endOffset: sourceEndOffset,
            },
          }
        : {}),
      confidence,
      ...(typeof relevanceScore === 'number' ? { relevanceScore } : {}),
      updatedAt,
    },
  };
}

function validateCandidateScope(
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

function validateSupportedMemoryContextRequest(
  input: ContextAssemblyRuntimeRequest,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isTrimmedNonEmptyString(input.userId)) {
    errors.push('userId must be provided for memory context retrieval');
  }
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

function assertSupportedMemoryContextSqlRequest(input: {
  userId?: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): void {
  if (!isTrimmedNonEmptyString(input.userId)) {
    throw new Error('userId must be provided for memory context retrieval');
  }
  if (input.targetScope === 'chunk') {
    throw new Error('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  }
  if (input.targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    throw new Error('targetId must be provided for section target scope');
  }
}

function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return isTrimmedNonEmptyString(value) ? value : undefined;
}

function readOptionalStringColumn(
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

function readRequiredBooleanColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): boolean | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'boolean' ? value : undefined;
}

function readRequiredFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalFiniteNumberColumn(
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

function readOptionalNonNegativeFiniteNumberColumn(
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

function readRequiredConfidenceColumn(
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

function hasForbiddenDumpField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenDumpField);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes('fullworkspace') ||
      normalized.includes('fullnote') ||
      normalized.includes('dump') ||
      normalized.includes('allnotes') ||
      normalized.includes('allmemory')
    ) {
      return true;
    }
    if (hasForbiddenDumpField(child)) {
      return true;
    }
  }

  return false;
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}
