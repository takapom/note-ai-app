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
    viewOptions: {
      inlineAiProjectionsVisible: true,
    },
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
  assert.match(root.innerHTML, /ann-app-shell/);
  assert.match(root.innerHTML, /data-action="delete" data-target="ai_assist_block"/);
  assert.equal(root.listeners.click.length, 1);
  assert.equal(mounted.events.some((event) => event.target === 'ai_assist_block' && event.action === 'delete'), true);

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

test('app bootstrap sends editor save clicks as plain text block update requests', async () => {
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
  });

  const mounted = await app.mount();
  assert.equal(mounted.ok, true);

  root.click(createActionElement({
    action: 'edit_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
  }));

  root.click(createSaveActionElement({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
  }, 'Updated user-authored block text.'));

  await settle();
  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    [
      'PATCH',
      'https://worker.example.test/api/blocks/block_paragraph_001',
      JSON.stringify({ noteId: 'note_001', content: 'Updated user-authored block text.' }),
    ],
  ]);
});

test('app bootstrap refreshes resolver mappings from reopened note projections', async () => {
  const root = createFakeRoot();
  const calls = [];
  const reopenedDocument = createReopenedDocumentWithAiBlock();
  const app = createNoteSurfaceAppBootstrap({
    document: structuredClone(noteDocumentFixture),
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, (url) => {
      if (url.endsWith('/notes/note_002')) {
        return {
          ok: true,
          status: 200,
          body: {
            document: reopenedDocument,
            viewState: {
              inlineAiProjectionsVisible: true,
            },
            projectionMaps: {
              activeNoteId: 'note_002',
              operationIdByBlockId: {
                block_ai_question_001: 'operation_002',
              },
            },
          },
        };
      }
      if (url.endsWith('/notes/note_002/digest')) {
        return {
          ok: true,
          status: 200,
          body: { available: false },
        };
      }

      return {
        ok: true,
        status: 202,
        body: { handled: true },
      };
    }),
    ...metadata,
    viewOptions: {
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
  });

  const mounted = await app.mount();
  assert.equal(mounted.ok, true);

  root.click(createActionElement({
    action: 'open_recent_thought',
    target: 'thin_rail',
    noteId: 'note_002',
  }));

  await waitFor(() => calls.length === 3);
  assert.match(root.innerHTML, /data-surface="single-note" data-note-id="note_002"/);
  assert.match(root.innerHTML, /data-action="delete" data-target="ai_assist_block"/);

  root.click(createActionElement({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  }));

  await waitFor(() => calls.length === 4);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['POST', 'https://worker.example.test/api/notes/note_001/leave'],
    ['GET', 'https://worker.example.test/api/notes/note_002'],
    ['GET', 'https://worker.example.test/api/notes/note_002/digest'],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_002/dismiss'],
  ]);
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

function createSaveActionElement(dataset, content) {
  const contentElement = {
    textContent: content,
  };
  const article = {
    querySelector(selector) {
      assert.equal(selector, '[data-block-editor-content="true"]');
      return contentElement;
    },
  };
  const element = {
    dataset,
    closest(selector) {
      if (selector === '[data-action]') {
        return element;
      }
      assert.equal(selector, 'article[data-block-id]');
      return article;
    },
  };
  return element;
}

function createFetchLike(calls, responseFor) {
  return async (url, init) => {
    calls.push({ url, init });
    const response = responseFor?.(url, init) ?? {
      ok: true,
      status: 200,
      body: { handled: true },
    };
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      },
    };
  };
}

function createReopenedDocumentWithAiBlock() {
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
