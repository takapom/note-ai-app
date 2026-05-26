import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountBrowserNoteSurface } from '../../apps/web/src/browserNoteSurfaceMount.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
  noteId: 'note_001',
};

test('browser note surface mount resolves root and fetch then delegates snapshot and digest mounting', async () => {
  const root = createFakeRoot();
  const calls = [];
  const result = await mountBrowserNoteSurface({
    documentLike: createDocumentLike({
      '#note-surface': root,
    }),
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
        },
      },
      {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            available: true,
            decisions: [
              {
                id: 'digest_decision_001',
                text: 'Keep the browser adapter deployment-only.',
              },
            ],
          },
        },
      },
    ]),
    rootSelector: '#note-surface',
    apiBaseUrl: 'https://worker.example.test/api/',
    viewState: {
      workspaceName: 'Research Workspace',
      expandedDigest: true,
      inlineAiProjectionsVisible: true,
      returnLayerVisible: true,
    },
    projectionMaps: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_from_browser_mount',
      },
    },
    ...metadata,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'mounted');
  assert.equal(root.innerHTML, result.html);
  assert.match(root.innerHTML, /Research Workspace/);
  assert.match(root.innerHTML, /Keep the browser adapter deployment-only\./);
  assert.equal(root.listeners.click.length, 1);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
  ]);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 3);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_from_browser_mount/dismiss'],
  ]);
});

test('browser note surface mount reads deployment metadata from the root dataset', async () => {
  const root = createFakeRoot({
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_from_dataset',
    userId: 'user_from_dataset',
    noteId: 'note_from_dataset',
    workspaceName: 'Dataset Workspace',
    expandedDigest: 'true',
    viewStateJson: JSON.stringify({
      aiStatus: 'saved',
      inlineAiProjectionsVisible: true,
      returnLayerVisible: true,
    }),
    projectionMapsJson: JSON.stringify({
      operationIdByBlockId: {
        block_ai_question_001: 'operation_from_dataset',
      },
    }),
  });
  const calls = [];
  const result = await mountBrowserNoteSurface({
    documentLike: createDocumentLike({
      '#note-surface': root,
    }),
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
        },
      },
      {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            available: true,
            decisions: [
              {
                id: 'digest_decision_001',
                text: 'Dataset digest is visible.',
              },
            ],
          },
        },
      },
    ]),
    rootSelector: '#note-surface',
  });

  assert.equal(result.ok, true);
  assert.equal(root.innerHTML, result.html);
  assert.match(root.innerHTML, /Dataset Workspace/);
  assert.match(root.innerHTML, /Dataset digest is visible\./);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_from_dataset'],
    ['GET', 'https://worker.example.test/api/notes/note_from_dataset/digest'],
  ]);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 3);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_from_dataset'],
    ['GET', 'https://worker.example.test/api/notes/note_from_dataset/digest'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_from_dataset/dismiss'],
  ]);
});

test('browser note surface mount explicit options override root dataset metadata', async () => {
  const root = createFakeRoot({
    apiBaseUrl: 'https://dataset-worker.example.test/api/',
    workspaceId: 'workspace_from_dataset',
    userId: 'user_from_dataset',
    noteId: 'note_from_dataset',
    workspaceName: 'Dataset Workspace',
    expandedDigest: 'true',
    projectionMapsJson: JSON.stringify({
      operationIdByBlockId: {
        block_ai_question_001: 'operation_from_dataset',
      },
    }),
  });
  const calls = [];
  const result = await mountBrowserNoteSurface({
    documentLike: createDocumentLike({
      '#note-surface': root,
    }),
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
        },
      },
      {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            available: true,
            decisions: [
              {
                id: 'digest_decision_001',
                text: 'Explicit digest is visible.',
              },
            ],
          },
        },
      },
    ]),
    rootSelector: '#note-surface',
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_from_options',
    userId: 'user_from_options',
    noteId: 'note_from_options',
    viewState: {
      workspaceName: 'Explicit Workspace',
      inlineAiProjectionsVisible: true,
      returnLayerVisible: true,
    },
    projectionMaps: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_from_options',
      },
    },
  });

  assert.equal(result.ok, true);
  assert.match(root.innerHTML, /Explicit Workspace/);
  assert.doesNotMatch(root.innerHTML, /Dataset Workspace/);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_from_options'],
    ['GET', 'https://worker.example.test/api/notes/note_from_options/digest'],
  ]);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 3);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_from_options'],
    ['GET', 'https://worker.example.test/api/notes/note_from_options/digest'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_from_options/dismiss'],
  ]);
});

