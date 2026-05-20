import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AgentLocalBlockChangedPersistenceAdapter,
  AgentLocalNextOpenDigestPreparationAdapter,
  AgentLocalStructureJobQueueAdapter,
  mapBlockChangedOutputToAgentLocalSql,
  mapCompletedJobRows,
  mapNextOpenDigestPreparationToAgentLocalSql,
  mapStructureJobsToAgentLocalSql,
} from '../../apps/worker/src/scheduler/schedulerAgentLocalSqlAdapter.ts';
import { runStructureTriggerSchedulerFlow } from '../../apps/worker/src/scheduler/structureSchedulerRuntimeFlow.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import { handleBlockChanged } from '../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  blockChangedInputFixture,
  completedSectionJobFixture,
  dirtySectionFixture,
  schedulerNow,
  schedulerSectionsFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

test('BlockChanged mapper writes save intent, edit event, dirty mark, and optional index update in order', () => {
  const output = handleBlockChanged(blockChangedInputFixture);
  assert.deepEqual(output.errors, []);

  const statements = mapBlockChangedOutputToAgentLocalSql(output);

  assert.deepEqual(statements, [
    {
      sql: [
        'insert into agent_local_block_save_intents',
        '(block_id, note_id, section_id, content_hash, saved_at)',
        'values (?, ?, ?, ?, ?)',
      ].join(' '),
      args: [
        blockChangedInputFixture.blockId,
        blockChangedInputFixture.noteId,
        blockChangedInputFixture.sectionId,
        blockChangedInputFixture.contentHash,
        blockChangedInputFixture.now,
      ],
    },
    {
      sql: [
        'insert into agent_local_edit_events',
        '(event_type, block_id, note_id, section_id, occurred_at, previous_content_hash, content_hash)',
        'values (?, ?, ?, ?, ?, ?, ?)',
      ].join(' '),
      args: [
        'BlockChanged',
        blockChangedInputFixture.blockId,
        blockChangedInputFixture.noteId,
        blockChangedInputFixture.sectionId,
        blockChangedInputFixture.now,
        blockChangedInputFixture.previousContentHash,
        blockChangedInputFixture.contentHash,
      ],
    },
    {
      sql: [
        'insert into agent_local_dirty_scope_marks',
        '(target_scope, note_id, section_id, content_hash, is_dirty, marked_at)',
        'values (?, ?, ?, ?, ?, ?)',
      ].join(' '),
      args: [
        'section',
        blockChangedInputFixture.noteId,
        blockChangedInputFixture.sectionId,
        blockChangedInputFixture.contentHash,
        1,
        blockChangedInputFixture.now,
      ],
    },
    {
      sql: [
        'insert into agent_local_lightweight_index_updates',
        '(block_id, note_id, section_id, content_hash, updated_at)',
        'values (?, ?, ?, ?, ?)',
      ].join(' '),
      args: [
        blockChangedInputFixture.blockId,
        blockChangedInputFixture.noteId,
        blockChangedInputFixture.sectionId,
        blockChangedInputFixture.contentHash,
        blockChangedInputFixture.now,
      ],
    },
  ]);
});

