import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { InMemoryOperationAuditPersistencePort } from '../../apps/worker/src/operationAuditPort.ts';
import { createStaticOperationGenerationProviderRegistry } from '../../apps/worker/src/operationGenerationProviderFlow.ts';
import {
  runNoteStructureRouteHandler,
  runStructureJobAgentHandler,
} from '../../apps/worker/src/noteStructureRuntimeHandlers.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import {
  completedSectionJobFixture,
  dirtyFlagSectionFixture,
  dirtySectionFixture,
  schedulerNow,
  schedulerSectionsFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const now = 1_764_000_400_000;

test('note leave route handler schedules jobs and does not call provider, routing, or audit', async () => {
  const queue = createQueuePort({
    completedJobs: [completedSectionJobFixture],
  });

  const result = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'note_leave',
    now,
    ports: createSchedulerPorts({ queue }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.triggerReason, 'note_closed');
  assert.deepEqual(
    result.scheduledJobs.map((job) => [job.triggerReason, job.targetScope, job.sectionId, job.status]),
    [['note_closed', 'section', dirtyFlagSectionFixture.id, 'queued']],
  );
  assert.equal(queue.enqueuedJobs.length, 1);
  assert.deepEqual(result.agentDispatches, []);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('note leave route handler preserves explicit close, tab switch, and app leave causes', async () => {
  for (const [cause, triggerReason] of [
    ['note_close', 'note_closed'],
    ['tab_switch', 'tab_switched'],
    ['app_leave', 'app_left'],
  ]) {
    const queue = createQueuePort();

    const result = await runNoteStructureRouteHandler({
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
      route: 'note_leave',
      cause,
      now,
      ports: createSchedulerPorts({ queue }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.triggerReason, triggerReason);
    assert.equal(queue.enqueuedJobs.length, 2);
    assert.deepEqual(
      queue.enqueuedJobs.map((job) => [job.triggerReason, job.sectionId, job.status]),
      [
        [triggerReason, dirtySectionFixture.id, 'queued'],
        [triggerReason, dirtyFlagSectionFixture.id, 'queued'],
      ],
    );
    assert.deepEqual(
      result.scheduledJobs.map((job) => job.triggerReason),
      [triggerReason, triggerReason],
    );
    assert.deepEqual(result.providerCalls, []);
    assert.deepEqual(result.operationRoutingCalls, []);
    assert.deepEqual(result.auditWrites, []);
  }
});

test('manual organize route handler maps to whole-note scheduler intent', async () => {
  const queue = createQueuePort();

  const result = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'manual_organize',
    now,
    ports: createSchedulerPorts({ queue }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.triggerReason, 'manual_organize');
  assert.equal(result.scheduledJobs.length, 1);
  assert.equal(result.scheduledJobs[0].targetScope, 'note');
  assert.equal(result.scheduledJobs[0].wholeNoteReason, 'manual_organize');
  assert.equal(result.scheduledJobs[0].priority, 'high');
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('next open route handler schedules recovery jobs and digest preparation only', async () => {
  const queue = createQueuePort();
  const digestPreparations = [];

  const result = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'next_open',
    now,
    ports: createSchedulerPorts({
      queue,
      digest: {
        async prepareDigest(digestPreparation) {
          digestPreparations.push(digestPreparation);
          return { ok: true, errors: [] };
        },
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.triggerReason, 'next_open');
  assert.deepEqual(
    result.scheduledJobs.map((job) => job.sectionId),
    [dirtySectionFixture.id, dirtyFlagSectionFixture.id],
  );
  assert.deepEqual(digestPreparations, [{
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'next_open',
    recoveredJobCount: 2,
    prepared: true,
  }]);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('invalid note leave cause stops before scheduler ports and downstream work', async () => {
  let loadSectionsCount = 0;
  let enqueueCount = 0;

  const result = await runNoteStructureRouteHandler({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    route: 'note_leave',
    cause: 'keystroke',
    now,
    ports: createSchedulerPorts({
      noteSnapshot: {
        async loadSections() {
          loadSectionsCount += 1;
          return schedulerSectionsFixture;
        },
      },
      queue: {
        enqueuedJobs: [],
        async listCompletedJobs() {
          return [];
        },
        async enqueueJobs(jobs) {
          enqueueCount += 1;
          return { ok: true, enqueuedCount: jobs.length, errors: [] };
        },
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(loadSectionsCount, 0);
  assert.equal(enqueueCount, 0);
  assert.deepEqual(result.scheduledJobs, []);
  assert.deepEqual(result.errors, [
    'note_leave cause must be one of note_close, tab_switch, app_leave, note_closed, tab_switched, app_left',
  ]);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('invalid route input stops before scheduler ports and downstream work', async () => {
  let loadSectionsCount = 0;
  let enqueueCount = 0;

  const result = await runNoteStructureRouteHandler({
    workspaceId: '',
    noteId: ' ',
    route: 'note_leave',
    now: Number.NaN,
    ports: createSchedulerPorts({
      noteSnapshot: {
        async loadSections() {
          loadSectionsCount += 1;
          return schedulerSectionsFixture;
        },
      },
      queue: {
        enqueuedJobs: [],
        async listCompletedJobs() {
          return [];
        },
        async enqueueJobs(jobs) {
          enqueueCount += 1;
          return { ok: true, enqueuedCount: jobs.length, errors: [] };
        },
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(loadSectionsCount, 0);
  assert.equal(enqueueCount, 0);
  assert.deepEqual(result.scheduledJobs, []);
  assert.ok(result.errors.includes('workspaceId must be a non-empty string'));
  assert.ok(result.errors.includes('noteId must be a non-empty string'));
  assert.ok(result.errors.includes('now must be a finite number'));
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('structure job Agent handler assembles context before provider generation, routing, and audit', async () => {
  const calls = [];
  const auditPersistence = new InMemoryOperationAuditPersistencePort();
  const providerOperations = [validOperationFixtures[0], validOperationFixtures[2]];
  const structureJob = runningSectionJob();

  const result = await runStructureJobAgentHandler({
    userId: 'user_001',
    structureJob,
    contextAssemblyPorts: createContextAssemblyPorts({ calls }),
    providerRegistry: createStaticOperationGenerationProviderRegistry({
      id: 'mock_structure_provider',
      async generateOperations() {
        calls.push('provider');
        return { operations: providerOperations };
      },
    }),
    operationFlow: {
      snapshot: operationRouterSnapshotFixture,
      auditPersistence: {
        async save(record) {
          calls.push('audit');
          return auditPersistence.save(record);
        },
      },
      now: now + 100,
      generatedBy: 'worker_runtime',
    },
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.contextAssembly.event.type, 'ContextEnvelopeBuilt');
  assert.deepEqual(calls, ['target', 'local', 'related', 'memory', 'provider', 'audit', 'audit']);
  assert.deepEqual(result.providerCalls, [{ providerId: 'mock_structure_provider', structureJobId: structureJob.id }]);
  assert.deepEqual(result.operationRoutingCalls, [{ structureJobId: structureJob.id }]);
  assert.deepEqual(result.auditWrites, [{ structureJobId: structureJob.id, savedCount: 2 }]);
  assert.deepEqual(
    auditPersistence.list().map((record) => record.structureJobId),
    [structureJob.id, structureJob.id],
  );
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
});

test('structure job Agent handler stops before provider when context assembly fails', async () => {
  let providerCalls = 0;
  let auditCalls = 0;

  const result = await runStructureJobAgentHandler({
    userId: 'user_001',
    structureJob: runningSectionJob(),
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
      auditPersistence: {
        async save(record) {
          auditCalls += 1;
          return { ok: true, errors: [], record };
        },
      },
      now: now + 100,
    },
    now,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['target context snapshot failed: target unavailable']);
  assert.equal(result.orchestration, undefined);
  assert.equal(providerCalls, 0);
  assert.equal(auditCalls, 0);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('note structure runtime handlers stay thin and avoid direct policy/import shortcuts', async () => {
  const source = await readFile(
    new URL('../../apps/worker/src/noteStructureRuntimeHandlers.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /runStructureTriggerSchedulerFlow/);
  assert.match(source, /runContextEnvelopeAssemblyFlow/);
  assert.match(source, /runStructureJobOperationOrchestrationFlow/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAuditPort\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /\bclassifyOperationPolicy\b|\bvalidateStructureOperation\b|auditPersistence\.save\s*\(/i);
  assert.doesNotMatch(source, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
});

function runningSectionJob() {
  return {
    ...completedSectionJobFixture,
    id: 'structure_job_agent_001',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    sectionId: 'section_001',
    targetScope: 'section',
    status: 'running',
    startedAt: now - 500,
    completedAt: undefined,
  };
}

function createSchedulerPorts({
  noteSnapshot,
  queue = createQueuePort(),
  digest = createDigestPort(),
} = {}) {
  return {
    noteSnapshot: noteSnapshot ?? {
      async loadSections(input) {
        assert.deepEqual(input, {
          workspaceId: noteFixture.workspaceId,
          noteId: noteFixture.id,
        });
        return schedulerSectionsFixture;
      },
    },
    structureJobQueue: queue,
    nextOpenDigestPreparation: digest,
  };
}

function createQueuePort({ completedJobs = [] } = {}) {
  const port = {
    enqueuedJobs: [],
    async listCompletedJobs(input) {
      assert.deepEqual(input, {
        workspaceId: noteFixture.workspaceId,
        noteId: noteFixture.id,
      });
      return completedJobs;
    },
    async enqueueJobs(jobs) {
      port.enqueuedJobs.push(...jobs);
      return { ok: true, enqueuedCount: jobs.length, errors: [] };
    },
  };
  return port;
}

function createDigestPort() {
  return {
    async prepareDigest() {
      return { ok: true, errors: [] };
    },
  };
}

function createContextAssemblyPorts(overrides = {}) {
  const calls = overrides.calls ?? [];
  return {
    targetSnapshot: overrides.targetSnapshot ?? {
      async loadTargetContext(input) {
        calls.push('target');
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
        calls.push('local');
        return contextAssemblyInputFixture.localStructure;
      },
    },
    relatedContext: overrides.relatedContext ?? {
      async loadRelatedContext() {
        calls.push('related');
        return contextAssemblyInputFixture.relatedContext;
      },
    },
    memoryContext: overrides.memoryContext ?? {
      async loadMemoryContext() {
        calls.push('memory');
        return contextAssemblyInputFixture.memoryContext;
      },
    },
  };
}
