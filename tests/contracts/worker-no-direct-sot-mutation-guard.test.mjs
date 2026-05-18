import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { InMemoryOperationAuditPersistencePort } from '../../apps/worker/src/operationAuditPort.ts';
import { createStaticOperationGenerationProviderRegistry } from '../../apps/worker/src/operationGenerationProviderFlow.ts';
import {
  runOperationProjectionPersistenceFlow,
} from '../../apps/worker/src/operationProjectionPersistenceFlow.ts';
import { InMemoryOperationProjectionPersistencePort } from '../../apps/worker/src/operationProjectionPort.ts';
import { InMemoryOperationProposalPersistencePort } from '../../apps/worker/src/operationProposalPort.ts';
import { runOperationRoutingFlow } from '../../apps/worker/src/operationRoutingFlow.ts';
import {
  runNoteStructureRouteHandler,
} from '../../apps/worker/src/noteStructureRuntimeHandlers.ts';
import {
  runStructureJobProcessorFlow,
} from '../../apps/worker/src/structureJobProcessorFlow.ts';
import { InMemoryStructureJobWorkQueue } from '../../apps/worker/src/structureJobWorkQueuePort.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import {
  forbiddenRewriteOperationFixture,
  validOperationFixtures,
} from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import {
  completedSectionJobFixture,
  schedulerSectionsFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const root = new URL('../../', import.meta.url);
const routeNow = 1_764_000_600_000;
const processNow = routeNow + 1_000;
const projectionNow = processNow + 1_000;

test('end-to-end structure processing never mutates canonical Note Block or Section SoT', async () => {
  const route = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'note_leave',
    now: routeNow,
    ports: createSchedulerPorts(),
  });
  const workQueue = new InMemoryStructureJobWorkQueue(route.scheduledJobs);
  const auditPersistence = new InMemoryOperationAuditPersistencePort();
  const providerOperations = [
    validOperationFixtures[0],
    validOperationFixtures[2],
    validOperationFixtures[3],
  ];

  const processed = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now: processNow,
    workQueue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: providerOperations };
      },
    }),
    operationFlow: {
      snapshot: operationRouterSnapshotFixture,
      auditPersistence,
      now: processNow + 100,
      generatedBy: 'worker_runtime',
    },
  });

  assert.equal(route.ok, true);
  assert.equal(route.scheduledJobs.length, 1);
  assert.deepEqual(route.providerCalls, []);
  assert.deepEqual(route.operationRoutingCalls, []);
  assert.deepEqual(route.auditWrites, []);

  assert.equal(processed.ok, true);
  assert.equal(processed.reason, 'completed');
  assert.deepEqual(processed.providerCalls, [{
    providerId: 'mock_structure_provider',
    structureJobId: route.scheduledJobs[0].id,
  }]);
  assert.deepEqual(processed.operationRoutingCalls, [{ structureJobId: route.scheduledJobs[0].id }]);
  assert.deepEqual(processed.auditWrites, [{ structureJobId: route.scheduledJobs[0].id, savedCount: 3 }]);
  assert.deepEqual(processed.directApplyResults, []);
  assert.deepEqual(processed.noteSotMutations, []);
  assert.deepEqual(processed.agent.directApplyResults, []);
  assert.deepEqual(processed.agent.noteSotMutations, []);
  assert.deepEqual(processed.agent.orchestration.directApplyResults, []);
  assert.deepEqual(processed.agent.orchestration.noteSotMutations, []);
  assert.deepEqual(processed.agent.orchestration.structureJobOperationFlow.directApplyResults, []);
  assert.deepEqual(processed.agent.orchestration.structureJobOperationFlow.noteSotMutations, []);
  assert.deepEqual(processed.agent.orchestration.structureJobOperationFlow.routingFlow.directApplyResults, []);

  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const projection = await runOperationProjectionPersistenceFlow({
    routing: processed.agent.orchestration.structureJobOperationFlow.routingFlow.routing,
    projectionPersistence,
    proposalPersistence,
    now: projectionNow,
  });

  assert.equal(projection.projectionPersistence.ok, true);
  assert.equal(projection.projectionPersistence.savedCount, 1);
  assert.equal(projection.proposalPersistence.ok, true);
  assert.equal(projection.proposalPersistence.savedCount, 2);
  assert.deepEqual(projection.directApplyResults, []);
  assert.deepEqual(projection.noteSotMutations, []);
  assert.deepEqual(projection.userAuthoredBlockMutations, []);
  assert.deepEqual(projectionPersistence.list().map((intent) => intent.effect), ['create_semantic_unit']);
  assert.deepEqual(
    proposalPersistence.listProposals().map((proposal) => proposal.auditRecord.operationType),
    ['create_memory_candidate', 'insert_assist_block'],
  );
  assert.deepEqual(
    auditPersistence.list().map((record) => record.operationType),
    ['create_semantic_unit', 'create_memory_candidate', 'insert_assist_block'],
  );
});

