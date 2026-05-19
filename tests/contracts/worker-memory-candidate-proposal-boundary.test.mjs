import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  InMemoryMemoryCandidatePersistencePort,
  mapMemoryCandidateWriteIntentToSql,
  runMemoryCandidateProposalBoundary,
} from '../../apps/worker/src/memoryCandidateProposalBoundary.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_010_000_000;

const baseOperation = {
  type: 'create_memory_candidate',
  targetSectionId: 'section_001',
  memoryType: 'past_decision',
  content: 'The MVP keeps memory candidates source-backed.',
  sourceSpans: [{ blockId: 'block_001', startOffset: 7, endOffset: 51 }],
  confidence: 0.88,
};

test('accepted create_memory_candidate intent writes a source-backed canonical memory candidate', async () => {
  const persistence = new InMemoryMemoryCandidatePersistencePort();

  const result = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    approvedIntent: makeApprovedIntent(),
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.memory.id, 'memory_operation_memory_candidate_001');
  assert.equal(result.memory.workspaceId, 'workspace_001');
  assert.equal(result.memory.userId, 'user_001');
  assert.equal(result.memory.type, 'past_decision');
  assert.equal(result.memory.status, 'candidate');
  assert.equal(result.memory.pinned, false);
  assert.equal(result.memory.sourceNoteId, 'note_001');
  assert.deepEqual(result.memory.sourceSpan, {
    sourceBlockId: 'block_001',
    startOffset: 7,
    endOffset: 51,
  });
  assert.equal(result.memory.createdAt, now);
  assert.equal(result.writeIntent.sourceOperationId, 'operation_memory_candidate_001');
  assert.deepEqual(persistence.listMemories(), [result.memory]);
});

test('accepted create_memory_candidate without offsets does not fabricate a sourceSpan', async () => {
  const persistence = new InMemoryMemoryCandidatePersistencePort();

  const result = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    approvedIntent: makeApprovedIntent({
      operationId: 'operation_memory_candidate_no_offsets',
      operation: {
        ...baseOperation,
        sourceSpans: [{ blockId: 'block_001' }],
      },
    }),
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.memory.sourceNoteId, 'note_001');
  assert.equal(result.memory.sourceSpan, undefined);
  assert.equal(persistence.listMemories().length, 1);
});

test('memory candidate boundary rejects source-less candidates before persistence', async () => {
  let writeCount = 0;
  const persistence = {
    async saveMemoryCandidate() {
      writeCount += 1;
      return { ok: true, errors: [] };
    },
  };

  const result = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    approvedIntent: makeApprovedIntent({
      operationId: 'operation_memory_candidate_no_source',
      noteId: undefined,
      operation: {
        ...baseOperation,
        sourceSpans: [{ blockId: 'block_001' }],
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['memory candidate: memory item must include source provenance']);
  assert.equal(writeCount, 0);
});

test('insert_assist_block accepted intent and missing approved intent do not write memory', async () => {
  let writeCount = 0;
  const persistence = {
    async saveMemoryCandidate() {
      writeCount += 1;
      return { ok: true, errors: [] };
    },
  };

  const assist = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    approvedIntent: makeApprovedIntent({
      operationId: 'operation_assist_001',
      operationType: 'insert_assist_block',
      policy: 'inline',
      operation: {
        type: 'insert_assist_block',
        blockType: 'ai_question',
        content: 'Should this become an assist block?',
        position: { appendToSectionId: 'section_001' },
        sourceSpans: [{ blockId: 'block_001' }],
        confidence: 0.77,
      },
    }),
    now,
  });
  const missing = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    now,
  });

  assert.deepEqual(assist, { ok: true, errors: [] });
  assert.deepEqual(missing, { ok: true, errors: [] });
  assert.equal(writeCount, 0);
});

test('workspace mismatch and invalid primitives reject before persistence', async () => {
  let writeCount = 0;
  const persistence = {
    async saveMemoryCandidate() {
      writeCount += 1;
      return { ok: true, errors: [] };
    },
  };

  const mismatch = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    approvedIntent: makeApprovedIntent({ workspaceId: 'workspace_other' }),
    now,
  });
  const invalid = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_unset',
    userId: ' user_001',
    approvedIntent: makeApprovedIntent(),
    now: Number.NaN,
  });

  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.errors.includes('approvedIntent.workspaceId must match workspaceId'));
  assert.ok(mismatch.errors.includes('approvedIntent.auditRecord.workspaceId must match workspaceId'));
  assert.deepEqual(invalid.errors, [
    'workspaceId must be a stable non-sentinel runtime id',
    'userId must be a stable non-sentinel runtime id',
    'now must be a finite number',
  ]);
  assert.equal(writeCount, 0);
});

