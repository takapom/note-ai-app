import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assembleContextEnvelope,
} from '../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import {
  mapMemoryContextCandidatesLookupToSql,
  mapMemoryContextRowsToMemoryContext,
  TursoContextAssemblyMemoryContextSqlAdapter,
} from '../../apps/worker/src/contextAssemblyMemoryContextSqlAdapter.ts';
import { noteFixture, sectionFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const runtimeInput = {
  workspaceId: noteFixture.workspaceId,
  userId: 'user_001',
  noteId: noteFixture.id,
  structureJobId: 'structure_job_context_001',
  targetScope: 'section',
  targetId: sectionFixture.id,
  now: 1_764_000_300_000,
};

test('context assembly memory context SQL reads scoped memory candidates without note or block dumps', () => {
  assert.deepEqual(mapMemoryContextCandidatesLookupToSql(runtimeInput), {
    sql: [
      'select memory_context_candidates.workspace_id as candidate_workspace_id, memory_context_candidates.user_id as candidate_user_id, memory_context_candidates.source_note_id as candidate_source_note_id, memory_context_candidates.source_scope, memory_context_candidates.source_target_id, memory_context_candidates.relevance_score, memory_items.id, memory_items.workspace_id, memory_items.user_id, memory_items.type, memory_items.content, memory_items.status, memory_items.pinned, memory_items.source_unit_id, memory_items.source_note_id as memory_source_note_id, memory_items.source_block_id, memory_items.source_start_offset, memory_items.source_end_offset, memory_items.confidence, memory_items.updated_at',
      'from memory_context_candidates',
      'inner join memory_items on memory_items.id = memory_context_candidates.memory_item_id',
      'where memory_context_candidates.workspace_id = ? and memory_context_candidates.user_id = ? and memory_context_candidates.source_note_id = ? and memory_context_candidates.source_scope = ? and memory_context_candidates.source_target_id = ? and memory_items.workspace_id = ? and memory_items.user_id = ?',
      'order by memory_context_candidates.retrieval_rank asc, memory_context_candidates.relevance_score desc, memory_items.id asc',
    ].join(' '),
    args: [
      noteFixture.workspaceId,
      runtimeInput.userId,
      noteFixture.id,
      'section',
      sectionFixture.id,
      noteFixture.workspaceId,
      runtimeInput.userId,
    ],
  });
});

test('context assembly memory context SQL reads note-level candidate scope', () => {
  const noteInput = {
    ...runtimeInput,
    targetScope: 'note',
  };
  delete noteInput.targetId;

  assert.deepEqual(mapMemoryContextCandidatesLookupToSql(noteInput), {
    sql: [
      'select memory_context_candidates.workspace_id as candidate_workspace_id, memory_context_candidates.user_id as candidate_user_id, memory_context_candidates.source_note_id as candidate_source_note_id, memory_context_candidates.source_scope, memory_context_candidates.source_target_id, memory_context_candidates.relevance_score, memory_items.id, memory_items.workspace_id, memory_items.user_id, memory_items.type, memory_items.content, memory_items.status, memory_items.pinned, memory_items.source_unit_id, memory_items.source_note_id as memory_source_note_id, memory_items.source_block_id, memory_items.source_start_offset, memory_items.source_end_offset, memory_items.confidence, memory_items.updated_at',
      'from memory_context_candidates',
      'inner join memory_items on memory_items.id = memory_context_candidates.memory_item_id',
      'where memory_context_candidates.workspace_id = ? and memory_context_candidates.user_id = ? and memory_context_candidates.source_note_id = ? and memory_context_candidates.source_scope = ? and memory_context_candidates.source_target_id is null and memory_items.workspace_id = ? and memory_items.user_id = ?',
      'order by memory_context_candidates.retrieval_rank asc, memory_context_candidates.relevance_score desc, memory_items.id asc',
    ].join(' '),
    args: [
      noteFixture.workspaceId,
      runtimeInput.userId,
      noteFixture.id,
      'note',
      noteFixture.workspaceId,
      runtimeInput.userId,
    ],
  });
});

test('context assembly memory context row mapper converts candidate rows and preserves row order', () => {
  assert.deepEqual(mapMemoryContextRowsToMemoryContext([
    memoryRow({
      id: 'memory_active_001',
      status: 'active',
      pinned: false,
      source_unit_id: 'unit_001',
      memory_source_note_id: null,
      source_block_id: null,
      source_start_offset: null,
      source_end_offset: null,
    }),
    memoryRow({
      id: 'memory_pinned_001',
      status: 'pinned',
      pinned: true,
      source_unit_id: null,
      memory_source_note_id: noteFixture.id,
      source_block_id: null,
      source_start_offset: null,
      source_end_offset: null,
      relevance_score: null,
    }),
    memoryRow({
      id: 'memory_candidate_001',
      status: 'candidate',
      pinned: false,
    }),
    memoryRow({
      id: 'memory_pending_001',
      status: 'pending',
      pinned: false,
    }),
    memoryRow({
      id: 'memory_rejected_001',
      status: 'rejected',
      pinned: false,
    }),
    memoryRow({
      id: 'memory_archived_001',
      status: 'archived',
      pinned: false,
    }),
  ], runtimeInput), {
    ok: true,
    items: [
      {
        id: 'memory_active_001',
        type: 'past_decision',
        content: 'Keep writing uninterrupted before AI structure runs.',
        status: 'active',
        pinned: false,
        sourceUnitId: 'unit_001',
        confidence: 0.91,
        relevanceScore: 0.7,
        updatedAt: 1_764_000_100_000,
      },
      {
        id: 'memory_pinned_001',
        type: 'past_decision',
        content: 'Keep writing uninterrupted before AI structure runs.',
        status: 'pinned',
        pinned: true,
        sourceNoteId: noteFixture.id,
        confidence: 0.91,
        updatedAt: 1_764_000_100_000,
      },
      {
        id: 'memory_candidate_001',
        type: 'past_decision',
        content: 'Keep writing uninterrupted before AI structure runs.',
        status: 'candidate',
        pinned: false,
        sourceNoteId: noteFixture.id,
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
        updatedAt: 1_764_000_100_000,
      },
      {
        id: 'memory_pending_001',
        type: 'past_decision',
        content: 'Keep writing uninterrupted before AI structure runs.',
        status: 'pending',
        pinned: false,
        sourceNoteId: noteFixture.id,
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
        updatedAt: 1_764_000_100_000,
      },
      {
        id: 'memory_rejected_001',
        type: 'past_decision',
        content: 'Keep writing uninterrupted before AI structure runs.',
        status: 'rejected',
        pinned: false,
        sourceNoteId: noteFixture.id,
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
        updatedAt: 1_764_000_100_000,
      },
      {
        id: 'memory_archived_001',
        type: 'past_decision',
        content: 'Keep writing uninterrupted before AI structure runs.',
        status: 'archived',
        pinned: false,
        sourceNoteId: noteFixture.id,
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
        updatedAt: 1_764_000_100_000,
      },
    ],
  });
});

test('context assembly contract filters non-active memory candidates after adapter mapping', () => {
  const result = mapMemoryContextRowsToMemoryContext([
    memoryRow({ id: 'memory_active_001', status: 'active' }),
    memoryRow({ id: 'memory_pinned_001', status: 'pinned', pinned: true }),
    memoryRow({ id: 'memory_candidate_001', status: 'candidate' }),
    memoryRow({ id: 'memory_pending_001', status: 'pending' }),
    memoryRow({ id: 'memory_rejected_001', status: 'rejected' }),
    memoryRow({ id: 'memory_archived_001', status: 'archived' }),
  ], runtimeInput);

  assert.equal(result.ok, true);
  const envelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    memoryContext: {
      items: result.items,
    },
  });

  assert.deepEqual(envelope.memoryContext.items.map((item) => item.id), [
    'memory_pinned_001',
    'memory_active_001',
  ]);
});

