import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AgentLocalStructureJobWorkQueueAdapter,
  mapClaimedStructureJobToAgentLocalSql,
  mapCompletedStructureJobToAgentLocalSql,
  mapFailedStructureJobToAgentLocalSql,
  mapNextQueuedStructureJobLookupToAgentLocalSql,
  mapStructureJobLookupByIdToAgentLocalSql,
  mapStructureJobWorkQueueRow,
} from '../../apps/worker/src/structureJobWorkQueueAgentLocalSqlAdapter.ts';
import { completedSectionJobFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const root = new URL('../../', import.meta.url);
const claimedAt = 1_764_000_101_000;
const completedAt = 1_764_000_102_000;
const failedAt = 1_764_000_103_000;

test('Agent-local StructureJob work queue claims first queued row as running', async () => {
  const queued = queuedJob({ id: 'structure_job_sql_claim' });
  const executor = createExecutor({
    queryRows: [jobToRow(queued)],
  });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(executor);

  const result = await adapter.claimNextQueuedJob({
    workspaceId: queued.workspaceId,
    claimedAt,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.job.id, queued.id);
  assert.equal(result.job.status, 'running');
  assert.equal(result.job.startedAt, claimedAt);
  assert.equal('completedAt' in result.job, false);
  assert.deepEqual(executor.queries, [
    mapNextQueuedStructureJobLookupToAgentLocalSql({ workspaceId: queued.workspaceId }),
  ]);
  assert.deepEqual(executor.writes, [
    mapClaimedStructureJobToAgentLocalSql(result.job),
  ]);
});

test('Agent-local StructureJob work queue returns no claim when no queued row exists', async () => {
  const executor = createExecutor({ queryRows: [] });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(executor);

  const result = await adapter.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });

  assert.deepEqual(result, { ok: true, errors: [] });
  assert.deepEqual(executor.writes, []);
});

test('Agent-local StructureJob work queue marks running rows completed', async () => {
  const running = runningJob({ id: 'structure_job_sql_complete' });
  const executor = createExecutor({
    queryRows: [jobToRow(running)],
  });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(executor);

  const result = await adapter.markJobCompleted({
    structureJobId: running.id,
    completedAt,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.job.id, running.id);
  assert.equal(result.job.status, 'completed');
  assert.equal(result.job.startedAt, running.startedAt);
  assert.equal(result.job.completedAt, completedAt);
  assert.deepEqual(executor.queries, [
    mapStructureJobLookupByIdToAgentLocalSql(running.id),
  ]);
  assert.deepEqual(executor.writes, [
    mapCompletedStructureJobToAgentLocalSql(result.job),
  ]);
});

test('Agent-local StructureJob work queue marks running rows failed', async () => {
  const running = runningJob({ id: 'structure_job_sql_fail' });
  const executor = createExecutor({
    queryRows: [jobToRow(running)],
  });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(executor);

  const result = await adapter.markJobFailed({
    structureJobId: running.id,
    failedAt,
    failureMessage: 'context assembly failed',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.job.id, running.id);
  assert.equal(result.job.status, 'failed');
  assert.equal(result.job.startedAt, running.startedAt);
  assert.equal(result.job.failedAt, failedAt);
  assert.equal(result.job.failureMessage, 'context assembly failed');
  assert.deepEqual(executor.queries, [
    mapStructureJobLookupByIdToAgentLocalSql(running.id),
  ]);
  assert.deepEqual(executor.writes, [
    mapFailedStructureJobToAgentLocalSql(result.job),
  ]);
});

test('Agent-local StructureJob work queue rejects invalid rows without sentinel jobs or writes', async () => {
  const executor = createExecutor({
    queryRows: [{
      ...jobToRow(queuedJob()),
      id: '',
      note_id: ' ',
      context_hash: '',
      status: 'sideways',
      created_at: Number.NaN,
    }],
  });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(executor);

  const result = await adapter.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });

  assert.equal(result.ok, false);
  assert.equal(result.job, undefined);
  assert.ok(result.errors.includes('queued structure job lookup row.id must be a non-empty string'));
  assert.ok(result.errors.includes('queued structure job lookup row.noteId must be a non-empty string'));
  assert.ok(result.errors.includes('queued structure job lookup row.contextHash must be a non-empty string'));
  assert.ok(result.errors.includes('queued structure job lookup row.status must be one of queued, running, completed, failed, skipped, deduped'));
  assert.ok(result.errors.includes('queued structure job lookup row.createdAt must be a finite number'));
  assert.deepEqual(executor.writes, []);

  assert.deepEqual(mapStructureJobWorkQueueRow({
    ...jobToRow(runningJob()),
    started_at: null,
  }), {
    ok: false,
    errors: ['startedAt is required when status is running'],
  });
});