test('StructureJob queue maps completed rows and enqueues provided jobs in order without dedupe recomputation', async () => {
  const completedRows = [
    { context_hash: 'section:note_001:section_a:hash_a', status: 'completed' },
    { contextHash: 'section:note_001:section_b:hash_b', status: 'completed' },
  ];
  assert.deepEqual(mapCompletedJobRows(completedRows), {
    ok: true,
    completedJobs: [
      { contextHash: 'section:note_001:section_a:hash_a', status: 'completed' },
      { contextHash: 'section:note_001:section_b:hash_b', status: 'completed' },
    ],
  });

  const duplicateContextHash = 'section:note_001:section_dirty_hash:hash_duplicate';
  const jobs = [
    {
      ...completedSectionJobFixture,
      id: 'structure_job_sql_001',
      contextHash: duplicateContextHash,
      status: 'queued',
      createdAt: schedulerNow,
    },
    {
      ...completedSectionJobFixture,
      id: 'structure_job_sql_002',
      contextHash: duplicateContextHash,
      status: 'queued',
      createdAt: schedulerNow + 1,
    },
  ];

  const statements = mapStructureJobsToAgentLocalSql(jobs);
  assert.equal(statements.length, 2);
  assert.deepEqual(statements.map((statement) => statement.args[0]), [
    'structure_job_sql_001',
    'structure_job_sql_002',
  ]);
  assert.deepEqual(statements.map((statement) => statement.args[6]), [
    duplicateContextHash,
    duplicateContextHash,
  ]);

  const writes = [];
  const queries = [];
  const adapter = new AgentLocalStructureJobQueueAdapter({
    async execute(statement) {
      writes.push(statement);
    },
    async query(statement) {
      queries.push(statement);
      return completedRows;
    },
  });

  const listed = await adapter.listCompletedJobs({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  });
  const result = await adapter.enqueueJobs(jobs);

  assert.deepEqual(listed, [
    { contextHash: 'section:note_001:section_a:hash_a', status: 'completed' },
    { contextHash: 'section:note_001:section_b:hash_b', status: 'completed' },
  ]);
  assert.deepEqual(queries, [
    {
      sql: [
        'select context_hash, status',
        'from agent_local_structure_jobs',
        'where workspace_id = ? and note_id = ? and status = ?',
        'order by completed_at asc, created_at asc, id asc',
      ].join(' '),
      args: [noteFixture.workspaceId, noteFixture.id, 'completed'],
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.enqueuedCount, 2);
  assert.deepEqual(writes, statements);
});

test('completed job row mapper rejects invalid primitives instead of creating sentinels', async () => {
  assert.deepEqual(mapCompletedJobRows([
    { context_hash: '', status: 'completed' },
    { context_hash: 'section:note_001:section_a:hash_a', status: 'queued' },
  ]), {
    ok: false,
    errors: [
      'completed structure job rows[0].context_hash must be a non-empty string',
      'completed structure job rows[1].status must be completed',
    ],
  });

  const adapter = new AgentLocalStructureJobQueueAdapter({
    async execute() {
      throw new Error('enqueue should not run');
    },
    async query() {
      return [{ context_hash: ' ', status: 'completed' }];
    },
  });

  await assert.rejects(
    () => adapter.listCompletedJobs({
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
    }),
    /completed structure job rows\[0\]\.context_hash must be a non-empty string/,
  );
});

test('Digest mapper writes next_open preparation payload', () => {
  const digest = {
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'next_open',
    recoveredJobCount: 2,
    prepared: true,
  };

  assert.deepEqual(mapNextOpenDigestPreparationToAgentLocalSql(digest), [
    {
      sql: [
        'insert into agent_local_next_open_digest_preparation_intents',
        '(workspace_id, note_id, trigger_reason, recovered_job_count, prepared, payload_json)',
        'values (?, ?, ?, ?, ?, ?)',
      ].join(' '),
      args: [
        noteFixture.workspaceId,
        noteFixture.id,
        'next_open',
        2,
        1,
        JSON.stringify(digest),
      ],
    },
  ]);
});

test('adapters report executor failures without changing scheduler plan semantics', async () => {
  const output = handleBlockChanged(blockChangedInputFixture);
  const failingBlockAdapter = new AgentLocalBlockChangedPersistenceAdapter({
    async execute() {
      throw new Error('agent local write unavailable');
    },
    async query() {
      return [];
    },
  });
  const blockResult = await failingBlockAdapter.persistBlockChanged(output);
  assert.deepEqual(blockResult, {
    ok: false,
    errors: ['BlockChanged agent-local SQL persistence failed: agent local write unavailable'],
  });

  const failingQueueAdapter = new AgentLocalStructureJobQueueAdapter({
    async execute() {
      throw new Error('agent local queue unavailable');
    },
    async query() {
      return [];
    },
  });
  const enqueueResult = await failingQueueAdapter.enqueueJobs([completedSectionJobFixture]);
  assert.deepEqual(enqueueResult, {
    ok: false,
    errors: ['structure job enqueue failed: agent local queue unavailable'],
    enqueuedCount: 0,
  });

  const failingDigestAdapter = new AgentLocalNextOpenDigestPreparationAdapter({
    async execute() {
      throw new Error('agent local digest unavailable');
    },
    async query() {
      return [];
    },
  });
  const digestResult = await failingDigestAdapter.prepareDigest({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'next_open',
    recoveredJobCount: 1,
    prepared: true,
  });
  assert.deepEqual(digestResult, {
    ok: false,
    errors: ['next_open digest agent-local SQL preparation failed: agent local digest unavailable'],
  });

  const queryFailingQueue = new AgentLocalStructureJobQueueAdapter({
    async execute() {
      throw new Error('enqueue should not run');
    },
    async query() {
      throw new Error('agent local query unavailable');
    },
  });
  const flowResult = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'note_closed',
    now: schedulerNow,
    ports: {
      noteSnapshot: {
        async loadSections() {
          return schedulerSectionsFixture;
        },
      },
      structureJobQueue: queryFailingQueue,
      nextOpenDigestPreparation: failingDigestAdapter,
    },
  });

  assert.deepEqual(flowResult.plan.jobs, []);
  assert.equal(flowResult.enqueue.attempted, false);
  assert.deepEqual(flowResult.errors, [
    'completed structure job lookup failed: agent local query unavailable',
  ]);
  assert.deepEqual(flowResult.providerCalls, []);
  assert.deepEqual(flowResult.operationRoutingCalls, []);
  assert.deepEqual(flowResult.auditWrites, []);

  const successfulWrites = [];
  const successfulQueue = new AgentLocalStructureJobQueueAdapter({
    async execute(statement) {
      successfulWrites.push(statement);
    },
    async query() {
      return [];
    },
  });
  const successfulFlow = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'note_closed',
    now: schedulerNow,
    ports: {
      noteSnapshot: {
        async loadSections() {
          return [dirtySectionFixture];
        },
      },
      structureJobQueue: successfulQueue,
      nextOpenDigestPreparation: failingDigestAdapter,
    },
  });

  assert.equal(successfulFlow.plan.jobs.length, 1);
  assert.equal(successfulWrites.length, 1);
  assert.equal(successfulWrites[0].args[6], successfulFlow.plan.jobs[0].contextHash);
  assert.deepEqual(successfulFlow.providerCalls, []);
  assert.deepEqual(successfulFlow.operationRoutingCalls, []);
  assert.deepEqual(successfulFlow.auditWrites, []);
});

test('StructureJob queue reports partial Agent-local SQL writes instead of hiding them', async () => {
  let executeCount = 0;
  const adapter = new AgentLocalStructureJobQueueAdapter({
    async execute() {
      executeCount += 1;
      if (executeCount === 2) {
        throw new Error('second write failed');
      }
    },
    async query() {
      return [];
    },
  });

  const result = await adapter.enqueueJobs([
    {
      ...completedSectionJobFixture,
      id: 'structure_job_partial_001',
      status: 'queued',
    },
    {
      ...completedSectionJobFixture,
      id: 'structure_job_partial_002',
      status: 'queued',
    },
  ]);

  assert.deepEqual(result, {
    ok: false,
    errors: ['structure job enqueue failed: second write failed'],
    enqueuedCount: 1,
  });
});

test('scheduler agent-local SQL adapter does not mention forbidden runtime boundaries', async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/worker/src/scheduler/schedulerAgentLocalSqlAdapter.ts',
  );
  const source = await readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|provider SDK|generated/i);
  assert.doesNotMatch(source, /turso/i);
});
