import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  InMemoryStructureJobWorkQueue,
  validateStructureJobWorkQueueRecord,
} from '../../apps/worker/src/structureJobWorkQueuePort.ts';
import { completedSectionJobFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const root = new URL('../../', import.meta.url);
const claimedAt = 1_764_000_101_000;
const completedAt = 1_764_000_102_000;
const failedAt = 1_764_000_103_000;

test('structure job work queue claims the next queued job as running', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_first' }),
    queuedJob({ id: 'structure_job_second' }),
  ]);

  const result = await queue.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.job.id, 'structure_job_first');
  assert.equal(result.job.status, 'running');
  assert.equal(result.job.startedAt, claimedAt);
  assert.equal('completedAt' in result.job, false);
  assert.deepEqual(
    queue.list().map((job) => [job.id, job.status]),
    [
      ['structure_job_first', 'running'],
      ['structure_job_second', 'queued'],
    ],
  );
});

test('structure job work queue marks running jobs completed', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_complete' }),
  ]);

  await queue.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });
  const result = await queue.markJobCompleted({
    structureJobId: 'structure_job_complete',
    completedAt,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.job.id, 'structure_job_complete');
  assert.equal(result.job.status, 'completed');
  assert.equal(result.job.startedAt, claimedAt);
  assert.equal(result.job.completedAt, completedAt);
  assert.deepEqual(
    queue.list().map((job) => [job.id, job.status, job.completedAt]),
    [['structure_job_complete', 'completed', completedAt]],
  );
});

test('structure job work queue marks running jobs failed without creating downstream work', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_fail' }),
  ]);
  const sideEffects = createSideEffectSpies();

  await queue.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });
  const result = await queue.markJobFailed({
    structureJobId: 'structure_job_fail',
    failedAt,
    failureMessage: 'context assembly failed',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.job.id, 'structure_job_fail');
  assert.equal(result.job.status, 'failed');
  assert.equal(result.job.startedAt, claimedAt);
  assert.equal(result.job.failedAt, failedAt);
  assert.equal(result.job.failureMessage, 'context assembly failed');
  assert.deepEqual(
    queue.list().map((job) => [job.id, job.status, job.failedAt]),
    [['structure_job_fail', 'failed', failedAt]],
  );
  assertSideEffectSpiesUncalled(sideEffects);
});

test('structure job work queue rejects invalid claim primitives without returning a job', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_not_claimed' }),
  ]);

  const result = await queue.claimNextQueuedJob({
    workspaceId: ' ',
    claimedAt: Number.NaN,
  });

  assert.equal(result.ok, false);
  assert.equal(result.job, undefined);
  assert.deepEqual(result.errors, [
    'workspaceId must be a non-empty string',
    'claimedAt must be a finite number',
  ]);
  assert.deepEqual(
    queue.list().map((job) => [job.id, job.status]),
    [['structure_job_not_claimed', 'queued']],
  );
});

test('structure job work queue rejects invalid stored primitives as non-claimable', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    {
      ...queuedJob(),
      id: '',
      noteId: ' ',
      contextHash: '',
      status: 'sideways',
      createdAt: Number.NaN,
    },
  ]);

  const result = await queue.claimNextQueuedJob({
    workspaceId: completedSectionJobFixture.workspaceId,
    claimedAt,
  });

  assert.equal(result.ok, false);
  assert.equal(result.job, undefined);
  assert.ok(result.errors.includes('jobs[0].id must be a non-empty string'));
  assert.ok(result.errors.includes('jobs[0].noteId must be a non-empty string'));
  assert.ok(result.errors.includes('jobs[0].contextHash must be a non-empty string'));
  assert.ok(result.errors.includes('jobs[0].status must be one of queued, running, completed, failed, skipped, deduped'));
  assert.ok(result.errors.includes('jobs[0].createdAt must be a finite number'));
});

test('structure job work queue terminal transitions require running jobs and finite timestamps', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_not_running' }),
  ]);

  const completed = await queue.markJobCompleted({
    structureJobId: 'structure_job_not_running',
    completedAt: Number.NaN,
  });
  const failed = await queue.markJobFailed({
    structureJobId: 'structure_job_not_running',
    failedAt: Number.NaN,
    failureMessage: '',
  });
  const completedAfterValidTimestamp = await queue.markJobCompleted({
    structureJobId: 'structure_job_not_running',
    completedAt,
  });

  assert.equal(completed.ok, false);
  assert.deepEqual(completed.errors, ['completedAt must be a finite number']);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.errors, [
    'failureMessage must be a non-empty string',
    'failedAt must be a finite number',
  ]);
  assert.equal(completedAfterValidTimestamp.ok, false);
  assert.deepEqual(completedAfterValidTimestamp.errors, ['structure job status queued is not running']);
  assert.deepEqual(queue.list().map((job) => job.status), ['queued']);
});

test('structure job work queue record validator rejects invalid terminal statuses', () => {
  const failedErrors = validateStructureJobWorkQueueRecord({
    ...queuedJob({ status: 'failed' }),
    startedAt: claimedAt,
    failedAt: Number.NaN,
    failureMessage: '',
  });
  const completedErrors = validateStructureJobWorkQueueRecord({
    ...queuedJob({ status: 'completed' }),
    completedAt: Number.NaN,
  });

  assert.ok(failedErrors.includes('failedAt must be a finite number'));
  assert.ok(failedErrors.includes('failureMessage must be a non-empty string'));
  assert.ok(completedErrors.includes('completedAt must be a finite number'));
});

test('structure job work queue port source does not cross provider, routing, audit, or canonical write boundaries', async () => {
  const source = await readFile(new URL('apps/worker/src/structureJobWorkQueuePort.ts', root), 'utf8');

  assert.match(source, /StructureJobWorkQueuePort/);
  assert.match(source, /claimNextQueuedJob/);
  assert.match(source, /markJobCompleted/);
  assert.match(source, /markJobFailed/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouting/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|runStructureJobOperationFlow|auditPersistence|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
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
    id: 'structure_job_queued',
    status: 'queued',
    createdAt: completedSectionJobFixture.createdAt,
    ...overrides,
  };
}

function createSideEffectSpies() {
  return {
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    canonicalNoteBlockWrites: [],
  };
}

function assertSideEffectSpiesUncalled(calls) {
  assert.deepEqual(calls.providerCalls, []);
  assert.deepEqual(calls.operationRoutingCalls, []);
  assert.deepEqual(calls.auditWrites, []);
  assert.deepEqual(calls.canonicalNoteBlockWrites, []);
}