test('invalid source span primitives reject before persistence', async () => {
  let writeCount = 0;
  const persistence = {
    async saveMemoryCandidate() {
      writeCount += 1;
      return { ok: true, errors: [] };
    },
  };

  const result = await runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence: persistence,
    workspaceId: 'workspace_001',
    userId: 'user_001',
    approvedIntent: makeApprovedIntent({
      operationId: 'operation_memory_candidate_bad_span',
      noteId: undefined,
      operation: {
        ...baseOperation,
        sourceSpans: [{ blockId: ' block_001', startOffset: 7, endOffset: 51 }],
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'memory candidate: memory.sourceSpan.sourceBlockId must be a stable non-sentinel runtime id when provided',
  ]);
  assert.equal(writeCount, 0);
});

test('SQL mapper inserts memory_items candidate with provenance columns only', async () => {
  const memory = {
    id: 'memory_operation_memory_candidate_001',
    workspaceId: 'workspace_001',
    userId: 'user_001',
    type: 'past_decision',
    content: 'The MVP keeps memory candidates source-backed.',
    sourceNoteId: 'note_001',
    sourceSpan: {
      sourceBlockId: 'block_001',
      startOffset: 7,
      endOffset: 51,
    },
    confidence: 0.88,
    status: 'candidate',
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };

  const statement = mapMemoryCandidateWriteIntentToSql({
    workspaceId: 'workspace_001',
    userId: 'user_001',
    sourceOperationId: 'operation_memory_candidate_001',
    memory,
  });

  assert.equal(statement.sql, [
    'insert into memory_items',
    '(id, workspace_id, user_id, type, content, status, pinned, source_unit_id, source_note_id, source_block_id, source_start_offset, source_end_offset, confidence, created_at, updated_at)',
    'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ].join(' '));
  assert.deepEqual(statement.args, [
    'memory_operation_memory_candidate_001',
    'workspace_001',
    'user_001',
    'past_decision',
    'The MVP keeps memory candidates source-backed.',
    'candidate',
    false,
    null,
    'note_001',
    'block_001',
    7,
    51,
    0.88,
    now,
    now,
  ]);
  assert.doesNotMatch(statement.sql, /\b(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_context_candidates)\b/i);
  assert.doesNotMatch(statement.sql, /\b(?:update|delete\s+from|upsert|alter|create)\b/i);
});

test('memory candidate boundary source guard forbids shortcut dependencies and canonical note writes', async () => {
  const source = await readFile(new URL('apps/worker/src/memoryCandidateProposalBoundary.ts', root), 'utf8');

  assert.match(source, /MemoryCandidatePersistencePort/);
  assert.match(source, /insert into memory_items/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|OperationRouter|provider|ai-sdk|contextAssembly|ContextAssembly/i);
  assert.doesNotMatch(source, /\b(?:update|delete\s+from|upsert|alter|create)\s+[`"]?(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_context_candidates)[`"]?\b/i);
});

function makeApprovedIntent(overrides = {}) {
  const operationId = overrides.operationId ?? 'operation_memory_candidate_001';
  const workspaceId = overrides.workspaceId ?? 'workspace_001';
  const noteId = Object.hasOwn(overrides, 'noteId') ? overrides.noteId : 'note_001';
  const operation = overrides.operation ?? baseOperation;

  return {
    type: 'operation_proposal_accepted',
    workspaceId,
    operationId,
    acceptedAt: now + 1,
    auditRecord: {
      id: operationId,
      workspaceId,
      ...(noteId === undefined ? {} : { noteId }),
      status: 'proposed',
      operationType: overrides.operationType ?? operation.type,
      policy: overrides.policy ?? 'review',
      operation,
      errors: [],
      sourceSpans: [],
      confidence: operation.confidence,
      generatedBy: 'worker_runtime',
      createdAt: now - 100,
      updatedAt: now - 100,
    },
  };
}
