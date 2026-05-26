import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enqueueWorkspaceBrainStructureJobs,
  validateWorkspaceBrainStructureJobsDispatchCommand,
} from '../../apps/worker/src/runtime/composition/workspaceBrainStructureJobDispatch.ts';

test('WorkspaceBrain structure job dispatch enqueues queued jobs into Agent-local queue', async () => {
  const statements = [];
  const structureJob = queuedStructureJob();

  const result = await enqueueWorkspaceBrainStructureJobs({
    executor: {
      async execute(statement) {
        statements.push(statement);
        return { rowsAffected: 1 };
      },
      async query() {
        throw new Error('dispatch enqueue must not query');
      },
    },
    command: {
      workspaceId: 'workspace_001',
      userId: 'user_001',
      now: 1_764_001_000_000,
      structureJobs: [structureJob],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'workspace_brain_structure_jobs_enqueued');
  assert.deepEqual(result.scheduledJobIds, ['structure_job_001']);
  assert.equal(result.enqueuedCount, 1);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /^insert into agent_local_structure_jobs/i);
  assert.deepEqual(statements[0].args.slice(0, 4), [
    'structure_job_001',
    'workspace_001',
    'note_001',
    'section_001',
  ]);
});

test('WorkspaceBrain structure job dispatch rejects malformed and non-queued jobs before SQL', async () => {
  const validation = validateWorkspaceBrainStructureJobsDispatchCommand({
    workspaceId: 'workspace_001',
    userId: 'user_001',
    now: 1_764_001_000_000,
    structureJobs: [
      { ...queuedStructureJob(), workspaceId: 'workspace_other' },
      { ...queuedStructureJob(), id: 'structure_job_completed', status: 'completed', completedAt: 1_764_001_000_100 },
      { ...queuedStructureJob(), id: '   ' },
    ],
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.errors, [
    'structureJobs[0].workspaceId must match workspaceId',
    'structureJobs[1].status must be queued',
    'structureJobs[2].id must be a non-empty string',
  ]);
});

test('WorkspaceBrain structure job dispatch hides Agent-local SQL failures from public result', async () => {
  const result = await enqueueWorkspaceBrainStructureJobs({
    executor: {
      async execute() {
        throw new Error('sqlite token secret connection failed');
      },
      async query() {
        throw new Error('dispatch enqueue must not query');
      },
    },
    command: {
      workspaceId: 'workspace_001',
      userId: 'user_001',
      now: 1_764_001_000_000,
      structureJobs: [queuedStructureJob()],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'workspace_brain_structure_jobs_enqueue_failed');
  assert.deepEqual(result.errors, ['workspace brain structure job enqueue failed']);
  assert.doesNotMatch(JSON.stringify(result), /sqlite|token|secret|connection/i);
});

function queuedStructureJob() {
  return {
    id: 'structure_job_001',
    workspaceId: 'workspace_001',
    noteId: 'note_001',
    sectionId: 'section_001',
    targetScope: 'section',
    triggerReason: 'manual_organize',
    contextHash: 'section:note_001:section_001:hash_001',
    status: 'queued',
    priority: 'high',
    createdAt: 1_764_001_000_000,
  };
}
