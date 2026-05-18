import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runBlockChangedSchedulerFlow,
  runStructureTriggerSchedulerFlow,
} from '../../apps/worker/src/structureSchedulerRuntimeFlow.ts';
import {
  blockChangedInputFixture,
  completedSectionJobFixture,
  dirtyFlagSectionFixture,
  dirtySectionFixture,
  schedulerNow,
  schedulerSectionsFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('BlockChanged persists save/edit/dirty/index output and creates no AI or routing work', async () => {
  const calls = createSideEffectSpies();
  let persisted;

  const result = await runBlockChangedSchedulerFlow({
    ...blockChangedInputFixture,
    ports: {
      blockChangedPersistence: {
        async persistBlockChanged(output) {
          persisted = output;
          return { ok: true, errors: [] };
        },
      },
    },
  });

  assert.equal(result.persistence.attempted, true);
  assert.equal(result.persistence.ok, true);
  assert.equal(persisted.savedBlocks.length, 1);
  assert.equal(persisted.editEvent.type, 'BlockChanged');
  assert.equal(persisted.dirtyScopeMark.targetScope, 'section');
  assert.equal(persisted.lightweightIndexUpdate.blockId, blockChangedInputFixture.blockId);
  assert.deepEqual(result.structureJobs, []);
  assert.deepEqual(result.aiCalls, []);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.errors, []);
  assertSideEffectSpiesUncalled(calls);
});

test('invalid BlockChanged calls no ports and returns contract errors', async () => {
  let persistCount = 0;
  const calls = createSideEffectSpies();

  const result = await runBlockChangedSchedulerFlow({
    blockId: '',
    noteId: ' ',
    sectionId: '',
    contentHash: '',
    previousContentHash: ' ',
    now: Number.NaN,
    ports: {
      blockChangedPersistence: {
        async persistBlockChanged() {
          persistCount += 1;
          return { ok: true, errors: [] };
        },
      },
    },
  });

  assert.equal(persistCount, 0);
  assert.equal(result.persistence.attempted, false);
  assert.deepEqual(result.blockChanged.savedBlocks, []);
  assert.deepEqual(result.errors, [
    'blockId must be a non-empty string',
    'noteId must be a non-empty string',
    'sectionId must be a non-empty string',
    'contentHash must be a non-empty string',
    'previousContentHash must be a non-empty string when provided',
    'now must be a finite number',
  ]);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assertSideEffectSpiesUncalled(calls);
});

test('NoteClosed enqueues dirty-section jobs only and dedupes completed contextHash', async () => {
  const calls = createSideEffectSpies();
  const queue = createQueuePort({
    completedJobs: [completedSectionJobFixture],
  });

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'note_closed',
    now: schedulerNow,
    ports: createStructurePorts({ queue }),
  });

  assert.deepEqual(result.plan.errors, []);
  assert.deepEqual(
    queue.enqueuedJobs.map((job) => [job.targetScope, job.sectionId, job.contextHash]),
    [
      [
        'section',
        dirtyFlagSectionFixture.id,
        `section:${noteFixture.id}:${dirtyFlagSectionFixture.id}:${dirtyFlagSectionFixture.contentHash}`,
      ],
    ],
  );
  assert.equal(result.enqueue.enqueuedCount, 1);
  assert.equal(result.plan.skippedJobs.length, 1);
  assert.equal(result.plan.skippedJobs[0].sectionId, dirtySectionFixture.id);
  assert.equal(result.plan.skippedJobs[0].status, 'deduped');
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assertSideEffectSpiesUncalled(calls);
});

test('ManualOrganize whole-note enqueues one high-priority note job', async () => {
  const calls = createSideEffectSpies();
  const queue = createQueuePort();

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'manual_organize',
    targetScope: 'note',
    now: schedulerNow,
    ports: createStructurePorts({ queue }),
  });

  assert.deepEqual(result.plan.errors, []);
  assert.equal(queue.enqueuedJobs.length, 1);
  assert.equal(queue.enqueuedJobs[0].targetScope, 'note');
  assert.equal(queue.enqueuedJobs[0].wholeNoteReason, 'manual_organize');
  assert.equal(queue.enqueuedJobs[0].priority, 'high');
  assert.equal(result.enqueue.enqueuedCount, 1);
  assert.equal(result.digestPreparation.attempted, false);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assertSideEffectSpiesUncalled(calls);
});

