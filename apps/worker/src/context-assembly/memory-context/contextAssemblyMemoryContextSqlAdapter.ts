// SQL adapter for context assembly memory context projections.
// Authority: docs/contracts/context-assembly.md
// Companion: docs/contracts/memory.md, docs/contracts/repository-topology.md, docs/contracts/cloudflare-agents-turso.md

import type {
  ContextAssemblyInput,
  TargetScopeKind,
} from '../../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import {
  isMemoryStatus,
  isMemoryType,
} from '../../../../../contexts/memory/src/contract/memoryContract.ts';
import type {
  ContextAssemblyMemoryRetrievalPort,
  ContextAssemblyRuntimeRequest,
} from '../contextAssemblyRuntimeFlow.ts';
import {
  assertSupportedMemoryContextSqlRequest,
  readOptionalFiniteNumberColumn,
  readOptionalNonNegativeFiniteNumberColumn,
  readOptionalStringColumn,
  readRequiredBooleanColumn,
  readRequiredConfidenceColumn,
  readRequiredFiniteNumberColumn,
  readRequiredStringColumn,
  validateMemoryContextCandidateScope,
  validateNoForbiddenContextDumpFields,
  validateSupportedMemoryContextRequest,
} from '../sql/contextAssemblySqlRowReaders.ts';

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
  const errors: string[] = [
    ...validateMemoryContextCandidateScope(row, expected),
    ...validateNoForbiddenContextDumpFields(row),
  ];

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
