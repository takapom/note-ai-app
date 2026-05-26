import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceHttpProductApp } from '../../apps/web/src/noteSurfaceHttpProductApp.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
  noteId: 'note_001',
};

test('HTTP product app loads the snapshot then mounts and dispatches clicks through caller supplied transport', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceHttpProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, {
      document: structuredClone(noteDocumentFixture),
    }),
    root,
    projectionMaps: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
    },
    viewState: {
      workspaceName: 'Research Workspace',
      inlineAiProjectionsVisible: true,
    },
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.equal(root.innerHTML, mounted.html);
  assert.match(root.innerHTML, /Research Workspace/);
  assert.equal(root.listeners.click.length, 1);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
  ]);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 2);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_001/dismiss'],
  ]);
});

test('HTTP product app reports provider invalid id as provider_error before root binding or fetch', async () => {
  const root = createFakeRoot();
  let fetchCalls = 0;
  const app = createNoteSurfaceHttpProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { document: structuredClone(noteDocumentFixture) };
        },
      };
    },
    root,
    workspaceId: 'workspace_001',
    noteId: 'note/001',
  });

  const result = await app.mount();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'provider_error');
  assert.match(result.errors.join('\n'), /noteId must be a single path segment/);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
  assert.equal(fetchCalls, 0);
});

test('HTTP product app passes caller supplied view state and projection maps through ahead of response fields', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceHttpProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, {
      document: structuredClone(noteDocumentFixture),
      viewState: {
        workspaceName: 'Response Workspace',
        expandedDigest: false,
      },
      projectionMaps: {
        activeNoteId: 'note_from_response',
        operationIdByBlockId: {
          block_ai_question_001: 'operation_from_response',
        },
      },
    }),
    root,
    viewState: {
      workspaceName: 'Caller Workspace',
      expandedDigest: true,
      inlineAiProjectionsVisible: true,
    },
    projectionMaps: {
      activeNoteId: 'note_from_caller',
      operationIdByBlockId: {
        block_ai_question_001: 'operation_from_caller',
      },
    },
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.match(root.innerHTML, /Caller Workspace/);
  assert.doesNotMatch(root.innerHTML, /Response Workspace/);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 2);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_from_caller/dismiss'],
  ]);
});

test('HTTP product app source stays a framework-neutral composition boundary', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceHttpProductApp.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceHttpProductApp/);
  assert.match(source, /createNoteSurfaceHttpProductProvider/);
  assert.match(source, /createNoteSurfaceProductApp/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /React|Next|Vite|createRoot|hydrateRoot/);
  assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|fetch\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /authPolicy|providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]|\/digest|\/provenance|\/memory|\/ai-operations/);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /operationId\s*=\s*['"`]|memoryId\s*=\s*['"`]|sourceSpanId\s*=\s*['"`]|noteId\s*=\s*['"`]/);
});

function createFetchLike(calls, snapshotResponse) {
  return async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        if (init.method === 'GET') {
          return snapshotResponse;
        }

        return { handled: true };
      },
    };
  };
}

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
