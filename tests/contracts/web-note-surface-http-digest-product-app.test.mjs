import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceHttpDigestProductApp } from '../../apps/web/src/noteSurfaceHttpDigestProductApp.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
  noteId: 'note_001',
};

const noteListResponse = {
  ok: true,
  status: 200,
  body: {
    ok: true,
    notes: [{
      noteId: noteDocumentFixture.note.id,
      title: noteDocumentFixture.note.title,
      descriptionEffective: noteDocumentFixture.note.descriptionEffective,
      createdAt: noteDocumentFixture.note.createdAt,
      updatedAt: noteDocumentFixture.note.updatedAt,
    }],
  },
};

test('HTTP digest product app loads snapshot then digest, mounts digest HTML, and dispatches clicks through caller projection maps', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceHttpDigestProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
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
            unresolvedQuestions: [
              {
                id: 'digest_question_001',
                text: 'Clarify the migration stop condition.',
                sourceBlockId: 'block_paragraph_001',
              },
            ],
            decisions: [
              {
                id: 'digest_decision_001',
                text: 'Keep digest as a read projection.',
              },
            ],
          },
        },
      },
    ]),
    root,
    viewState: {
      workspaceName: 'Research Workspace',
      expandedDigest: true,
      inlineAiProjectionsVisible: true,
      returnLayerVisible: true,
    },
    projectionMaps: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_from_caller',
      },
    },
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.equal(root.innerHTML, mounted.html);
  assert.match(root.innerHTML, /Research Workspace/);
  assert.match(root.innerHTML, /Clarify the migration stop condition\./);
  assert.match(root.innerHTML, /Keep digest as a read projection\./);
  assert.equal(root.listeners.click.length, 1);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
  ]);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 4);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_from_caller/dismiss'],
  ]);
});

test('HTTP digest product app skips digest GET when caller supplies next open digest', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceHttpDigestProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
        },
      },
    ]),
    root,
    viewState: {
      expandedDigest: true,
      returnLayerVisible: true,
      nextOpenDigest: {
        available: true,
        decisions: [
          {
            id: 'caller_digest_decision_001',
            text: 'Use the caller supplied digest.',
          },
        ],
      },
    },
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.match(root.innerHTML, /Use the caller supplied digest\./);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes'],
  ]);
});

test('HTTP digest product app still mounts when digest projection is unavailable', async () => {
  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceHttpDigestProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
        },
      },
      {
        ok: false,
        status: 503,
        body: {
          errors: ['digest projection unavailable'],
        },
      },
    ]),
    root,
    viewState: {
      expandedDigest: true,
      returnLayerVisible: true,
    },
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.match(root.innerHTML, /data-component="next-open-digest" data-available="false"/);
  assert.match(root.innerHTML, /ann-writing-chrome__digest-status/);
  assert.match(root.innerHTML, /整理の取得に失敗しました/);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
  ]);
});

test('HTTP digest product app registers page leave against the current runtime note', async () => {
  const root = createFakeRoot();
  const calls = [];
  const lifecycle = createLifecycle();
  const app = createNoteSurfaceHttpDigestProductApp({
    apiBaseUrl: 'https://worker.example.test/api/',
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
        body: { available: false },
      },
      {
        ok: true,
        status: 200,
        body: {
          document: createReopenedDocument(),
        },
      },
      {
        ok: true,
        status: 200,
        body: { available: false },
      },
    ]),
    root,
    pageLifecycle: lifecycle,
    viewState: {
      recentThoughts: [
        {
          id: 'note_001',
          title: 'Current note',
          updatedLabel: '2025-11-24 更新',
          active: true,
        },
        {
          id: 'note_002',
          title: 'Reopened note',
          updatedLabel: '2025-11-25 更新',
          active: false,
        },
      ],
    },
    ...metadata,
  });

  const mounted = await app.mount();
  assert.equal(mounted.ok, true);

  root.click(createActionElement({
    action: 'open_recent_thought',
    target: 'thin_rail',
    noteId: 'note_002',
  }));
  await waitFor(() => calls.length === 6);

  lifecycle.hide();
  await waitFor(() => calls.length === 7);

  const leaveCalls = calls.filter((call) => call.url.endsWith('/leave'));
  assert.deepEqual(leaveCalls.map((call) => [call.init.method, call.url, call.init.body, call.init.keepalive]), [
    [
      'POST',
      'https://worker.example.test/api/notes/note_001/leave',
      JSON.stringify({ cause: 'tab_switch' }),
      undefined,
    ],
    [
      'POST',
      'https://worker.example.test/api/notes/note_002/leave',
      JSON.stringify({ cause: 'app_leave' }),
      true,
    ],
  ]);
});

test('HTTP digest product app reports provider invalid id as provider_error before root binding or fetch', async () => {
  const root = createFakeRoot();
  let fetchCalls = 0;
  const app = createNoteSurfaceHttpDigestProductApp({
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

test('HTTP digest product app source stays a framework-neutral composition boundary', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceHttpDigestProductApp.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceHttpDigestProductApp/);
  assert.match(source, /createNoteSurfaceHttpDigestProductProvider/);
  assert.match(source, /createNoteSurfaceProductApp/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /React|Next|Vite|createRoot|hydrateRoot/);
  assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|fetch\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /authPolicy|providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]|\/digest|\/provenance|\/memory|\/ai-operations/);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /operationId\s*=\s*['"`]|memoryId\s*=\s*['"`]|sourceSpanId\s*=\s*['"`]|noteId\s*=\s*['"`]/);
});

function createFetchLike(calls, responses) {
  return async (url, init) => {
    calls.push({ url, init });
    if (init.method !== 'GET') {
      return {
        ok: true,
        status: 200,
        async json() {
          return { handled: true };
        },
      };
    }

    const response = url.endsWith('/notes') ? noteListResponse : responses.shift();
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

function createReopenedDocument() {
  const document = structuredClone(noteDocumentFixture);
  document.note = {
    ...document.note,
    id: 'note_002',
    title: 'Reopened note',
  };
  document.sections = document.sections.map((section) => ({
    ...section,
    noteId: 'note_002',
  }));
  document.blocks = document.blocks.map((block) => ({
    ...block,
    noteId: 'note_002',
  }));
  return document;
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