test('end-to-end provider failure does not persist projections or mutate SoT', async () => {
  const route = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'note_leave',
    now: routeNow,
    ports: createSchedulerPorts(),
  });
  const workQueue = new InMemoryStructureJobWorkQueue(route.scheduledJobs);
  const auditPersistence = new InMemoryOperationAuditPersistencePort();
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();

  const processed = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now: processNow,
    workQueue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        throw new Error('model timeout');
      },
    }),
    operationFlow: {
      snapshot: operationRouterSnapshotFixture,
      auditPersistence,
      now: processNow + 100,
      generatedBy: 'worker_runtime',
    },
  });

  assert.equal(processed.ok, false);
  assert.equal(processed.reason, 'agent_failed');
  assert.equal(processed.agent.orchestration.reason, 'provider_failed');
  assert.deepEqual(processed.operationRoutingCalls, []);
  assert.deepEqual(processed.auditWrites, []);
  assert.deepEqual(processed.directApplyResults, []);
  assert.deepEqual(processed.noteSotMutations, []);
  assert.equal(auditPersistence.list().length, 0);
  assert.deepEqual(projectionPersistence.list(), []);
  assert.deepEqual(proposalPersistence.listProposals(), []);
});

test('end-to-end context failure does not persist projections or mutate SoT', async () => {
  const route = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'note_leave',
    now: routeNow,
    ports: createSchedulerPorts(),
  });
  const workQueue = new InMemoryStructureJobWorkQueue(route.scheduledJobs);
  const auditPersistence = new InMemoryOperationAuditPersistencePort();
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  let providerCalls = 0;

  const processed = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now: processNow,
    workQueue,
    contextAssemblyPorts: createContextAssemblyPorts({
      targetSnapshot: {
        async loadTargetContext() {
          throw new Error('target unavailable');
        },
      },
    }),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'must_not_be_called',
      async generateOperations() {
        providerCalls += 1;
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: {
      snapshot: operationRouterSnapshotFixture,
      auditPersistence,
      now: processNow + 100,
      generatedBy: 'worker_runtime',
    },
  });

  assert.equal(processed.ok, false);
  assert.equal(processed.reason, 'agent_failed');
  assert.equal(processed.agent.orchestration, undefined);
  assert.deepEqual(processed.providerCalls, []);
  assert.deepEqual(processed.operationRoutingCalls, []);
  assert.deepEqual(processed.auditWrites, []);
  assert.deepEqual(processed.directApplyResults, []);
  assert.deepEqual(processed.noteSotMutations, []);
  assert.equal(providerCalls, 0);
  assert.equal(auditPersistence.list().length, 0);
  assert.deepEqual(projectionPersistence.list(), []);
  assert.deepEqual(proposalPersistence.listProposals(), []);
});

test('worker runtime source guard forbids canonical note section block write SQL in AI paths', async () => {
  const aiRuntimeFiles = [
    'apps/worker/src/noteStructureRuntimeHandlers.ts',
    'apps/worker/src/structureJobProcessorFlow.ts',
    'apps/worker/src/operationGenerationProviderFlow.ts',
    'apps/worker/src/structureJobOperationOrchestrationFlow.ts',
    'apps/worker/src/structureJobOperationFlow.ts',
    'apps/worker/src/operationRoutingAdapter.ts',
    'apps/worker/src/operationRoutingFlow.ts',
    'apps/worker/src/operationProjectionPersistenceFlow.ts',
    'apps/worker/src/operationProjectionPort.ts',
    'apps/worker/src/operationProposalPort.ts',
    'apps/worker/src/operationApprovalRuntimeHandlers.ts',
  ];
  const canonicalWriteSql = /\b(?:insert\s+into|replace\s+into|update|delete\s+from|upsert)\s+[`"]?(?:notes|sections|blocks)[`"]?\b/i;

  for (const file of aiRuntimeFiles) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, canonicalWriteSql, file);
  }

  const targetSnapshot = await readFile(
    new URL('apps/worker/src/contextAssemblyTargetSnapshotSqlAdapter.ts', root),
    'utf8',
  );
  const relatedContext = await readFile(
    new URL('apps/worker/src/contextAssemblyRelatedContextSqlAdapter.ts', root),
    'utf8',
  );
  const schedulerSnapshot = await readFile(
    new URL('apps/worker/src/schedulerNoteSnapshotSqlAdapter.ts', root),
    'utf8',
  );

  assert.match(targetSnapshot, /from notes/i);
  assert.match(targetSnapshot, /from sections/i);
  assert.match(targetSnapshot, /from blocks/i);
  assert.match(relatedContext, /inner join notes/i);
  assert.match(relatedContext, /inner join blocks/i);
  assert.match(schedulerSnapshot, /from sections/i);
});