test('Agent-local StructureJob work queue rejects terminal transitions unless row is running', async () => {
  const queued = queuedJob({ id: 'structure_job_sql_not_running' });
  const executor = createExecutor({
    queryRows: [jobToRow(queued)],
  });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(executor);

  const result = await adapter.markJobCompleted({
    structureJobId: queued.id,
    completedAt,
  });

  assert.deepEqual(result, {
    ok: false,
    errors: ['structure job status queued is not running'],
  });
  assert.deepEqual(executor.writes, []);
});

test('Agent-local StructureJob work queue reports query and write failures', async () => {
  const queryFailing = new AgentLocalStructureJobWorkQueueAdapter(createExecutor({
    queryError: new Error('agent local query unavailable'),
  }));
  const queryResult = await queryFailing.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });
  assert.deepEqual(queryResult, {
    ok: false,
    errors: ['queued structure job lookup failed: agent local query unavailable'],
  });

  const writeFailingExecutor = createExecutor({
    queryRows: [jobToRow(runningJob({ id: 'structure_job_sql_write_fail' }))],
    executeError: new Error('agent local write unavailable'),
  });
  const writeFailing = new AgentLocalStructureJobWorkQueueAdapter(writeFailingExecutor);
  const writeResult = await writeFailing.markJobCompleted({
    structureJobId: 'structure_job_sql_write_fail',
    completedAt,
  });

  assert.deepEqual(writeResult, {
    ok: false,
    errors: ['structure job completion update failed: agent local write unavailable'],
  });
  assert.equal(writeFailingExecutor.writes.length, 1);
});

test('Agent-local StructureJob work queue reports stale lifecycle updates when executor exposes affected rows', async () => {
  const running = runningJob({ id: 'structure_job_sql_stale' });
  const adapter = new AgentLocalStructureJobWorkQueueAdapter(createExecutor({
    queryRows: [jobToRow(running)],
    executeResult: { rowsAffected: 0 },
  }));

  const result = await adapter.markJobCompleted({
    structureJobId: running.id,
    completedAt,
  });

  assert.deepEqual(result, {
    ok: false,
    errors: ['structure job completion update failed: no rows affected'],
  });
});

test('Agent-local StructureJob work queue adapter writes only temporary job state', async () => {
  const source = await readFile(
    new URL('apps/worker/src/structureJobWorkQueueAgentLocalSqlAdapter.ts', root),
    'utf8',
  );

  assert.match(source, /StructureJobWorkQueuePort/);
  assert.match(source, /from agent_local_structure_jobs/);
  assert.match(source, /update agent_local_structure_jobs/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouting/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|runStructureJobOperationFlow|auditPersistence|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(insert into|update|delete from|upsert|create|alter)\s+(notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_items)\b/i);
  assert.doesNotMatch(source, /from blocks|join blocks|from notes|join notes|from sections|join sections/i);
});

function queuedJob(overrides = {}) {
  const {
    startedAt: _startedAt,
    completedAt: _completedAt,
    skipReason: _skipReason,
    ...base
  } = completedSectionJobFixture;

  return {
    ...base,
    id: 'structure_job_sql_queued',
    status: 'queued',
    createdAt: completedSectionJobFixture.createdAt,
    ...overrides,
  };
}

function runningJob(overrides = {}) {
  return {
    ...queuedJob(),
    id: 'structure_job_sql_running',
    status: 'running',
    startedAt: claimedAt,
    ...overrides,
  };
}

function jobToRow(job) {
  return {
    id: job.id,
    workspace_id: job.workspaceId,
    note_id: job.noteId,
    section_id: job.sectionId ?? null,
    target_scope: job.targetScope,
    trigger_reason: job.triggerReason,
    context_hash: job.contextHash,
    status: job.status,
    priority: job.priority,
    created_at: job.createdAt,
    started_at: job.startedAt ?? null,
    completed_at: job.completedAt ?? null,
    whole_note_reason: job.wholeNoteReason ?? null,
    skip_reason: job.skipReason ?? null,
    failed_at: job.failedAt ?? null,
    failure_message: job.failureMessage ?? null,
  };
}

function createExecutor({ queryRows = [], queryError, executeError, executeResult } = {}) {
  const queries = [];
  const writes = [];

  return {
    queries,
    writes,
    async execute(statement) {
      writes.push(statement);
      if (executeError !== undefined) {
        throw executeError;
      }
      return executeResult;
    },
    async query(statement) {
      queries.push(statement);
      if (queryError !== undefined) {
        throw queryError;
      }
      return queryRows;
    },
  };
}
