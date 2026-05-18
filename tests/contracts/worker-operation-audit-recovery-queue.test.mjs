import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryOperationAuditRecoveryQueue,
  validateOperationAuditRecoveryPayload,
} from '../../apps/worker/src/operationAuditRecoveryQueue.ts';
import { routeGeneratedOperations } from '../../apps/worker/src/operationRoutingAdapter.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const routed = routeGeneratedOperations({
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_recovery_001',
  aiResponse: [validOperationFixtures[0], validOperationFixtures[2]],
  snapshot: operationRouterSnapshotFixture,
  now: 1_700_000_000_000,
  generatedBy: 'worker_runtime',
});

const [firstAuditRecord, secondAuditRecord] = routed.auditRecords;

function recoveryPayloadFor(auditRecord, failedAt = 1_700_000_001_000) {
  return {
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    noteId: auditRecord.noteId,
    structureJobId: auditRecord.structureJobId,
    auditRecord,
    failureMessage: 'operation audit SQL write failed: turso unavailable',
    failedAt,
  };
}

test('in-memory operation audit recovery queue enqueues valid payloads in order', async () => {
  const queue = new InMemoryOperationAuditRecoveryQueue();

  const first = await queue.enqueue(recoveryPayloadFor(firstAuditRecord, 1_700_000_001_000));
  const second = await queue.enqueue(recoveryPayloadFor(secondAuditRecord, 1_700_000_002_000));

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(second.errors, []);
  assert.deepEqual(
    queue.list().map((item) => item.operationId),
    [firstAuditRecord.id, secondAuditRecord.id],
  );
});

test('operation audit recovery queue rejects invalid primitives without enqueueing', async () => {
  const queue = new InMemoryOperationAuditRecoveryQueue();

  const result = await queue.enqueue({
    ...recoveryPayloadFor(firstAuditRecord),
    operationId: ' operation_recovery_bad ',
    workspaceId: ' ',
    noteId: '',
    structureJobId: ' structure_job_bad ',
    failureMessage: '',
    failedAt: Number.NaN,
  });

  assert.equal(result.ok, false);
  assert.equal(result.item, undefined);
  assert.equal(queue.list().length, 0);
  assert.ok(result.errors.includes('operationId must be trimmed'));
  assert.ok(result.errors.includes('workspaceId must be a non-empty string'));
  assert.ok(result.errors.includes('noteId must be a non-empty string when provided'));
  assert.ok(result.errors.includes('structureJobId must be trimmed when provided'));
  assert.ok(result.errors.includes('failureMessage must be a non-empty string'));
  assert.ok(result.errors.includes('failedAt must be a finite number'));
});

test('operation audit recovery queue rejects audit record id and workspace mismatches', async () => {
  const queue = new InMemoryOperationAuditRecoveryQueue();

  const result = await queue.enqueue({
    ...recoveryPayloadFor(firstAuditRecord),
    operationId: 'operation_recovery_other',
    workspaceId: 'workspace_other',
  });

  assert.equal(result.ok, false);
  assert.equal(queue.list().length, 0);
  assert.ok(result.errors.includes('auditRecord.id must match operationId'));
  assert.ok(result.errors.includes('auditRecord.workspaceId must match workspaceId'));
});

test('operation audit recovery queue rejects optional audit record id mismatches when provided', () => {
  const errors = validateOperationAuditRecoveryPayload({
    ...recoveryPayloadFor(firstAuditRecord),
    noteId: 'note_other',
    structureJobId: 'structure_job_other',
  });

  assert.ok(errors.includes('auditRecord.noteId must match noteId'));
  assert.ok(errors.includes('auditRecord.structureJobId must match structureJobId'));
});

test('operation audit recovery queue stores original policy and status without reclassifying', async () => {
  const queue = new InMemoryOperationAuditRecoveryQueue();
  const auditRecord = {
    ...firstAuditRecord,
    policy: 'runtime_passthrough_policy',
    status: 'runtime_passthrough_status',
  };

  const result = await queue.enqueue(recoveryPayloadFor(auditRecord));

  assert.equal(result.ok, true);
  assert.equal(queue.list()[0].auditRecord.policy, 'runtime_passthrough_policy');
  assert.equal(queue.list()[0].auditRecord.status, 'runtime_passthrough_status');
});

test('operation audit recovery queue does not retry or call an executor', async () => {
  const queue = new InMemoryOperationAuditRecoveryQueue();
  let executorCallCount = 0;
  const executor = {
    async writeOperationAudit() {
      executorCallCount += 1;
    },
  };

  const result = await queue.enqueue({
    ...recoveryPayloadFor(firstAuditRecord),
    executor,
  });

  assert.equal(result.ok, true);
  assert.equal(executorCallCount, 0);
  assert.equal('executor' in queue.list()[0], false);
});