test('browser note surface mount rejects invalid dataset JSON before app mount or fetch', async () => {
  const root = createFakeRoot({
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_from_dataset',
    noteId: 'note_from_dataset',
    viewStateJson: '{',
  });
  const calls = [];
  const result = await mountBrowserNoteSurface({
    documentLike: createDocumentLike({
      '#note-surface': root,
    }),
    fetchLike: createFetchLike(calls, []),
    rootSelector: '#note-surface',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_browser_mount');
  assert.match(result.errors.join('\n'), /viewStateJson must be valid JSON/);
  assert.equal(calls.length, 0);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
});

test('browser note surface mount rejects non-object dataset JSON before app mount or fetch', async () => {
  const root = createFakeRoot({
    apiBaseUrl: 'https://worker.example.test/api/',
    workspaceId: 'workspace_from_dataset',
    noteId: 'note_from_dataset',
    projectionMapsJson: '[]',
  });
  const calls = [];
  const result = await mountBrowserNoteSurface({
    documentLike: createDocumentLike({
      '#note-surface': root,
    }),
    fetchLike: createFetchLike(calls, []),
    rootSelector: '#note-surface',
  });

  assert.deepEqual(result, {
    ok: false,
    status: 'invalid_browser_mount',
    errors: ['projectionMapsJson must be a JSON object'],
  });
  assert.equal(calls.length, 0);
  assert.equal(root.innerHTML, '');
  assert.equal(root.addedListeners, 0);
});

test('browser note surface mount rejects a missing root before app mount or fetch', async () => {
  const calls = [];
  const result = await mountBrowserNoteSurface({
    documentLike: createDocumentLike({}),
    fetchLike: createFetchLike(calls, []),
    rootSelector: '#missing-note-surface',
    apiBaseUrl: 'https://worker.example.test/api/',
    ...metadata,
  });

  assert.deepEqual(result, {
    ok: false,
    status: 'invalid_browser_mount',
    errors: ['rootSelector did not match an element: #missing-note-surface'],
  });
  assert.equal(calls.length, 0);
});

test('browser note surface mount rejects missing fetch before app mount', async () => {
  const previousFetch = globalThis.fetch;
  const root = createFakeRoot();
  delete globalThis.fetch;

  try {
    const result = await mountBrowserNoteSurface({
      documentLike: createDocumentLike({
        '#note-surface': root,
      }),
      rootSelector: '#note-surface',
      apiBaseUrl: 'https://worker.example.test/api/',
      ...metadata,
    });

    assert.deepEqual(result, {
      ok: false,
      status: 'invalid_browser_mount',
      errors: ['fetchLike is required when global fetch is unavailable'],
    });
    assert.equal(root.innerHTML, '');
    assert.equal(root.addedListeners, 0);
  } finally {
    if (previousFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = previousFetch;
    }
  }
});

test('browser note surface mount source is the only web surface browser-global adapter', async () => {
  const adapterSource = await readFile(
    new URL('../../apps/web/src/browserNoteSurfaceMount.ts', import.meta.url),
    'utf8',
  );
  const guardedSources = [
    'noteSurfaceHttpDigestProductApp.ts',
    'noteSurfaceHttpDigestProductProvider.ts',
    'noteSurfaceHttpProductApp.ts',
    'noteSurfaceHttpProductProvider.ts',
    'noteSurfaceProductApp.ts',
    'noteSurfaceAppBootstrap.ts',
    'noteSurfaceBrowserRuntime.ts',
  ];

  assert.match(adapterSource, /export async function mountBrowserNoteSurface/);
  assert.match(adapterSource, /createNoteSurfaceHttpDigestProductApp/);
  assert.match(adapterSource, /querySelector/);
  assert.match(adapterSource, /globalThis/);
  assert.doesNotMatch(adapterSource, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(adapterSource, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(adapterSource, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(adapterSource, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(adapterSource, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(adapterSource, /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]|\/digest|\/provenance|\/memory|\/ai-operations/);
  assert.doesNotMatch(adapterSource, /operationId\s*=\s*['"`]|memoryId\s*=\s*['"`]|sourceSpanId\s*=\s*['"`]|noteId\s*=\s*['"`]/);

  for (const filename of guardedSources) {
    const source = await readFile(new URL(`../../apps/web/src/${filename}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|XMLHttpRequest|new Request/i, filename);
  }
});

function createDocumentLike(rootBySelector) {
  return {
    querySelector(selector) {
      return rootBySelector[selector] ?? null;
    },
  };
}

function createFetchLike(calls, responses) {
  return async (url, init) => {
    calls.push({ url, init });

    const response = responses.shift();
    assert.ok(response, `unexpected request: ${init.method} ${url}`);
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      },
    };
  };
}

function createFakeRoot(dataset = {}) {
  return {
    dataset,
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
