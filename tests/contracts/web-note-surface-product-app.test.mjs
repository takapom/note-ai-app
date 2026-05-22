import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceProductApp } from '../../apps/web/src/noteSurfaceProductApp.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('product app loads provider snapshot then mounts and dispatches clicks through transport', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceProductApp({
    productProvider: {
      async loadInitialState() {
        return {
          document: structuredClone(noteDocumentFixture),
          viewState: {
            workspaceName: 'Research Workspace',
          },
          projectionMaps: {
            operationIdByBlockId: {
              block_ai_question_001: 'operation_001',
            },
          },
        };
      },
    },
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls),
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.equal(root.innerHTML, mounted.html);
  assert.match(root.innerHTML, /Research Workspace/);
  assert.match(root.innerHTML, /data-action="delete" data-target="ai_assist_block"/);
  assert.equal(root.listeners.click.length, 1);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 1);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['POST', 'https://worker.example.test/api/ai-operations/operation_001/dismiss'],
  ]);
});

test('product app rejects invalid provider document before bootstrap root binding or fetch', async () => {
  const root = createFakeRoot();
  let fetchCalls = 0;
  const invalidDocument = structuredClone(noteDocumentFixture);
  invalidDocument.note.id = '';

  const app = createNoteSurfaceProductApp({
    productProvider: {
      loadInitialState() {
        return {
          document: invalidDocument,
          projectionMaps: {
            operationIdByBlockId: {
              block_ai_question_001: 'operation_001',
            },
          },
        };
      },
    },
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200 };
    },
    ...metadata,
  });

  const result = await app.mount();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_product_state');
  assert.match(result.errors.join('\n'), /note\.id must be a non-empty string/);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
  assert.equal(fetchCalls, 0);
});

test('product app closes provider failure before bootstrap root binding or fetch', async () => {
  const root = createFakeRoot();
  let fetchCalls = 0;
  const app = createNoteSurfaceProductApp({
    productProvider: {
      async loadInitialState() {
        throw new Error('initial snapshot unavailable');
      },
    },
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200 };
    },
    ...metadata,
  });

  const result = await app.mount();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'provider_error');
  assert.deepEqual(result.errors, ['initial snapshot unavailable']);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
  assert.equal(fetchCalls, 0);
});

test('product app preserves bootstrap invalid options without hiding runtime boundary errors', async () => {
  const root = createFakeRoot();
  let fetchCalls = 0;
  const app = createNoteSurfaceProductApp({
    productProvider: {
      loadInitialState() {
        return {
          document: structuredClone(noteDocumentFixture),
          projectionMaps: {
            operationIdByBlockId: {
              block_ai_question_001: 'operation_001',
            },
          },
        };
      },
    },
    root,
    apiBaseUrl: 'not a url',
    fetchLike: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200 };
    },
    workspaceId: 'workspace_unset',
  });

  const result = await app.mount();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_options');
  assert.match(result.errors.join('\n'), /apiBaseUrl must be a valid URL/);
  assert.match(result.errors.join('\n'), /workspaceId must be a stable non-sentinel runtime id/);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
  assert.equal(fetchCalls, 0);
});

test('product app source stays a framework-neutral mount boundary without forbidden imports ambient APIs or id generation', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceProductApp.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceProductApp/);
  assert.match(source, /createNoteSurfaceProductState/);
  assert.match(source, /createNoteSurfaceAppBootstrap/);
  assert.match(source, /loadInitialState/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /React|Next|Vite|createRoot|hydrateRoot/);
  assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|fetch\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction|authPolicy/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /operationId\s*=\s*['"`]|memoryId\s*=\s*['"`]|sourceSpanId\s*=\s*['"`]|noteId\s*=\s*['"`]/);
});

function createFakeRoot() {
  return {
    innerHTML: '',
    listeners: {
      click: [],
      compositionstart: [],
      compositionend: [],
      input: [],
    },
    addedListeners: 0,
    removedListeners: 0,
    addEventListener(type, listener) {
      this.addedListeners += 1;
      this.listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      this.removedListeners += 1;
      this.listeners[type] = this.listeners[type].filter((entry) => entry !== listener);
    },
    click(target) {
      for (const listener of this.listeners.click) {
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
