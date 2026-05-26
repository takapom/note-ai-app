import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { registerNoteSurfacePageLeaveOnHide } from '../../apps/web/src/noteSurfaceSessionLifecycle.ts';

test('session lifecycle sends note leave through the API client on first page hide only', async () => {
  const calls = [];
  const lifecycle = createLifecycle();

  const unregister = registerNoteSurfacePageLeaveOnHide({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls),
    workspaceId: 'workspace_001',
    userId: 'user_001',
    noteId: 'note_001',
    lifecycle,
  });

  lifecycle.hide();
  lifecycle.hide();
  await settle();

  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    [
      'POST',
      'https://worker.example.test/api/notes/note_001/leave',
      JSON.stringify({
        cause: 'app_leave',
      }),
    ],
  ]);

  unregister();
  lifecycle.hide();
  await settle();
  assert.equal(calls.length, 1);
});

test('session lifecycle source stays in the browser lifecycle and API client boundary', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceSessionLifecycle.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /registerNoteSurfacePageLeaveOnHide/);
  assert.match(source, /createNoteSurfaceApiClient/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /globalThis\.fetch|window\.fetch|fetch\s*\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
});

function createFetchLike(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 202,
      async json() {
        return { ok: true };
      },
    };
  };
}

function createLifecycle() {
  const listeners = new Set();
  return {
    onPageHide(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hide() {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function settle() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
