import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { InMemoryOperationAuditPersistencePort } from '../../apps/worker/src/operationAuditPort.ts';
import { createStaticOperationGenerationProviderRegistry } from '../../apps/worker/src/operationGenerationProviderFlow.ts';
import {
  runStructureJobProcessorFlow,
} from '../../apps/worker/src/structureJobProcessorFlow.ts';
import { InMemoryStructureJobWorkQueue } from '../../apps/worker/src/structureJobWorkQueuePort.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import {
  completedSectionJobFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_000_500_000;

test('structure job processor no-ops when no queued job is claimed', async () => {
  const calls = {
    claim: 0,
    complete: 0,
    fail: 0,
    downstream: 0,
  };
  const workQueue = {
    async claimNextQueuedJob(input) {
      calls.claim += 1;
      assert.deepEqual(input, {
        workspaceId: noteFixture.workspaceId,
        claimedAt: now,
      });
      return { ok: true, errors: [] };
    },
    async markJobCompleted() {
      calls.complete += 1;
      return { ok: true, errors: [] };
    },
    async markJobFailed() {
      calls.fail += 1;
      return { ok: true, errors: [] };
    },
  };

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue,
    contextAssemblyPorts: createThrowingContextAssemblyPorts(calls),
    providerRegistry: createThrowingProviderRegistry(calls),
    operationFlow: createThrowingOperationFlow(calls),
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempted, false);
  assert.equal(result.reason, 'no_queued_job');
  assert.equal(calls.claim, 1);
  assert.equal(calls.complete, 0);
  assert.equal(calls.fail, 0);
  assert.equal(calls.downstream, 0);
  assert.equal(result.agent, undefined);
  assert.equal(result.completion, undefined);
  assert.equal(result.failure, undefined);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job processor stops on claim failure without downstream work', async () => {
  const calls = {
    claim: 0,
    complete: 0,
    fail: 0,
    downstream: 0,
  };
  const workQueue = {
    async claimNextQueuedJob(input) {
      calls.claim += 1;
      assert.deepEqual(input, {
        workspaceId: noteFixture.workspaceId,
        claimedAt: now,
      });
      return { ok: false, errors: ['agent local queue unavailable'] };
    },
    async markJobCompleted() {
      calls.complete += 1;
      return { ok: true, errors: [] };
    },
    async markJobFailed() {
      calls.fail += 1;
      return { ok: true, errors: [] };
    },
  };

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue,
    contextAssemblyPorts: createThrowingContextAssemblyPorts(calls),
    providerRegistry: createThrowingProviderRegistry(calls),
    operationFlow: createThrowingOperationFlow(calls),
  });

  assert.equal(result.ok, false);
  assert.equal(result.attempted, false);
  assert.equal(result.reason, 'claim_failed');
  assert.equal(calls.claim, 1);
  assert.equal(calls.complete, 0);
  assert.equal(calls.fail, 0);
  assert.equal(calls.downstream, 0);
  assert.deepEqual(result.errors, ['agent local queue unavailable']);
  assert.equal(result.agent, undefined);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job processor completes claimed jobs after successful agent orchestration', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_processor_success' }),
  ]);
  const auditPersistence = new InMemoryOperationAuditPersistencePort();

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue: queue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: [validOperationFixtures[0], validOperationFixtures[2]] };
      },
    }),
    operationFlow: createOperationFlow(auditPersistence),
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'completed');
  assert.equal(result.claim.job.id, 'structure_job_processor_success');
  assert.equal(result.agent.orchestration.generationFlow.completedStructureJobResponse.structureJob.completedAt, now);
  assert.equal(result.completion.job.completedAt, now);
  assert.equal(result.failure, undefined);
  assert.deepEqual(queue.list().map((job) => [job.id, job.status, job.completedAt]), [
    ['structure_job_processor_success', 'completed', now],
  ]);
  assert.deepEqual(result.providerCalls, [{
    providerId: 'mock_structure_provider',
    structureJobId: 'structure_job_processor_success',
  }]);
  assert.deepEqual(result.operationRoutingCalls, [{ structureJobId: 'structure_job_processor_success' }]);
  assert.deepEqual(result.auditWrites, [{ structureJobId: 'structure_job_processor_success', savedCount: 2 }]);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.deepEqual(
    auditPersistence.list().map((record) => record.structureJobId),
    ['structure_job_processor_success', 'structure_job_processor_success'],
  );
});