test('context assembly memory context mapper rejects invalid projection rows', () => {
  const result = mapMemoryContextRowsToMemoryContext([
    {
      candidate_workspace_id: 'workspace_other',
      candidate_user_id: 'user_other',
      candidate_source_note_id: 'note_other',
      source_scope: 'note',
      source_target_id: 'section_other',
      id: '',
      workspace_id: 'workspace_other',
      user_id: 'user_other',
      type: 'unknown_memory_type',
      content: '',
      status: 'unknown_status',
      pinned: 1,
      source_unit_id: ' invalid_unit ',
      memory_source_note_id: ' invalid_note ',
      source_block_id: ' invalid_block ',
      source_start_offset: Number.NaN,
      source_end_offset: -1,
      confidence: 1.1,
      relevance_score: 'high',
      updated_at: Number.POSITIVE_INFINITY,
    },
  ], runtimeInput);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'memory context rows[0].candidate_workspace_id must match requested workspaceId',
    'memory context rows[0].candidate_user_id must match requested userId',
    'memory context rows[0].candidate_source_note_id must match requested noteId',
    'memory context rows[0].source_scope must match requested targetScope',
    'memory context rows[0].source_target_id must match requested targetId',
    'memory context rows[0].id must be a non-empty string',
    'memory context rows[0].workspace_id must match requested workspaceId',
    'memory context rows[0].user_id must match requested userId',
    'memory context rows[0].type must be a memory type',
    'memory context rows[0].content must be a non-empty string',
    'memory context rows[0].status must be a memory status',
    'memory context rows[0].pinned must be a boolean',
    'memory context rows[0].source_unit_id must be a non-empty string when provided',
    'memory context rows[0].source_note_id must be a non-empty string when provided',
    'memory context rows[0].source_block_id must be a non-empty string when provided',
    'memory context rows[0].source_start_offset must be a non-negative finite number when provided',
    'memory context rows[0].source_end_offset must be a non-negative finite number when provided',
    'memory context rows[0].confidence must be a finite number between 0 and 1',
    'memory context rows[0].relevance_score must be a finite number when provided',
    'memory context rows[0].updated_at must be a finite number',
  ]);
});

