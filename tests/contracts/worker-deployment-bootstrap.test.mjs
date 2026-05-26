import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createWorkerFetchHandler,
} from '../../apps/worker/src/runtime/http/workerEntrypoint.ts';
import {
  WORKER_DEPLOYMENT_BOOTSTRAP_PATH,
} from '../../apps/worker/src/runtime/http/workerDeploymentBootstrap.ts';

const root = new URL('../../', import.meta.url);

test('deployment bootstrap returns browser mount metadata from runtime identity without creating ports', async () => {
  let createPortsCalled = false;
  const workerFetch = createWorkerFetchHandler({
    createPorts() {
      createPortsCalled = true;
      throw new Error('deployment bootstrap must not create runtime ports');
    },
  });

  const response = await workerFetch(
    new Request(`https://ann.example.test${WORKER_DEPLOYMENT_BOOTSTRAP_PATH}`),
    {
      WORKSPACE_ID: 'workspace_live',
      USER_ID: 'user_live',
      NOTE_ID: 'note_live',
    },
  );

  assert.equal(response.status, 200);
  assert.equal(createPortsCalled, false);
  assert.deepEqual(await response.json(), {
    ok: true,
    apiBaseUrl: 'https://ann.example.test/',
    workspaceId: 'workspace_live',
    userId: 'user_live',
    noteId: 'note_live',
  });
});

test('deployment bootstrap allows note id from URL query for deep links', async () => {
  const workerFetch = createWorkerFetchHandler();

  const response = await workerFetch(
    new Request(`https://ann.example.test${WORKER_DEPLOYMENT_BOOTSTRAP_PATH}?noteId=note_from_url`),
    {
      WORKSPACE_ID: 'workspace_live',
      NOTE_ID: 'note_from_env',
    },
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).noteId, 'note_from_url');
});

test('deployment bootstrap rejects missing note id and non-GET methods before app ports', async () => {
  let createPortsCalled = false;
  const workerFetch = createWorkerFetchHandler({
    createPorts() {
      createPortsCalled = true;
      return {};
    },
  });

  const missingNote = await workerFetch(
    new Request(`https://ann.example.test${WORKER_DEPLOYMENT_BOOTSTRAP_PATH}`),
    { WORKSPACE_ID: 'workspace_live' },
  );
  assert.equal(missingNote.status, 400);
  assert.deepEqual(await missingNote.json(), {
    ok: false,
    errors: ['noteId must be supplied by query or deployment env'],
  });

  const wrongMethod = await workerFetch(
    new Request(`https://ann.example.test${WORKER_DEPLOYMENT_BOOTSTRAP_PATH}`, { method: 'POST' }),
    {
      WORKSPACE_ID: 'workspace_live',
      NOTE_ID: 'note_live',
    },
  );
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(await wrongMethod.json(), {
    ok: false,
    errors: ['deployment bootstrap only supports GET'],
  });
  assert.equal(createPortsCalled, false);
});

test('deployment bootstrap source stays metadata-only and outside product router policy', async () => {
  const source = await readFile(
    new URL('apps/worker/src/runtime/http/workerDeploymentBootstrap.ts', root),
    'utf8',
  );

  assert.match(source, /WORKER_DEPLOYMENT_BOOTSTRAP_PATH/);
  assert.doesNotMatch(source, /createWorkerRuntimePorts|handleWorkerHttpRequest|matchWorkerRoute/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(note-model|scheduler|ai-operations|memory|context-assembly)/);
  assert.doesNotMatch(source, /\b(?:TURSO|AGENT_LOCAL_SQL|NOTE_AGENT|WORKSPACE_BRAIN_AGENT)\b/);
});
