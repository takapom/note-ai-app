import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryOperationAuditPersistencePort } from '../../apps/worker/src/operationAuditPort.ts';
import {
  createStaticOperationGenerationProviderRegistry,
} from '../../apps/worker/src/operationGenerationProviderFlow.ts';
import {
  runStructureJobOperationOrchestrationFlow,
} from '../../apps/worker/src/structureJobOperationOrchestrationFlow.ts';
import { assembleContextEnvelope } from '../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import { completedSectionJobFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const now = 1_764_000_300_000;
const runningJob = {
  ...completedSectionJobFixture,
  id: 'structure_job_orchestration_001',
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  targetScope: 'section',
  status: 'running',
  startedAt: now - 500,
  completedAt: undefined,
};
const validEnvelope = assembleContextEnvelope(contextAssemblyInputFixture);
const contextEnvelopeBuilt = {
  type: 'ContextEnvelopeBuilt',
  workspaceId: runningJob.workspaceId,
  userId: 'user_001',
  noteId: runningJob.noteId,
  structureJobId: runningJob.id,
  targetScope: runningJob.targetScope,
  builtAt: now - 100,
};

function operationFlowInput(auditPersistence) {
  return {
    snapshot: operationRouterSnapshotFixture,
    auditPersistence,
    now: now + 100,
    generatedBy: 'worker_runtime',
  };
}

test('runtime orchestration passes provider completedStructureJobResponse aiResponse to structure job operation flow', async () => {
  const auditPersistence = new InMemoryOperationAuditPersistencePort();
  const providerOperations = [validOperationFixtures[0], validOperationFixtures[2]];

  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return {
          operations: providerOperations,
          providerMetadata: { model: 'mock-structured-output' },
        };
      },
    }),
    operationFlow: operationFlowInput(auditPersistence),
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'routed');
  assert.equal(result.generationFlow.completedStructureJobResponse.structureJob.status, 'completed');
  assert.equal(result.generationFlow.completedStructureJobResponse.structureJob.completedAt, now);
  assert.equal(result.generationFlow.completedStructureJobResponse.aiResponse, providerOperations);
  assert.equal(result.structureJobOperationFlow.routingFlow.routing.routedThroughOperationRouter, true);
  assert.deepEqual(
    result.structureJobOperationFlow.routingFlow.routing.operationIds,
    ['operation_structure_job_orchestration_001_0', 'operation_structure_job_orchestration_001_1'],
  );
  assert.deepEqual(
    auditPersistence.list().map((record) => record.structureJobId),
    ['structure_job_orchestration_001', 'structure_job_orchestration_001'],
  );
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('runtime orchestration does not reach Operation Router or audit persistence when provider is unavailable', async () => {
  let saveCount = 0;

  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: {
      resolveProvider() {
        return undefined;
      },
    },
    operationFlow: operationFlowInput({
      async save(record) {
        saveCount += 1;
        return { ok: true, errors: [], record };
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_unavailable');
  assert.equal(result.structureJobOperationFlow, undefined);
  assert.equal(result.generationFlow.completedStructureJobResponse, undefined);
  assert.equal(saveCount, 0);
  assert.deepEqual(result.generationFlow.operationRoutingCalls, []);
  assert.deepEqual(result.generationFlow.auditWrites, []);
});

test('runtime orchestration does not reach Operation Router or audit persistence when provider fails', async () => {
  let saveCount = 0;

  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        throw new Error('model timeout');
      },
    }),
    operationFlow: operationFlowInput({
      async save(record) {
        saveCount += 1;
        return { ok: true, errors: [], record };
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_failed');
  assert.equal(result.structureJobOperationFlow, undefined);
  assert.deepEqual(result.errors, ['operation generation provider failed: model timeout']);
  assert.equal(saveCount, 0);
  assert.deepEqual(result.generationFlow.operationRoutingCalls, []);
  assert.deepEqual(result.generationFlow.auditWrites, []);
});

test('runtime orchestration does not reach Operation Router or audit persistence on invalid generation input', async () => {
  let providerCalls = 0;
  let saveCount = 0;

  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: {
      ...runningJob,
      status: 'completed',
      completedAt: now - 10,
    },
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'must_not_be_called',
      async generateOperations() {
        providerCalls += 1;
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: operationFlowInput({
      async save(record) {
        saveCount += 1;
        return { ok: true, errors: [], record };
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_runtime_input');
  assert.equal(result.structureJobOperationFlow, undefined);
  assert.equal(providerCalls, 0);
  assert.equal(saveCount, 0);
  assert.deepEqual(result.errors, ['structure job status completed is not running']);
  assert.deepEqual(result.generationFlow.operationRoutingCalls, []);
  assert.deepEqual(result.generationFlow.auditWrites, []);
});

test('runtime orchestration does not reach Operation Router or audit persistence on invalid ContextEnvelope', async () => {
  let providerCalls = 0;
  let saveCount = 0;

  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: runningJob,
    contextEnvelope: {
      ...validEnvelope,
      fullWorkspace: { notes: ['must not reach provider or routing'] },
    },
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'must_not_be_called',
      async generateOperations() {
        providerCalls += 1;
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: operationFlowInput({
      async save(record) {
        saveCount += 1;
        return { ok: true, errors: [], record };
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_context_envelope');
  assert.equal(result.structureJobOperationFlow, undefined);
  assert.equal(providerCalls, 0);
  assert.equal(saveCount, 0);
  assert.ok(result.errors.includes('context envelope must not include full workspace, full notes, or dump fields'));
});

test('runtime orchestration passes non-array AI response unchanged to downstream Operation Router validation', async () => {
  const auditPersistence = new InMemoryOperationAuditPersistencePort();

  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: { freeform: 'not an operation list' } };
      },
    }),
    operationFlow: operationFlowInput(auditPersistence),
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'routed');
  assert.equal(result.generationFlow.ok, true);
  assert.deepEqual(result.generationFlow.completedStructureJobResponse.aiResponse, {
    freeform: 'not an operation list',
  });
  assert.equal(result.structureJobOperationFlow.routingFlow.routing.routedThroughOperationRouter, true);
  assert.deepEqual(result.structureJobOperationFlow.routingFlow.routing.errors, [
    'AI response must be an operation list',
  ]);
  assert.deepEqual(auditPersistence.list(), []);
});

test('runtime orchestration preserves audit persistence failure as downstream failure', async () => {
  const result = await runStructureJobOperationOrchestrationFlow({
    structureJob: {
      ...runningJob,
      id: 'structure_job_orchestration_audit_failure',
    },
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt: {
      ...contextEnvelopeBuilt,
      structureJobId: 'structure_job_orchestration_audit_failure',
    },
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: operationFlowInput({
      async save() {
        throw new Error('audit store unavailable');
      },
    }),
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'routed');
  assert.equal(result.structureJobOperationFlow.routingFlow.routing.ok, true);
  assert.equal(result.structureJobOperationFlow.routingFlow.auditPersistence.ok, false);
  assert.deepEqual(result.errors, [
    'audit operation_structure_job_orchestration_audit_failure_0: audit persistence failed: audit store unavailable',
  ]);
});