test('operation routing and projection paths do not accept direct note repository mutation', async () => {
  let directNoteMutationCalls = 0;
  const directNoteRepository = {
    saveNote() {
      directNoteMutationCalls += 1;
      throw new Error('AI runtime must not save canonical notes');
    },
    saveSection() {
      directNoteMutationCalls += 1;
      throw new Error('AI runtime must not save canonical sections');
    },
    saveBlock() {
      directNoteMutationCalls += 1;
      throw new Error('AI runtime must not save canonical blocks');
    },
  };
  const routing = await runOperationRoutingFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    structureJobId: 'structure_job_no_direct_sot',
    operationIdPrefix: 'operation_no_direct_sot',
    snapshot: operationRouterSnapshotFixture,
    now: processNow,
    generatedBy: 'worker_runtime',
    completedStructureJobGate: {
      structureJobId: 'structure_job_no_direct_sot',
      status: 'completed',
    },
    aiResponse: [
      validOperationFixtures[0],
      validOperationFixtures[2],
      forbiddenRewriteOperationFixture,
    ],
    auditPersistence: new InMemoryOperationAuditPersistencePort(),
    noteRepository: directNoteRepository,
  });
  const projection = await runOperationProjectionPersistenceFlow({
    routing: routing.routing,
    projectionPersistence: new InMemoryOperationProjectionPersistencePort(),
    proposalPersistence: new InMemoryOperationProposalPersistencePort(),
    now: projectionNow,
    noteRepository: directNoteRepository,
  });

  assert.equal(routing.routing.routedThroughOperationRouter, true);
  assert.deepEqual(routing.directApplyResults, []);
  assert.deepEqual(routing.routing.directApplyResults, []);
  assert.deepEqual(projection.directApplyResults, []);
  assert.deepEqual(projection.noteSotMutations, []);
  assert.deepEqual(projection.userAuthoredBlockMutations, []);
  assert.equal(directNoteMutationCalls, 0);
});

function createSchedulerPorts() {
  return {
    noteSnapshot: {
      async loadSections(input) {
        assert.deepEqual(input, {
          workspaceId: noteFixture.workspaceId,
          noteId: noteFixture.id,
        });
        return schedulerSectionsFixture;
      },
    },
    structureJobQueue: {
      async listCompletedJobs(input) {
        assert.deepEqual(input, {
          workspaceId: noteFixture.workspaceId,
          noteId: noteFixture.id,
        });
        return [completedSectionJobFixture];
      },
      async enqueueJobs(jobs) {
        return { ok: true, enqueuedCount: jobs.length, errors: [] };
      },
    },
    nextOpenDigestPreparation: {
      async prepareDigest() {
        return { ok: true, errors: [] };
      },
    },
  };
}

function createContextAssemblyPorts(overrides = {}) {
  return {
    targetSnapshot: overrides.targetSnapshot ?? {
      async loadTargetContext(input) {
        assert.equal(input.userId, 'user_001');
        return {
          target: contextAssemblyInputFixture.target,
          note: contextAssemblyInputFixture.note,
          outline: contextAssemblyInputFixture.outline,
        };
      },
    },
    localStructure: overrides.localStructure ?? {
      async loadLocalStructure() {
        return contextAssemblyInputFixture.localStructure;
      },
    },
    relatedContext: overrides.relatedContext ?? {
      async loadRelatedContext() {
        return contextAssemblyInputFixture.relatedContext;
      },
    },
    memoryContext: overrides.memoryContext ?? {
      async loadMemoryContext() {
        return contextAssemblyInputFixture.memoryContext;
      },
    },
  };
}
