import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createBrowserNoteSurfaceAppEntry,
  DEFAULT_BROWSER_NOTE_SURFACE_ROOT_SELECTOR,
  startBrowserNoteSurfaceApp,
} from '../../apps/web/src/browserNoteSurfaceAppEntry.ts';

test('browser note surface app entry mounts immediately when the document is already complete', async () => {
  const calls = [];
  const result = await createBrowserNoteSurfaceAppEntry({
    documentReadyState: 'complete',
    addEventListener() {
      throw new Error('complete documents must not wait for DOMContentLoaded');
    },
    mount: createMount(calls, { ok: true, status: 'mounted', html: '<main></main>', events: [] }),
  }).start({
    documentLike: createDocumentLike(),
    fetchLike: createFetchLike(),
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_001',
    noteId: 'note_001',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'mounted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rootSelector, DEFAULT_BROWSER_NOTE_SURFACE_ROOT_SELECTOR);
  assert.equal(calls[0].workspaceId, 'workspace_001');
  assert.equal(calls[0].noteId, 'note_001');
});

test('browser note surface app entry waits for DOMContentLoaded while the document is loading', async () => {
  const calls = [];
  const listeners = [];
  const started = createBrowserNoteSurfaceAppEntry({
    documentReadyState: () => 'loading',
    addEventListener(type, listener, options) {
      listeners.push({ type, listener, options });
    },
    rootSelector: '#deployment-root',
    mount: createMount(calls, { ok: true, status: 'mounted', html: '<main></main>', events: [] }),
  }).start({
    documentLike: createDocumentLike(),
    fetchLike: createFetchLike(),
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_001',
    noteId: 'note_001',
    viewState: {
      workspaceName: 'Deployment Workspace',
    },
    projectionMaps: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
    },
  });

  await settle();
  assert.equal(calls.length, 0);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'DOMContentLoaded');
  assert.deepEqual(listeners[0].options, { once: true });

  listeners[0].listener();
  const result = await started;

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rootSelector, '#deployment-root');
  assert.deepEqual(calls[0].viewState, { workspaceName: 'Deployment Workspace' });
  assert.deepEqual(calls[0].projectionMaps, {
    operationIdByBlockId: {
      block_ai_question_001: 'operation_001',
    },
  });
});

test('browser note surface app entry returns a structured result when mount throws', async () => {
  const result = await startBrowserNoteSurfaceApp(
    {
      documentReadyState: 'interactive',
      mount: async () => {
        throw new Error('mount adapter failed');
      },
    },
    {
      documentLike: createDocumentLike(),
      fetchLike: createFetchLike(),
      apiBaseUrl: 'https://worker.example.test/api/',
      workspaceId: 'workspace_001',
      noteId: 'note_001',
      rootSelector: '#explicit-root',
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'browser_app_entry_mount_failed');
  assert.deepEqual(result.errors, ['mount adapter failed']);
});

test('browser note surface app entry rejects loading runtime without an event listener before mounting', async () => {
  let mounted = false;
  const result = await createBrowserNoteSurfaceAppEntry({
    documentReadyState: 'loading',
    mount: async () => {
      mounted = true;
      return { ok: true, status: 'mounted', html: '<main></main>', events: [] };
    },
  }).start({
    documentLike: createDocumentLike(),
    fetchLike: createFetchLike(),
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_001',
    noteId: 'note_001',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_browser_app_entry_runtime');
  assert.match(result.errors.join('\n'), /addEventListener is required/);
  assert.equal(mounted, false);
});

test('browser note surface app entry source stays deployment-only and import-time inert', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/browserNoteSurfaceAppEntry.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createBrowserNoteSurfaceAppEntry/);
  assert.match(source, /export function startBrowserNoteSurfaceApp/);
  assert.match(source, /\[data-note-surface-root\]/);
  assert.match(source, /mountBrowserNoteSurface/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /operationId\s*=\s*['"`]|memoryId\s*=\s*['"`]|sourceSpanId\s*=\s*['"`]|noteId\s*=\s*['"`]/);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);

  const calls = [];
  await import('../../apps/web/src/browserNoteSurfaceAppEntry.ts');
  assert.deepEqual(calls, []);
});

function createMount(calls, result) {
  return async (options) => {
    calls.push(options);
    return result;
  };
}

function createDocumentLike() {
  return {
    querySelector() {
      throw new Error('documentLike belongs to the mount adapter');
    },
  };
}

function createFetchLike() {
  return async () => {
    throw new Error('fetchLike belongs to the mount adapter');
  };
}

async function settle() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
