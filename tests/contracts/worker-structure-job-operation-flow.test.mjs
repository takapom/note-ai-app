import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryOperationAuditPersistencePort } from '../../apps/worker/src/operationAuditPort.ts';
import { InMemoryOperationAuditRecoveryQueue } from '../../apps/worker/src/operationAuditRecoveryQueue.ts';
import {
  createStructureJobOperationIdPrefix,
  runStructureJobOperationFlow,
} from '../../apps/worker/src/structureJobOperationFlow.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import { completedSectionJobFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const completedJob = {
  ...completedSectionJobFixture,
  id: 'structure_job_runtime_001',
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  status: 'completed',
  completedAt: 1_700_000_000_000,
};

test('structure job flow routes completed job AI response through worker operation flow', async () => {
  const auditPersistence = new InMemoryOperationAuditPersistencePort();

  const result = await runStructureJobOperationFlow({
    structureJob: completedJob,
    aiResponse: [validOperationFixtures[0], validOperationFixtures[2]],
    snapshot: operationRouterSnapshotFixture,
    auditPersistence,
    now: 1_700_000_000_100,
    generatedBy: 'worker_runtime',
  });

  assert.equal(result.attempted, true);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'routed');
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.equal(result.routingFlow.routing.routedThroughOperationRouter, true);
  assert.deepEqual(
    result.routingFlow.routing.operationIds,
    ['operation_structure_job_runtime_001_0', 'operation_structure_job_runtime_001_1'],
  );
  assert.deepEqual(
    auditPersistence.list().map((record) => record.structureJobId),
    ['structure_job_runtime_001', 'structure_job_runtime_001'],
  );
});

test('structure job flow does not route non-completed jobs', async () => {
  let saveCount = 0;

  const result = await runStructureJobOperationFlow({
    structureJob: {
      ...completedJob,
      status: 'running',
      completedAt: undefined,
    },
    aiResponse: [validOperationFixtures[0]],
    snapshot: operationRouterSnapshotFixture,
    auditPersistence: {
      async save(record) {
        saveCount += 1;
        return { ok: true, errors: [], record };
      },
    },
    now: 1_700_000_000_100,
  });

  assert.equal(result.attempted, false);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'job_not_completed');
  assert.equal(result.routingFlow, undefined);
  assert.equal(saveCount, 0);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job flow separates audit persistence failure from routing result', async () => {
  const auditRecoveryQueue = new InMemoryOperationAuditRecoveryQueue();

  const result = await runStructureJobOperationFlow({
    structureJob: {
      ...completedJob,
      id: 'structure_job_audit_failure',
    },
    aiResponse: [validOperationFixtures[0]],
    snapshot: operationRouterSnapshotFixture,
    auditRecoveryQueue,
    auditPersistence: {
      async save() {
        throw new Error('audit store unavailable');
      },
    },
    now: 1_700_000_000_100,
  });

  assert.equal(result.attempted, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'routed');
  assert.equal(result.routingFlow.routing.ok, true);
  assert.equal(result.routingFlow.auditPersistence.ok, false);
  assert.deepEqual(result.errors, [
    'audit operation_structure_job_audit_failure_0: audit persistence unavailable',
  ]);
  assert.deepEqual(result.routingFlow.auditRecovery, {
    attempted: true,
    ok: true,
    enqueuedCount: 1,
    errors: [],
  });
  assert.deepEqual(
    auditRecoveryQueue.list().map((item) => item.operationId),
    ['operation_structure_job_audit_failure_0'],
  );
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job operation id prefix is derived from stable structure job id', () => {
  assert.equal(
    createStructureJobOperationIdPrefix('structure_job_123'),
    'operation_structure_job_123',
  );
  assert.equal(createStructureJobOperationIdPrefix('structure_job_unset'), 'structure_job_unset');
  assert.equal(createStructureJobOperationIdPrefix(''), '');
});