test('NextOpen enqueues recovered dirty jobs and calls digest preparation', async () => {
  const calls = createSideEffectSpies();
  const queue = createQueuePort();
  const digestPreparations = [];

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'next_open',
    now: schedulerNow,
    ports: createStructurePorts({
      queue,
      digest: {
        async prepareDigest(digestPreparation) {
          digestPreparations.push(digestPreparation);
          return { ok: true, errors: [] };
        },
      },
    }),
  });

  assert.deepEqual(result.plan.errors, []);
  assert.deepEqual(
    queue.enqueuedJobs.map((job) => job.sectionId),
    [dirtySectionFixture.id, dirtyFlagSectionFixture.id],
  );
  assert.equal(result.enqueue.enqueuedCount, 2);
  assert.equal(result.digestPreparation.attempted, true);
  assert.deepEqual(digestPreparations, [
    {
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
      triggerReason: 'next_open',
      recoveredJobCount: 2,
      prepared: true,
    },
  ]);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assertSideEffectSpiesUncalled(calls);
});

test('Provider, Operation Router, and audit spies remain uncalled', async () => {
  const calls = createSideEffectSpies();
  const queue = createQueuePort();

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'tab_switched',
    now: schedulerNow,
    ports: createStructurePorts({ queue }),
  });

  assert.equal(result.enqueue.enqueuedCount, 2);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assertSideEffectSpiesUncalled(calls);
});

test('invalid structure trigger input calls no ports and returns contract errors', async () => {
  let loadSectionsCount = 0;
  let completedJobsCount = 0;
  let enqueueCount = 0;
  const calls = createSideEffectSpies();

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: '',
    noteId: ' ',
    triggerReason: 'keystroke',
    now: Number.NaN,
    ports: {
      noteSnapshot: {
        async loadSections() {
          loadSectionsCount += 1;
          return schedulerSectionsFixture;
        },
      },
      structureJobQueue: {
        async listCompletedJobs() {
          completedJobsCount += 1;
          return [];
        },
        async enqueueJobs() {
          enqueueCount += 1;
          return { ok: true, enqueuedCount: 0, errors: [] };
        },
      },
      nextOpenDigestPreparation: createDigestPort(),
    },
  });

  assert.equal(loadSectionsCount, 0);
  assert.equal(completedJobsCount, 0);
  assert.equal(enqueueCount, 0);
  assert.equal(result.enqueue.attempted, false);
  assert.deepEqual(result.plan.jobs, []);
  assert.ok(result.errors.includes('workspaceId must be a non-empty string'));
  assert.ok(result.errors.includes('noteId must be a non-empty string'));
  assert.ok(result.errors.some((error) => error.startsWith('triggerReason must be one of')));
  assert.ok(result.errors.includes('now must be a finite number'));
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assertSideEffectSpiesUncalled(calls);
});

test('structure trigger flow reports snapshot load failure without enqueueing jobs', async () => {
  let enqueueCount = 0;

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'note_closed',
    now: schedulerNow,
    ports: {
      noteSnapshot: {
        async loadSections() {
          throw new Error('snapshot unavailable');
        },
      },
      structureJobQueue: {
        async listCompletedJobs() {
          throw new Error('completed jobs should not be loaded after snapshot failure');
        },
        async enqueueJobs() {
          enqueueCount += 1;
          return { ok: true, enqueuedCount: 0, errors: [] };
        },
      },
      nextOpenDigestPreparation: createDigestPort(),
    },
  });

  assert.equal(enqueueCount, 0);
  assert.equal(result.enqueue.attempted, false);
  assert.deepEqual(result.errors, ['section snapshot load failed: snapshot unavailable']);
  assert.deepEqual(result.plan.jobs, []);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

function createStructurePorts({ queue = createQueuePort(), digest = createDigestPort() } = {}) {
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
      return {
        ok: true,
        enqueuedCount: jobs.length,
        errors: [],
      };
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

function createSideEffectSpies() {
  return {
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
  };
}

function assertSideEffectSpiesUncalled(calls) {
  assert.deepEqual(calls.providerCalls, []);
  assert.deepEqual(calls.operationRoutingCalls, []);
  assert.deepEqual(calls.auditWrites, []);
}
