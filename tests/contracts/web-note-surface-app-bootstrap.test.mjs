import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceAppBootstrap } from '../../apps/web/src/noteSurfaceAppBootstrap.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('app bootstrap mounts the note surface and dispatches delegated clicks through resolver controller and transport', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceAppBootstrap({
    document: structuredClone(noteDocumentFixture),
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls),
    ...metadata,
    resolverOptions: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
    },
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.equal(root.innerHTML, mounted.html);
  assert.match(root.innerHTML, /class="ann-app-shell"/);
  assert.match(root.innerHTML, /data-action="adopt" data-target="ai_assist_block"/);
  assert.equal(root.listeners.length, 1);
  assert.equal(mounted.events.some((event) => event.target === 'ai_assist_block' && event.action === 'adopt'), true);

  root.click(createActionElement({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 1);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['POST', 'https://worker.example.test/api/ai-operations/operation_001/accept'],
  ]);
});

test('app bootstrap keeps editor no-op actions out of transport', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceAppBootstrap({
    document: structuredClone(noteDocumentFixture),
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls),
    ...metadata,
    viewOptions: {
      editingBlockIds: ['block_paragraph_001'],
    },
    resolverOptions: {
      operationIdByBlockId: {
        block_paragraph_001: 'operation_should_not_send',
      },
    },
  });

  const mounted = await app.mount();
  assert.equal(mounted.ok, true);

  root.click(createActionElement({
    action: 'edit_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
  }));

  await settle();
  assert.equal(calls.length, 0);
});

test('app bootstrap rejects invalid options before root binding or fetch-like calls', async () => {
  const root = createFakeRoot();
  let fetchCalls = 0;
  const invalidDocument = structuredClone(noteDocumentFixture);
  invalidDocument.note.id = '';

  const app = createNoteSurfaceAppBootstrap({
    document: invalidDocument,
    root,
    apiBaseUrl: 'ftp://worker.example.test/api/',
    fetchLike: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200 };
    },
    workspaceId: 'workspace_unset',
    userId: ' user_001',
  });

  const result = await app.mount();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_options');
  assert.match(result.errors.join('\n'), /note\.id must be a non-empty string/);
  assert.match(result.errors.join('\n'), /apiBaseUrl must use http or https/);
  assert.match(result.errors.join('\n'), /workspaceId must be a stable non-sentinel runtime id/);
  assert.match(result.errors.join('\n'), /userId must be a stable non-sentinel runtime id/);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
  assert.equal(fetchCalls, 0);
});

test('app bootstrap rejects invalid root apiBaseUrl and fetchLike as boundary options', async () => {
  const app = createNoteSurfaceAppBootstrap({
    document: structuredClone(noteDocumentFixture),
    root: {},
    apiBaseUrl: 'not a url',
    fetchLike: undefined,
    workspaceId: 'workspace_001',
  });

  const result = await app.mount();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_options');
  assert.match(result.errors.join('\n'), /root must expose innerHTML/);
  assert.match(result.errors.join('\n'), /root must expose addEventListener/);
  assert.match(result.errors.join('\n'), /root must expose removeEventListener/);
  assert.match(result.errors.join('\n'), /apiBaseUrl must be a valid URL/);
  assert.match(result.errors.join('\n'), /fetchLike must be a function/);
});

test('app bootstrap source stays framework-neutral and avoids forbidden imports and actions', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceAppBootstrap.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceAppBootstrap/);
  assert.match(source, /createNoteSurfaceViewModel/);
  assert.match(source, /createNoteSurfaceApiTransport/);
  assert.match(source, /createNoteSurfaceActionInputResolver/);
  assert.match(source, /createNoteSurfaceEventController/);
  assert.match(source, /createNoteSurfaceDomHost/);
  assert.match(source, /createNoteSurfaceBrowserRuntime/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /globalThis\.fetch|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
});

function createFakeRoot() {
  return {
    innerHTML: '',
    listeners: [],
    addedListeners: 0,
    removedListeners: 0,
    addEventListener(type, listener) {
      assert.equal(type, 'click');
      this.addedListeners += 1;
      this.listeners.push(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, 'click');
      this.removedListeners += 1;
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    },
    click(target) {
      for (const listener of this.listeners) {
        listener({ target });
      }
    },
  };
}

function createActionElement(dataset) {
  const element = {
    dataset,
    closest(selector) {
      assert.equal(selector, '[data-action]');
      return element;
    },
  };
  return element;
}

function createFetchLike(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { handled: true };
      },
    };
  };
}

async function waitFor(predicate) {
  for (let index = 0; index < 10; index += 1) {
    if (predicate()) {
      return;
    }
    await settle();
  }
  assert.equal(predicate(), true);
}

function settle() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