test('structure job processor reports terminal completion failure without failing a second terminal transition', async () => {
  const workQueue = createTerminalFailingWorkQueue({
    claimJob: runningJob({ id: 'structure_job_processor_completion_stale' }),
    completionErrors: ['structure job completion update failed: no rows affected'],
  });

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: createOperationFlow(new InMemoryOperationAuditPersistencePort()),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'completion_failed');
  assert.deepEqual(result.completion.errors, ['structure job completion update failed: no rows affected']);
  assert.equal(result.failure, undefined);
  assert.equal(workQueue.completedInputs.length, 1);
  assert.equal(workQueue.failedInputs.length, 0);
  assert.deepEqual(result.providerCalls, [{
    providerId: 'mock_structure_provider',
    structureJobId: 'structure_job_processor_completion_stale',
  }]);
  assert.deepEqual(result.operationRoutingCalls, [{ structureJobId: 'structure_job_processor_completion_stale' }]);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job processor marks context assembly failure as failed job without provider, routing, or audit', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_processor_context_failure' }),
  ]);
  let providerCalls = 0;
  let auditCalls = 0;

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue: queue,
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
    operationFlow: createOperationFlow({
      async save(record) {
        auditCalls += 1;
        return { ok: true, errors: [], record };
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'agent_failed');
  assert.equal(result.agent.ok, false);
  assert.equal(result.agent.orchestration, undefined);
  assert.equal(result.failure.job.status, 'failed');
  assert.equal(result.failure.job.failureMessage, 'target context snapshot failed: target unavailable');
  assert.deepEqual(queue.list().map((job) => [job.id, job.status]), [
    ['structure_job_processor_context_failure', 'failed'],
  ]);
  assert.equal(providerCalls, 0);
  assert.equal(auditCalls, 0);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('structure job processor reports failed terminal mark failure without retrying downstream work', async () => {
  const workQueue = createTerminalFailingWorkQueue({
    claimJob: runningJob({ id: 'structure_job_processor_failure_stale' }),
    failureErrors: ['structure job failure update failed: no rows affected'],
  });
  let providerCalls = 0;
  let auditCalls = 0;

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
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
    operationFlow: createOperationFlow({
      async save(record) {
        auditCalls += 1;
        return { ok: true, errors: [], record };
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'failure_mark_failed');
  assert.deepEqual(result.errors, [
    'target context snapshot failed: target unavailable',
    'structure job failure update failed: no rows affected',
  ]);
  assert.equal(workQueue.completedInputs.length, 0);
  assert.equal(workQueue.failedInputs.length, 1);
  assert.equal(providerCalls, 0);
  assert.equal(auditCalls, 0);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job processor marks provider failure as failed job', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_processor_provider_failure' }),
  ]);
  let auditCalls = 0;

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue: queue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        throw new Error('model timeout');
      },
    }),
    operationFlow: createOperationFlow({
      async save(record) {
        auditCalls += 1;
        return { ok: true, errors: [], record };
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'agent_failed');
  assert.equal(result.agent.orchestration.reason, 'provider_failed');
  assert.equal(result.failure.job.status, 'failed');
  assert.equal(result.failure.job.failureMessage, 'operation generation provider failed: model timeout');
  assert.deepEqual(result.providerCalls, [{
    providerId: 'mock_structure_provider',
    structureJobId: 'structure_job_processor_provider_failure',
  }]);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.equal(auditCalls, 0);
});

test('structure job processor rejects non-running claimed jobs before the Agent handler', async () => {
  const calls = {
    downstream: 0,
  };
  const workQueue = createMisclaimingWorkQueue({
    ...queuedJob({ id: 'structure_job_processor_invalid_generation' }),
    status: 'completed',
    completedAt: now + 100,
  });

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue,
    contextAssemblyPorts: createThrowingContextAssemblyPorts(calls),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'must_not_be_called',
      async generateOperations() {
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: createOperationFlow(new InMemoryOperationAuditPersistencePort()),
  });

  assert.equal(result.ok, false);
  assert.equal(result.attempted, false);
  assert.equal(result.reason, 'invalid_claimed_job');
  assert.equal(result.agent, undefined);
  assert.deepEqual(result.errors, ['claimed structure job must be running']);
  assert.equal(calls.downstream, 0);
  assert.equal(workQueue.failedInputs.length, 0);
  assert.equal(workQueue.completedInputs.length, 0);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('structure job processor preserves downstream routing failure while marking the job failed', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_processor_routing_failure' }),
  ]);

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue: queue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: { freeform: 'not an operation list' } };
      },
    }),
    operationFlow: createOperationFlow(new InMemoryOperationAuditPersistencePort()),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'agent_failed');
  assert.equal(result.agent.orchestration.reason, 'routed');
  assert.equal(result.agent.orchestration.generationFlow.ok, true);
  assert.deepEqual(result.agent.orchestration.generationFlow.completedStructureJobResponse.aiResponse, {
    freeform: 'not an operation list',
  });
  assert.deepEqual(result.agent.orchestration.structureJobOperationFlow.routingFlow.routing.errors, [
    'AI response must be an operation list',
  ]);
  assert.equal(result.failure.job.status, 'failed');
  assert.deepEqual(result.providerCalls, [{
    providerId: 'mock_structure_provider',
    structureJobId: 'structure_job_processor_routing_failure',
  }]);
  assert.deepEqual(result.operationRoutingCalls, [{ structureJobId: 'structure_job_processor_routing_failure' }]);
  assert.deepEqual(result.auditWrites, []);
});

