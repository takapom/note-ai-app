import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  InMemoryMemoryReviewPort,
  mapMemoryReviewContentUpdateToSql,
  mapMemoryReviewLookupToSql,
  mapMemoryReviewStatusUpdateToSql,
  TursoMemoryReviewSqlAdapter,
} from '../../apps/worker/src/memory/memoryReviewPort.ts';
import { isContextEligibleMemory } from '../../contexts/memory/src/contract/memoryContract.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_001_000_000;
const baseInput = {
  workspaceId: noteFixture.workspaceId,
  userId: 'user_001',
  memoryId: 'memory_001',
  now,
};

const memoryCandidate = {
  id: 'memory_001',
  workspaceId: noteFixture.workspaceId,
  userId: 'user_001',
  type: 'past_decision',
  content: 'The MVP keeps AI assistance inside the unified note surface.',
  sourceNoteId: noteFixture.id,
  sourceSpan: {
    sourceBlockId: 'block_001',
    startOffset: 4,
    endOffset: 32,
  },
  confidence: 0.91,
  status: 'candidate',
  pinned: false,
  createdAt: now - 100,
  updatedAt: now - 100,
};

test('in-memory memory review accept updates candidate status without altering provenance', async () => {
  const port = new InMemoryMemoryReviewPort([memoryCandidate]);

  const result = await port.acceptMemory(baseInput);

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.status, 'active');
  assert.equal(result.body.memory.reviewDecision, 'accepted');
  assert.equal(result.body.memory.reviewedAt, now);
  assert.equal(result.body.memory.reviewedByUserId, 'user_001');
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.equal(result.body.memory.sourceNoteId, noteFixture.id);
  assert.equal(isContextEligibleMemory(result.body.memory), true);
});

test('in-memory memory review reject updates candidate status without altering provenance', async () => {
  const port = new InMemoryMemoryReviewPort([memoryCandidate]);

  const result = await port.rejectMemory(baseInput);

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.status, 'rejected');
  assert.equal(result.body.memory.pinned, false);
  assert.equal(result.body.memory.reviewDecision, 'rejected');
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.equal(result.body.memory.sourceNoteId, noteFixture.id);
  assert.equal(isContextEligibleMemory(result.body.memory), false);
});

test('in-memory memory review edit updates content to pending without altering provenance', async () => {
  const port = new InMemoryMemoryReviewPort([memoryCandidate]);

  const result = await port.editMemory({
    ...baseInput,
    body: { content: 'The MVP keeps memory review inside the unified note surface.' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.content, 'The MVP keeps memory review inside the unified note surface.');
  assert.equal(result.body.memory.status, 'pending');
  assert.equal(result.body.memory.reviewDecision, 'edited');
  assert.equal(result.body.memory.reviewedAt, now);
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.equal(result.body.memory.sourceNoteId, noteFixture.id);
  assert.equal(isContextEligibleMemory(result.body.memory), false);
});

test('in-memory memory review delete archives and unpins without altering provenance or content', async () => {
  const port = new InMemoryMemoryReviewPort([{ ...memoryCandidate, pinned: true }]);

  const result = await port.deleteMemory(baseInput);

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.status, 'archived');
  assert.equal(result.body.memory.pinned, false);
  assert.equal(result.body.memory.content, memoryCandidate.content);
  assert.equal(result.body.memory.reviewDecision, 'archived');
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.equal(result.body.memory.sourceNoteId, noteFixture.id);
  assert.equal(isContextEligibleMemory(result.body.memory), false);
});

test('in-memory memory review hold moves candidate to pending without altering provenance or content', async () => {
  const port = new InMemoryMemoryReviewPort([memoryCandidate]);

  const result = await port.holdMemory(baseInput);

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.status, 'pending');
  assert.equal(result.body.memory.content, memoryCandidate.content);
  assert.equal(result.body.memory.reviewDecision, 'held');
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.equal(result.body.memory.sourceNoteId, noteFixture.id);
  assert.equal(isContextEligibleMemory(result.body.memory), false);
});

test('memory review rejects invalid input before persistence is touched', async () => {
  let queryCount = 0;
  let writeCount = 0;
  const adapter = new TursoMemoryReviewSqlAdapter({
    executor: {
      async query() {
        queryCount += 1;
        return [];
      },
      async write() {
        writeCount += 1;
        return { rowsAffected: 1 };
      },
    },
  });

  assert.deepEqual(await adapter.acceptMemory({
    workspaceId: 'workspace_unset',
    userId: ' user_001',
    memoryId: 'memory_unknown',
    now: Number.NaN,
  }), {
    ok: false,
    errors: [
      'workspaceId must be a stable non-sentinel runtime id',
      'userId must be a stable non-sentinel runtime id',
      'memoryId must be a stable non-sentinel runtime id',
      'now must be a finite number',
    ],
  });
  assert.equal(queryCount, 0);
  assert.equal(writeCount, 0);
});

