import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleWorkerHttpRequest,
} from '../../apps/worker/src/workerHttpRouter.ts';

const now = 1_764_001_000_000;
const baseRequest = {
  workspaceId: 'workspace_001',
  now,
};

test('worker HTTP error response matrix keeps validation failures actionable', async () => {
  const response = await handleWorkerHttpRequest({
    method: 'POST',
    path: '/provenance/source',
    workspaceId: 'workspace_unset',
    now: Number.NaN,
    body: {},
  }, {
    provenanceLookup: {
      async lookupSource() {
        throw new Error('must not reach provenance lookup port');
      },
    },
  });

  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      errors: [
        'workspaceId must be a stable non-sentinel runtime id',
        'now must be a finite number',
      ],
    },
  });
});

test('worker HTTP error response matrix reports missing ports without provider or DB detail', async () => {
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes',
  }, {});

  assert.deepEqual(response, {
    status: 501,
    body: { ok: false, errors: ['note list port is not configured'] },
  });
});

test('worker HTTP error response matrix scrubs volatile persistence detail from port errors', async () => {
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes/note_001/digest',
  }, {
    digestRead: {
      async getDigest() {
        return {
          ok: false,
          errors: ['SQLITE_BUSY: turso database token=secret_001 unavailable'],
        };
      },
    },
  });

  assert.deepEqual(response, {
    status: 400,
    body: { ok: false, errors: ['runtime dependency unavailable'] },
  });
});

test('worker HTTP error response matrix preserves stable runtime not-found style errors', async () => {
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/memory/memory_missing/hold',
  }, {
    memoryReview: {
      async holdMemory() {
        return { ok: false, errors: ['memory memory_missing was not found'] };
      },
    },
  });

  assert.deepEqual(response, {
    status: 400,
    body: { ok: false, errors: ['memory memory_missing was not found'] },
  });
});