test('context assembly memory context mapper rejects blank user ids before user scope comparison', () => {
  const result = mapMemoryContextRowsToMemoryContext([
    memoryRow({
      user_id: '',
    }),
  ], runtimeInput);

  assert.deepEqual(result, {
    ok: false,
    errors: ['memory context rows[0].user_id must be a non-empty string'],
  });
});

test('context assembly memory context mapper rejects rows without source provenance', () => {
  const result = mapMemoryContextRowsToMemoryContext([
    memoryRow({
      source_unit_id: null,
      memory_source_note_id: null,
      source_block_id: null,
      source_start_offset: null,
      source_end_offset: null,
    }),
  ], runtimeInput);

  assert.deepEqual(result, {
    ok: false,
    errors: ['memory context rows[0].memory item must include source provenance'],
  });
});

test('context assembly memory context mapper rejects malformed source spans and full dump fields', () => {
  const invalidSpanResult = mapMemoryContextRowsToMemoryContext([
    memoryRow({
      memory_source_note_id: null,
      source_start_offset: 20,
      source_end_offset: 18,
    }),
  ], runtimeInput);
  assert.equal(invalidSpanResult.ok, false);
  assert.ok(
    invalidSpanResult.errors.includes(
      'memory context rows[0].source_end_offset must be greater than or equal to source_start_offset',
    ),
  );

  const dumpResult = mapMemoryContextRowsToMemoryContext([
    memoryRow({
      allMemoryDump: 'all memory must not be passed to context assembly',
    }),
  ], runtimeInput);
  assert.deepEqual(dumpResult, {
    ok: false,
    errors: ['memory context rows[0].row must not include full workspace, full note, dump, all notes, or all memory fields'],
  });
});

test('context assembly memory context adapter loads projection rows in SQL result order', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyMemoryContextSqlAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        return [
          memoryRow({ id: 'memory_first', status: 'active', relevance_score: 0.2 }),
          memoryRow({ id: 'memory_second', status: 'active', relevance_score: 0.9 }),
        ];
      },
    },
  });

  const memoryContext = await adapter.loadMemoryContext(runtimeInput);

  assert.deepEqual(queries, [mapMemoryContextCandidatesLookupToSql(runtimeInput)]);
  assert.deepEqual(memoryContext.items.map((item) => item.id), ['memory_first', 'memory_second']);
});

test('context assembly memory context adapter rejects unsupported chunk scope before querying', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyMemoryContextSqlAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        return [];
      },
    },
  });

  await assert.rejects(
    () => adapter.loadMemoryContext({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
  assert.deepEqual(queries, []);
  assert.throws(
    () => mapMemoryContextCandidatesLookupToSql({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
});

test('context assembly memory context adapter requires section targetId', async () => {
  const adapter = new TursoContextAssemblyMemoryContextSqlAdapter({
    executor: {
      async query() {
        throw new Error('executor should not be called without section targetId');
      },
    },
  });

  await assert.rejects(
    () => adapter.loadMemoryContext({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
  assert.throws(
    () => mapMemoryContextCandidatesLookupToSql({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
});

test('context assembly memory context adapter requires userId for scoped memory retrieval', async () => {
  const adapter = new TursoContextAssemblyMemoryContextSqlAdapter({
    executor: {
      async query() {
        throw new Error('executor should not be called without userId');
      },
    },
  });

  await assert.rejects(
    () => adapter.loadMemoryContext({
      ...runtimeInput,
      userId: '',
    }),
    /userId must be provided for memory context retrieval/,
  );
  assert.throws(
    () => mapMemoryContextCandidatesLookupToSql({
      ...runtimeInput,
      userId: '',
    }),
    /userId must be provided for memory context retrieval/,
  );
});

test('context assembly memory context SQL adapter stays read-only and avoids forbidden boundaries', async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/worker/src/contextAssemblyMemoryContextSqlAdapter.ts',
  );
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /ContextAssemblyMemoryRetrievalPort/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create table|alter table)\b/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|provider|ai-sdk/i);
  assert.doesNotMatch(source, /from blocks|join blocks|from notes|join notes|source_spans|agent_local|content_json|select \*/i);
  assert.match(source, /from memory_context_candidates/);
  assert.match(source, /inner join memory_items/);
  assert.match(source, /memory_context_candidates\.user_id = \?/);
  assert.match(source, /memory_items\.workspace_id = \?/);
  assert.match(source, /memory_items\.user_id = \?/);
});

function memoryRow(overrides = {}) {
  return {
    candidate_workspace_id: noteFixture.workspaceId,
    candidate_user_id: runtimeInput.userId,
    candidate_source_note_id: noteFixture.id,
    source_scope: 'section',
    source_target_id: sectionFixture.id,
    relevance_score: 0.7,
    id: 'memory_active_001',
    workspace_id: noteFixture.workspaceId,
    user_id: runtimeInput.userId,
    type: 'past_decision',
    content: 'Keep writing uninterrupted before AI structure runs.',
    status: 'active',
    pinned: false,
    source_unit_id: null,
    memory_source_note_id: noteFixture.id,
    source_block_id: 'block_paragraph_001',
    source_start_offset: 0,
    source_end_offset: 18,
    confidence: 0.91,
    updated_at: 1_764_000_100_000,
    ...overrides,
  };
}