test('memory edit rejects missing or empty content before persistence is touched', async () => {
  let queryCount = 0;
  let writeCount = 0;
  const adapter = new TursoMemoryReviewSqlAdapter({
    executor: {
      async query() {
        queryCount += 1;
        return [memoryRow(memoryCandidate)];
      },
      async write() {
        writeCount += 1;
        return { rowsAffected: 1 };
      },
    },
  });

  assert.deepEqual(await adapter.editMemory(baseInput), {
    ok: false,
    errors: ['body.content must be a non-empty string'],
  });
  assert.deepEqual(await adapter.editMemory({
    ...baseInput,
    body: { content: '   ' },
  }), {
    ok: false,
    errors: ['body.content must be a non-empty string'],
  });
  assert.deepEqual(await adapter.editMemory({
    ...baseInput,
    body: { content: ' Updated memory content.' },
  }), {
    ok: false,
    errors: ['body.content must not include leading or trailing whitespace'],
  });
  assert.equal(queryCount, 0);
  assert.equal(writeCount, 0);
});

test('memory review rejects workspace or user mismatch without mutating existing memory', async () => {
  const port = new InMemoryMemoryReviewPort([memoryCandidate]);

  const result = await port.acceptMemory({
    ...baseInput,
    userId: 'user_other',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    `memory memory_001 was not found in workspace ${noteFixture.workspaceId} for user user_other`,
  ]);
  assert.equal(port.listMemories()[0].status, 'candidate');
});

test('memory review SQL adapter loads scoped memory and writes only review fields', async () => {
  const statements = [];
  const adapter = new TursoMemoryReviewSqlAdapter({
    executor: {
      async query(statement) {
        statements.push(statement);
        return [memoryRow(memoryCandidate)];
      },
      async write(statement) {
        statements.push(statement);
        return { rowsAffected: 1 };
      },
    },
  });

  const result = await adapter.rejectMemory(baseInput);

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.status, 'rejected');
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.deepEqual(statements, [
    mapMemoryReviewLookupToSql(baseInput),
    mapMemoryReviewStatusUpdateToSql(result.body.memory),
  ]);
});

