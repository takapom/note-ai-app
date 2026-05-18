import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryOperationAuditPersistencePort } from '../../apps/worker/src/operationAuditPort.ts';
import { runOperationRoutingFlow } from '../../apps/worker/src/operationRoutingFlow.ts';
import {
  forbiddenRewriteOperationFixture,
  validOperationFixtures,
} from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const runtimeInput = {
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_flow_001',
  snapshot: operationRouterSnapshotFixture,
  now: 1_700_000_000_000,
  generatedBy: 'worker_runtime',
  completedStructureJobGate: {
    structureJobId: 'structure_job_001',
    status: 'completed',
    providerSucceeded: true,
  },
};

test('worker flow routes AI response and persists only Operation Router audit records', async () => {
  const auditPersistence = new InMemoryOperationAuditPersistencePort();
  const noteSotPort = {
    saveBlock() {
      throw new Error('note/block SoT must not be changed by operation routing flow');
    },
  };

  const result = await runOperationRoutingFlow({
    ...runtimeInput,
    aiResponse: [validOperationFixtures[0], validOperationFixtures[2]],
    auditPersistence,
    noteSotPort,
  });

  assert.equal(result.routing.ok, true);
  assert.equal(result.routing.routedThroughOperationRouter, true);
  assert.deepEqual(result.routing.directApplyResults, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.auditPersistence, {
    attempted: true,
    ok: true,
    savedCount: 2,
    errors: [],
  });
  assert.deepEqual(
    auditPersistence.list().map((record) => record.id),
    ['operation_flow_001_0', 'operation_flow_001_1'],
  );
  assert.equal(auditPersistence.findById('operation_flow_001_0').workspaceId, runtimeInput.workspaceId);
});

test('worker flow does not directly apply route decisions to note or block SoT', async () => {
  let noteMutationCount = 0;

  const result = await runOperationRoutingFlow({
    ...runtimeInput,
    operationIdPrefix: 'operation_flow_no_apply',
    aiResponse: [validOperationFixtures[0]],
    auditPersistence: {
      async save(record) {
        return { ok: true, errors: [], record };
      },
    },
    noteRepository: {
      saveNote() {
        noteMutationCount += 1;
      },
      saveBlock() {
        noteMutationCount += 1;
      },
    },
  });

  assert.equal(result.routing.ok, true);
  assert.equal(result.routing.applyResults[0].action, 'apply');
  assert.deepEqual(result.routing.directApplyResults, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.equal(noteMutationCount, 0);
});

test('worker flow refuses direct calls without a completed StructureJob gate', async () => {
  const { completedStructureJobGate: _gate, ...inputWithoutGate } = runtimeInput;

  const result = await runOperationRoutingFlow({
    ...inputWithoutGate,
    aiResponse: [validOperationFixtures[0]],
    auditPersistence: {
      async save(record) {
        return { ok: true, errors: [], record };
      },
    },
  });

  assert.equal(result.routing.ok, false);
  assert.equal(result.routing.routedThroughOperationRouter, false);
  assert.deepEqual(result.routing.errors, ['completedStructureJobGate is required']);
  assert.deepEqual(result.auditPersistence, {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
  });
  assert.deepEqual(result.directApplyResults, []);
});

test('worker flow refuses direct calls when provider success gate is false', async () => {
  const result = await runOperationRoutingFlow({
    ...runtimeInput,
    completedStructureJobGate: {
      structureJobId: 'structure_job_001',
      status: 'completed',
      providerSucceeded: false,
    },
    aiResponse: [validOperationFixtures[0]],
    auditPersistence: {
      async save(record) {
        return { ok: true, errors: [], record };
      },
    },
  });

  assert.equal(result.routing.ok, false);
  assert.equal(result.routing.routedThroughOperationRouter, false);
  assert.deepEqual(result.routing.errors, ['completedStructureJobGate.providerSucceeded must be true']);
  assert.equal(result.auditPersistence.attempted, false);
});

test('worker flow separates audit save failure from routing result', async () => {
  const result = await runOperationRoutingFlow({
    ...runtimeInput,
    operationIdPrefix: 'operation_flow_audit_failure',
    aiResponse: [validOperationFixtures[0]],
    auditPersistence: {
      async save() {
        throw new Error('database unavailable');
      },
    },
  });

  assert.equal(result.routing.ok, true);
  assert.equal(result.routing.acceptedCount, 1);
  assert.deepEqual(result.routing.errors, []);
  assert.deepEqual(result.auditPersistence, {
    attempted: true,
    ok: false,
    savedCount: 0,
    errors: ['audit operation_flow_audit_failure_0: audit persistence failed: database unavailable'],
  });
  assert.deepEqual(result.directApplyResults, []);
});

test('worker flow does not persist audit records when runtime routing boundary rejects before router', async () => {
  let saveCount = 0;

  const result = await runOperationRoutingFlow({
    ...runtimeInput,
    workspaceId: 'workspace_unset',
    operationIdPrefix: 'operation_placeholder',
    aiResponse: [validOperationFixtures[0]],
    auditPersistence: {
      async save(record) {
        saveCount += 1;
        return { ok: true, errors: [], record };
      },
    },
  });

  assert.equal(result.routing.ok, false);
  assert.equal(result.routing.routedThroughOperationRouter, false);
  assert.deepEqual(result.routing.auditRecords, []);
  assert.deepEqual(result.auditPersistence, {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
  });
  assert.equal(saveCount, 0);
});

test('worker flow persists rejected audit records produced by Operation Router', async () => {
  const auditPersistence = new InMemoryOperationAuditPersistencePort();

  const result = await runOperationRoutingFlow({
    ...runtimeInput,
    operationIdPrefix: 'operation_flow_rejected',
    aiResponse: [validOperationFixtures[0], forbiddenRewriteOperationFixture],
    auditPersistence,
  });

  assert.equal(result.routing.ok, false);
  assert.equal(result.routing.routedThroughOperationRouter, true);
  assert.equal(result.routing.acceptedCount, 1);
  assert.equal(result.routing.rejectedCount, 1);
  assert.equal(result.auditPersistence.ok, true);
  assert.equal(result.auditPersistence.savedCount, 2);
  assert.deepEqual(
    auditPersistence.list().map((record) => record.status),
    ['proposed', 'rejected'],
  );
});
