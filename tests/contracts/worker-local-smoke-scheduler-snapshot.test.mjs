import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocalSmokeSchedulerSnapshotStore,
  localSmokeSchedulerSnapshotStorageKey,
  persistLocalSmokeSchedulerSnapshot,
  readLocalSmokeSchedulerSnapshot,
} from '../../apps/worker/src/runtime/local-verification/localSmokeSchedulerPorts.ts';

test('local smoke scheduler snapshot survives Durable Object instance recreation via storage', async () => {
  const noteId = 'note_local_preview';
  const snapshot = {
    purpose: 'local_verification',
    noteId,
    sections: [
      {
        id: 'section_001',
        noteId,
        headingLevel: 1,
        title: 'MVP scope',
        contentHash: 'hash_section_001',
      },
    ],
  };
  const storage = createMemoryStorage();
  const firstStore = new LocalSmokeSchedulerSnapshotStore();

  assert.deepEqual(firstStore.applySnapshot(snapshot), { ok: true, errors: [] });
  assert.deepEqual(await persistLocalSmokeSchedulerSnapshot({ storage, snapshot }), { ok: true, errors: [] });
  assert.deepEqual(storage.keys(), [localSmokeSchedulerSnapshotStorageKey(noteId)]);

  const secondStore = new LocalSmokeSchedulerSnapshotStore();
  assert.equal(secondStore.hasSnapshot(noteId), false);

  const persisted = await readLocalSmokeSchedulerSnapshot({ storage, noteId });
  assert.equal(persisted.ok, true);
  assert.deepEqual(persisted.snapshot, snapshot);

  assert.deepEqual(secondStore.applySnapshot(persisted.snapshot), { ok: true, errors: [] });
  const ports = secondStore.createNoteStructurePorts(noteId, createUnusedExecutor());
  assert.deepEqual(await ports.noteSnapshot.loadSections({ workspaceId: 'workspace_001', noteId }), snapshot.sections);
});

function createMemoryStorage() {
  const values = new Map();
  return {
    async get(key) {
      return structuredClone(values.get(key));
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
    keys() {
      return [...values.keys()];
    },
  };
}

function createUnusedExecutor() {
  return {
    async execute() {
      throw new Error('executor should not be used by note snapshot loading');
    },
    async query() {
      throw new Error('executor should not be used by note snapshot loading');
    },
  };
}