test('structure job processor preserves downstream audit failure while marking the job failed', async () => {
  const queue = new InMemoryStructureJobWorkQueue([
    queuedJob({ id: 'structure_job_processor_audit_failure' }),
  ]);

  const result = await runStructureJobProcessorFlow({
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    workQueue: queue,
    contextAssemblyPorts: createContextAssemblyPorts(),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        return { operations: [validOperationFixtures[0]] };
      },
    }),
    operationFlow: createOperationFlow({
      async save() {
        throw new Error('audit store unavailable');
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'agent_failed');
  assert.equal(result.agent.orchestration.reason, 'routed');
  assert.equal(result.agent.orchestration.structureJobOperationFlow.routingFlow.routing.ok, true);
  assert.equal(result.agent.orchestration.structureJobOperationFlow.routingFlow.auditPersistence.ok, false);
  assert.deepEqual(result.agent.orchestration.errors, [
    'audit operation_structure_job_processor_audit_failure_0: audit persistence unavailable',
  ]);
  assert.equal(result.failure.job.status, 'failed');
  assert.equal(
    result.failure.job.failureMessage,
    'audit operation_structure_job_processor_audit_failure_0: audit persistence unavailable',
  );
  assert.deepEqual(result.operationRoutingCalls, [{ structureJobId: 'structure_job_processor_audit_failure' }]);
  assert.deepEqual(result.auditWrites, [{ structureJobId: 'structure_job_processor_audit_failure', savedCount: 0 }]);
});

test('structure job processor source only delegates through runtime ports and flows', async () => {
  const source = await readFile(new URL('apps/worker/src/structureJobProcessorFlow.ts', root), 'utf8');

  assert.match(source, /claimNextQueuedJob/);
  assert.match(source, /runStructureJobAgentHandler/);
  assert.match(source, /markJobCompleted/);
  assert.match(source, /markJobFailed/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|routeGeneratedOperations|auditPersistence\.save|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
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
    id: 'structure_job_processor_queued',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    sectionId: 'section_001',
    status: 'queued',
    createdAt: now - 1_000,
    ...overrides,
  };
}

function runningJob(overrides = {}) {
  return {
    ...queuedJob(),
    id: 'structure_job_processor_running',
    status: 'running',
    startedAt: now,
    ...overrides,
  };
}

function createOperationFlow(auditPersistence) {
  return {
    snapshot: operationRouterSnapshotFixture,
    auditPersistence,
    now: now + 100,
    generatedBy: 'worker_runtime',
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

function createThrowingContextAssemblyPorts(calls) {
  return createContextAssemblyPorts({
    targetSnapshot: {
      async loadTargetContext() {
        calls.downstream += 1;
        throw new Error('must not assemble context');
      },
    },
  });
}

function createThrowingProviderRegistry(calls) {
  return {
    resolveProvider() {
      calls.downstream += 1;
      throw new Error('must not resolve provider');
    },
  };
}

function createThrowingOperationFlow(calls) {
  return createOperationFlow({
    async save(record) {
      calls.downstream += 1;
      return { ok: true, errors: [], record };
    },
  });
}

function createMisclaimingWorkQueue(job) {
  const failedInputs = [];
  const completedInputs = [];
  return {
    failedInputs,
    completedInputs,
    async claimNextQueuedJob(input) {
      assert.deepEqual(input, {
        workspaceId: noteFixture.workspaceId,
        claimedAt: now,
      });
      return {
        ok: true,
        errors: [],
        job: {
          ...job,
          startedAt: now,
        },
      };
    },
    async markJobCompleted(input) {
      completedInputs.push(input);
      return { ok: true, errors: [], job: { ...job, status: 'completed', completedAt: input.completedAt } };
    },
    async markJobFailed(input) {
      failedInputs.push(input);
      return {
        ok: true,
        errors: [],
        job: {
          ...job,
          status: 'failed',
          startedAt: now,
          failedAt: input.failedAt,
          failureMessage: input.failureMessage,
        },
      };
    },
  };
}

function createTerminalFailingWorkQueue({ claimJob, completionErrors = [], failureErrors = [] }) {
  const completedInputs = [];
  const failedInputs = [];

  return {
    completedInputs,
    failedInputs,
    async claimNextQueuedJob(input) {
      assert.deepEqual(input, {
        workspaceId: noteFixture.workspaceId,
        claimedAt: now,
      });
      return {
        ok: true,
        errors: [],
        job: {
          ...claimJob,
          startedAt: now,
        },
      };
    },
    async markJobCompleted(input) {
      completedInputs.push(input);
      if (completionErrors.length > 0) {
        return { ok: false, errors: completionErrors };
      }

      return {
        ok: true,
        errors: [],
        job: { ...claimJob, status: 'completed', completedAt: input.completedAt },
      };
    },
    async markJobFailed(input) {
      failedInputs.push(input);
      if (failureErrors.length > 0) {
        return { ok: false, errors: failureErrors };
      }

      return {
        ok: true,
        errors: [],
        job: {
          ...claimJob,
          status: 'failed',
          failedAt: input.failedAt,
          failureMessage: input.failureMessage,
        },
      };
    },
  };
}
