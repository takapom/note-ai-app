import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryOperationAuditPersistencePort,
  validateOperationAuditRecordForPersistence,
} from '../../apps/worker/src/operationAuditPort.ts';
import { routeGeneratedOperations } from '../../apps/worker/src/operationRoutingAdapter.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const routed = routeGeneratedOperations({
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_audit_001',
  aiResponse: [validOperationFixtures[0], validOperationFixtures[2]],
  snapshot: operationRouterSnapshotFixture,
  now: 1_700_000_000_000,
  generatedBy: 'worker_runtime',
});

const [silentRecord, reviewRecord] = routed.auditRecords;

test('in-memory operation audit port saves Operation Router audit records without reclassifying policy', async () => {
  const port = new InMemoryOperationAuditPersistencePort();
  const record = {
    ...reviewRecord,
    policy: 'silent',
    status: 'failed',
  };

  const result = await port.save(record);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.record.policy, 'silent');
  assert.equal(result.record.status, 'failed');
  assert.equal(port.findById(record.id).policy, 'silent');
  assert.equal(port.findById(record.id).status, 'failed');
});

test('in-memory operation audit port rejects invalid required primitives without sentinel fallback', async () => {
  const port = new InMemoryOperationAuditPersistencePort();
  const invalidRecord = {
    ...silentRecord,
    id: ' operation_audit_bad ',
    workspaceId: ' ',
    generatedBy: '',
    createdAt: Number.NaN,
    updatedAt: Number.POSITIVE_INFINITY,
  };

  const result = await port.save(invalidRecord);

  assert.equal(result.ok, false);
  assert.equal(result.record, undefined);
  assert.equal(port.list().length, 0);
  assert.ok(result.errors.includes('auditRecord.id must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.workspaceId must be a non-empty string'));
  assert.ok(result.errors.includes('auditRecord.generatedBy must be a non-empty string'));
  assert.ok(result.errors.includes('auditRecord.createdAt must be a finite number'));
  assert.ok(result.errors.includes('auditRecord.updatedAt must be a finite number'));
});

test('in-memory operation audit port rejects source span target ids that do not match the audit record id', async () => {
  const port = new InMemoryOperationAuditPersistencePort();
  const invalidRecord = {
    ...silentRecord,
    sourceSpans: [
      {
        ...silentRecord.sourceSpans[0],
        targetId: 'operation_audit_other',
      },
    ],
  };

  const result = await port.save(invalidRecord);

  assert.equal(result.ok, false);
  assert.equal(port.findById(invalidRecord.id), undefined);
  assert.ok(result.errors.includes('auditRecord.sourceSpans[0].targetId must match auditRecord.id'));
});

test('operation audit persistence validation does not validate operation policy semantics', () => {
  const errors = validateOperationAuditRecordForPersistence({
    ...reviewRecord,
    operation: {
      ...reviewRecord.operation,
      type: 'create_memory_candidate',
    },
    operationType: 'create_memory_candidate',
    policy: 'silent',
  });

  assert.deepEqual(errors, []);
});

test('operation audit persistence validates policy and status vocabulary without reclassifying', () => {
  const errors = validateOperationAuditRecordForPersistence({
    ...reviewRecord,
    policy: 'runtime_passthrough_policy',
    status: 'runtime_passthrough_status',
  });

  assert.deepEqual(errors, [
    'auditRecord.policy must be one of silent, inline, review, blocked',
    'auditRecord.status must be one of proposed, applied, rejected, reverted, failed',
  ]);
});

test('in-memory operation audit port rejects duplicate audit ids instead of overwriting records', async () => {
  const port = new InMemoryOperationAuditPersistencePort();

  const first = await port.save(silentRecord);
  const duplicate = await port.save({
    ...reviewRecord,
    id: silentRecord.id,
    sourceSpans: reviewRecord.sourceSpans.map((span) => ({
      ...span,
      targetId: silentRecord.id,
    })),
  });

  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.errors, [`auditRecord.id ${silentRecord.id} already exists`]);
  assert.equal(port.list().length, 1);
  assert.deepEqual(port.findById(silentRecord.id).operationType, silentRecord.operationType);
});
