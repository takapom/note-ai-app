import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStaticOperationGenerationProviderRegistry,
  runOperationGenerationProviderFlow,
} from '../../apps/worker/src/operationGenerationProviderFlow.ts';
import { assembleContextEnvelope } from '../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import { completedSectionJobFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const now = 1_764_000_200_000;
const runningJob = {
  ...completedSectionJobFixture,
  id: 'structure_job_provider_001',
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

test('operation generation provider flow returns completed StructureJob response and provider-independent operations on provider success', async () => {
  const providerRequests = [];
  const provider = {
    id: 'mock_structure_provider',
    async generateOperations(request) {
      providerRequests.push(request);
      return {
        operations: [
          {
            type: 'create_semantic_unit',
            target: { noteId: runningJob.noteId },
            sourceSpans: [{ sourceBlockId: 'block_paragraph_001', startOffset: 0, endOffset: 18 }],
            confidence: 0.91,
          },
        ],
        providerMetadata: { model: 'mock-structured-output' },
      };
    },
  };

  const result = await runOperationGenerationProviderFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry(provider),
    now,
  });

  assert.equal(result.attempted, true);
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'operations_generated');
  assert.deepEqual(result.errors, []);
  assert.equal(result.completedStructureJobResponse.structureJob.status, 'completed');
  assert.equal(result.completedStructureJobResponse.structureJob.completedAt, now);
  assert.deepEqual(result.completedStructureJobResponse.aiResponse, [
    {
      type: 'create_semantic_unit',
      target: { noteId: runningJob.noteId },
      sourceSpans: [{ sourceBlockId: 'block_paragraph_001', startOffset: 0, endOffset: 18 }],
      confidence: 0.91,
    },
  ]);
  assert.equal(result.completedStructureJobResponse.providerId, 'mock_structure_provider');
  assert.deepEqual(result.completedStructureJobResponse.providerMetadata, { model: 'mock-structured-output' });
  assert.deepEqual(result.event, {
    type: 'OperationsGenerated',
    workspaceId: runningJob.workspaceId,
    userId: contextEnvelopeBuilt.userId,
    noteId: runningJob.noteId,
    structureJobId: runningJob.id,
    providerId: 'mock_structure_provider',
    operationCount: 1,
    generatedAt: now,
  });
  assert.deepEqual(result.providerCalls, [{ providerId: 'mock_structure_provider', structureJobId: runningJob.id }]);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].contextEnvelope, validEnvelope);
  assert.equal('fullWorkspace' in providerRequests[0], false);
  assert.equal('allNotes' in providerRequests[0], false);
});

test('operation generation provider flow preserves non-array AI response for downstream Operation Router validation', async () => {
  const result = await runOperationGenerationProviderFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: { freeform: 'not an operation list' } };
      },
    }),
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.event.operationCount, 0);
  assert.deepEqual(result.completedStructureJobResponse.aiResponse, { freeform: 'not an operation list' });
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('operation generation provider flow rejects invalid runtime input before provider, routing, audit, or Note/Block mutation', async () => {
  let providerCalls = 0;

  const result = await runOperationGenerationProviderFlow({
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
        return { operations: [] };
      },
    }),
    now,
  });

  assert.equal(result.attempted, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_runtime_input');
  assert.deepEqual(result.errors, ['structure job status completed is not running']);
  assert.equal(result.completedStructureJobResponse, undefined);
  assert.equal(result.event, undefined);
  assert.equal(providerCalls, 0);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('operation generation provider flow rejects invalid ContextEnvelope and full workspace dump before provider', async () => {
  let providerCalls = 0;
  const invalidEnvelope = {
    ...validEnvelope,
    fullWorkspace: { notes: ['must not reach provider'] },
  };

  const result = await runOperationGenerationProviderFlow({
    structureJob: runningJob,
    contextEnvelope: invalidEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'must_not_be_called',
      async generateOperations() {
        providerCalls += 1;
        return { operations: [] };
      },
    }),
    now,
  });

  assert.equal(result.attempted, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_context_envelope');
  assert.ok(result.errors.includes('context envelope must not include full workspace, full notes, or dump fields'));
  assert.equal(result.completedStructureJobResponse, undefined);
  assert.equal(providerCalls, 0);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('operation generation provider flow keeps provider failure away from routing, audit, and Note/Block SoT', async () => {
  const result = await runOperationGenerationProviderFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        throw new Error('model timeout');
      },
    }),
    now,
  });

  assert.equal(result.attempted, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_failed');
  assert.deepEqual(result.errors, ['operation generation provider failed: model timeout']);
  assert.equal(result.completedStructureJobResponse, undefined);
  assert.equal(result.event, undefined);
  assert.deepEqual(result.providerCalls, [{ providerId: 'mock_structure_provider', structureJobId: runningJob.id }]);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('operation generation provider flow normalizes provider registry resolution failure', async () => {
  const result = await runOperationGenerationProviderFlow({
    structureJob: runningJob,
    contextEnvelope: validEnvelope,
    contextEnvelopeBuilt,
    providerRegistry: {
      resolveProvider() {
        throw new Error('registry unavailable');
      },
    },
    now,
  });

  assert.equal(result.attempted, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_unavailable');
  assert.deepEqual(result.errors, [
    'operation generation provider resolution failed: registry unavailable',
  ]);
  assert.equal(result.completedStructureJobResponse, undefined);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});
