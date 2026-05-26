import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKSPACE_BRAIN_PROCESS_COMMAND_STORAGE_KEY,
  persistWorkspaceBrainAlarmProcessCommand,
  readWorkspaceBrainAlarmProcessCommand,
  scheduleWorkspaceBrainProcessingAlarm,
  shouldScheduleNextWorkspaceBrainAlarm,
} from '../../apps/worker/src/runtime/cloudflare/cloudflareDurableObjectAlarm.ts';

test('WorkspaceBrain Durable Object alarm persists process command and schedules a near wake-up', async () => {
  const storage = createAlarmStorage();
  const command = {
    workspaceId: 'workspace_001',
    userId: 'user_001',
  };

  const persisted = await persistWorkspaceBrainAlarmProcessCommand({ storage, command });
  const scheduled = await scheduleWorkspaceBrainProcessingAlarm({
    storage,
    now: 1_764_001_000_000,
    delayMs: 500,
  });
  const read = await readWorkspaceBrainAlarmProcessCommand({ storage });

  assert.deepEqual(persisted, { ok: true, command });
  assert.deepEqual(scheduled, { ok: true, scheduledAt: 1_764_001_000_500 });
  assert.deepEqual(read, { ok: true, command });
  assert.deepEqual(storage.calls, [
    ['put', WORKSPACE_BRAIN_PROCESS_COMMAND_STORAGE_KEY, command],
    ['setAlarm', 1_764_001_000_500],
    ['get', WORKSPACE_BRAIN_PROCESS_COMMAND_STORAGE_KEY],
  ]);
});

test('WorkspaceBrain Durable Object alarm rejects invalid command or scheduler storage without volatile details', async () => {
  const persisted = await persistWorkspaceBrainAlarmProcessCommand({
    storage: createAlarmStorage(),
    command: {
      workspaceId: 'workspace_001',
      userId: ' user_001',
    },
  });
  const missingScheduler = await scheduleWorkspaceBrainProcessingAlarm({
    storage: {},
    now: 1_764_001_000_000,
  });
  const throwingStorage = createAlarmStorage({
    setAlarm() {
      throw new Error('workerd secret alarm token failure');
    },
  });
  const thrown = await scheduleWorkspaceBrainProcessingAlarm({
    storage: throwingStorage,
    now: 1_764_001_000_000,
  });

  assert.deepEqual(persisted, {
    ok: false,
    errors: ['userId must be trimmed'],
  });
  assert.deepEqual(missingScheduler, {
    ok: false,
    errors: ['WorkspaceBrain alarm scheduler is not configured'],
  });
  assert.deepEqual(thrown, {
    ok: false,
    errors: ['WorkspaceBrain alarm scheduling failed'],
  });
  assert.doesNotMatch(JSON.stringify(thrown), /workerd|secret|token/i);
});

test('WorkspaceBrain Durable Object alarm reschedules only terminal processed jobs', () => {
  assert.equal(shouldScheduleNextWorkspaceBrainAlarm({ reason: 'completed' }), true);
  assert.equal(shouldScheduleNextWorkspaceBrainAlarm({ reason: 'agent_failed' }), true);
  assert.equal(shouldScheduleNextWorkspaceBrainAlarm({ reason: 'no_queued_job' }), false);
  assert.equal(shouldScheduleNextWorkspaceBrainAlarm({ reason: 'claim_failed' }), false);
  assert.equal(shouldScheduleNextWorkspaceBrainAlarm({ reason: 'completion_failed' }), false);
});

function createAlarmStorage(overrides = {}) {
  const values = new Map();
  const calls = [];
  return {
    calls,
    async put(key, value) {
      calls.push(['put', key, value]);
      values.set(key, value);
    },
    async get(key) {
      calls.push(['get', key]);
      return values.get(key);
    },
    async setAlarm(scheduledAt) {
      calls.push(['setAlarm', scheduledAt]);
    },
    ...overrides,
  };
}