test('memory review SQL adapter edits content and review fields without altering provenance', async () => {
  const statements = [];
  const adapter = new TursoMemoryReviewSqlAdapter({
    executor: {
      async query(statement) {
        statements.push(statement);
        return [memoryRow(memoryCandidate)];
      },
      async write(statement) {
        statements.push(statement);
        return { rowsAffected: 1 };
      },
    },
  });

  const result = await adapter.editMemory({
    ...baseInput,
    body: { content: 'The MVP keeps reviewed memories source-backed.' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.memory.content, 'The MVP keeps reviewed memories source-backed.');
  assert.equal(result.body.memory.status, 'pending');
  assert.equal(result.body.memory.reviewDecision, 'edited');
  assert.deepEqual(result.body.memory.sourceSpan, memoryCandidate.sourceSpan);
  assert.deepEqual(statements, [
    mapMemoryReviewLookupToSql(baseInput),
    mapMemoryReviewContentUpdateToSql(result.body.memory),
  ]);
});

test('memory review SQL adapter archives and holds through status-only updates', async () => {
  const statements = [];
  const adapter = new TursoMemoryReviewSqlAdapter({
    executor: {
      async query(statement) {
        statements.push(statement);
        return [memoryRow(memoryCandidate)];
      },
      async write(statement) {
        statements.push(statement);
        return { rowsAffected: 1 };
      },
    },
  });

  const archived = await adapter.deleteMemory(baseInput);
  const held = await adapter.holdMemory(baseInput);

  assert.equal(archived.ok, true);
  assert.equal(archived.body.memory.status, 'archived');
  assert.equal(archived.body.memory.pinned, false);
  assert.equal(archived.body.memory.content, memoryCandidate.content);
  assert.equal(archived.body.memory.reviewDecision, 'archived');
  assert.equal(held.ok, true);
  assert.equal(held.body.memory.status, 'pending');
  assert.equal(held.body.memory.content, memoryCandidate.content);
  assert.equal(held.body.memory.reviewDecision, 'held');
  assert.deepEqual(statements, [
    mapMemoryReviewLookupToSql(baseInput),
    mapMemoryReviewStatusUpdateToSql(archived.body.memory),
    mapMemoryReviewLookupToSql(baseInput),
    mapMemoryReviewStatusUpdateToSql(held.body.memory),
  ]);
});

test('memory review SQL mapper only updates memory status and review fields', () => {
  const statement = mapMemoryReviewStatusUpdateToSql({
    ...memoryCandidate,
    status: 'active',
    updatedAt: now,
    reviewedAt: now,
    reviewedByUserId: 'user_001',
    reviewDecision: 'accepted',
  });

  assert.equal(statement.sql, [
    'update memory_items',
    'set status = ?, pinned = ?, reviewed_at = ?, reviewed_by_user_id = ?, review_decision = ?, updated_at = ?',
    'where workspace_id = ? and user_id = ? and id = ? and status in (?, ?)',
  ].join(' '));
  assert.deepEqual(statement.args, [
    'active',
    false,
    now,
    'user_001',
    'accepted',
    now,
    noteFixture.workspaceId,
    'user_001',
    'memory_001',
    'candidate',
    'pending',
  ]);
  assert.doesNotMatch(statement.sql, /\b(?:notes|sections|blocks|semantic_units|source_spans|ai_operations|memory_context_candidates)\b/i);
  assert.doesNotMatch(statement.sql, /\b(?:source_unit_id|source_note_id|source_block_id|source_start_offset|source_end_offset|content)\s*=/i);
});

test('memory edit SQL mapper updates content without updating source provenance', () => {
  const statement = mapMemoryReviewContentUpdateToSql({
    ...memoryCandidate,
    content: 'The edited memory keeps its source reference.',
    status: 'pending',
    updatedAt: now,
    reviewedAt: now,
    reviewedByUserId: 'user_001',
    reviewDecision: 'edited',
  });

  assert.equal(statement.sql, [
    'update memory_items',
    'set content = ?, status = ?, pinned = ?, reviewed_at = ?, reviewed_by_user_id = ?, review_decision = ?, updated_at = ?',
    'where workspace_id = ? and user_id = ? and id = ? and status in (?, ?)',
  ].join(' '));
  assert.deepEqual(statement.args, [
    'The edited memory keeps its source reference.',
    'pending',
    false,
    now,
    'user_001',
    'edited',
    now,
    noteFixture.workspaceId,
    'user_001',
    'memory_001',
    'candidate',
    'pending',
  ]);
  assert.doesNotMatch(statement.sql, /\b(?:notes|sections|blocks|semantic_units|source_spans|ai_operations|memory_context_candidates)\b/i);
  assert.doesNotMatch(statement.sql, /\b(?:source_unit_id|source_note_id|source_block_id|source_start_offset|source_end_offset)\s*=/i);
});

test('memory review SQL adapter reports workspace scoped misses as rejected writes', async () => {
  let writeCount = 0;
  const adapter = new TursoMemoryReviewSqlAdapter({
    executor: {
      async query() {
        return [];
      },
      async write() {
        writeCount += 1;
        return { rowsAffected: 1 };
      },
    },
  });

  assert.deepEqual(await adapter.acceptMemory(baseInput), {
    ok: false,
    errors: [`memory memory_001 was not found in workspace ${noteFixture.workspaceId} for user user_001`],
  });
  assert.equal(writeCount, 0);
});

test('memory review source guard forbids provider router context assembly and canonical note SQL', async () => {
  const source = await readFile(new URL('apps/worker/src/memory/memoryReviewPort.ts', root), 'utf8');

  assert.match(source, /MemoryReviewPort/);
  assert.match(source, /from memory_items/);
  assert.match(source, /update memory_items/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|OperationRouter|provider|ai-sdk|contextAssembly|ContextAssembly/i);
  assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from)\s+[`"]?(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_context_candidates)[`"]?\b/i);
});

function memoryRow(memory) {
  return {
    id: memory.id,
    workspace_id: memory.workspaceId,
    user_id: memory.userId,
    type: memory.type,
    content: memory.content,
    status: memory.status,
    pinned: memory.pinned,
    source_unit_id: memory.sourceUnitId ?? null,
    source_note_id: memory.sourceNoteId ?? null,
    source_block_id: memory.sourceSpan?.sourceBlockId ?? null,
    source_start_offset: memory.sourceSpan?.startOffset ?? null,
    source_end_offset: memory.sourceSpan?.endOffset ?? null,
    confidence: memory.confidence,
    created_at: memory.createdAt,
    updated_at: memory.updatedAt,
  };
}
