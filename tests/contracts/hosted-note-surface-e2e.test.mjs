import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { NoteDocumentBlockCommandPort } from '../../apps/worker/src/noteBlockCommandPort.ts';
import { InMemoryNoteDocumentPersistencePort } from '../../apps/worker/src/noteDocumentPersistencePort.ts';
import { createWorkerFetchHandler } from '../../apps/worker/src/workerEntrypoint.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const workspaceId = 'workspace_001';
const userId = 'user_001';
const noteId = 'note_001';
const paragraphBlockId = 'block_paragraph_001';
const hostedApiBaseUrl = 'https://worker.example.test/';

test('hosted note surface static artifact reaches Worker endpoint for initial load and editor save', async () => {
  buildWebArtifact();
  const builtHtml = await readFile(new URL('dist/web/index.html', root), 'utf8');

  assert.match(
    builtHtml,
    /from ['"]\/assets\/apps\/web\/src\/browserNoteSurfaceAppEntry\.js['"]/,
  );
  assert.equal(
    existsSync(new URL('dist/web/assets/apps/web/src/browserNoteSurfaceAppEntry.js', root)),
    true,
  );
  const { startBrowserNoteSurfaceApp } = await import(
    '../../dist/web/assets/apps/web/src/browserNoteSurfaceAppEntry.js'
  );

  const initialDocument = structuredClone(noteDocumentFixture);
  const persistence = new InMemoryNoteDocumentPersistencePort([initialDocument]);
  const noteBlocks = new NoteDocumentBlockCommandPort(persistence);
  const boundNoteBlocks = {
    createBlock(input) {
      return noteBlocks.createBlock(input);
    },
    updateBlock(input) {
      return noteBlocks.updateBlock(input);
    },
    deleteBlock(input) {
      return noteBlocks.deleteBlock(input);
    },
  };
  const workerRequests = [];
  const workerFetch = createWorkerFetchHandler({
    now: () => 1_764_000_123_000,
    createPorts({ request }) {
      workerRequests.push({
        method: request.method,
        path: request.path,
        workspaceId: request.workspaceId,
        userId: request.userId,
        body: request.body,
      });

      return {
        noteDocument: persistence,
        noteBlocks: boundNoteBlocks,
      };
    },
  });
  const fetchCalls = [];
  const rootElement = createFakeRoot({
    apiBaseUrl: hostedApiBaseUrl,
    workspaceId,
    userId,
    noteId,
  });

  const mounted = await startBrowserNoteSurfaceApp(
    {
      documentReadyState: 'complete',
      mount: undefined,
    },
    {
      documentLike: createDocumentLike({
        '[data-note-surface-root]': rootElement,
      }),
      fetchLike: createWorkerBackedFetchLike(workerFetch, fetchCalls),
    },
  );

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.match(rootElement.innerHTML, /The MVP should protect writing flow before adding integrations\./);
  assert.deepEqual(fetchCalls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/notes/note_001'],
    ['GET', 'https://worker.example.test/notes/note_001/digest'],
  ]);
  assert.deepEqual(workerRequests.map((request) => [request.method, request.path]), [
    ['GET', '/notes/note_001'],
    ['GET', '/notes/note_001/digest'],
  ]);

  const originalLoaded = await persistence.loadDocument({ workspaceId, noteId });
  assert.equal(originalLoaded.ok, true);
  const originalSectionHash = originalLoaded.document.sections[0].contentHash;
  const savedText = 'Hosted E2E save reached the Worker route.';

  rootElement.click(createSaveActionElement({
    action: 'save_block',
    target: 'block_editor',
    blockId: paragraphBlockId,
  }, savedText));

  await waitFor(() => workerRequests.some((request) => (
    request.method === 'PATCH' && request.path === `/blocks/${paragraphBlockId}`
  )));

  assert.deepEqual(fetchCalls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/notes/note_001'],
    ['GET', 'https://worker.example.test/notes/note_001/digest'],
    ['PATCH', 'https://worker.example.test/blocks/block_paragraph_001'],
  ]);
  const saveRequest = workerRequests.find((request) => (
    request.method === 'PATCH' && request.path === `/blocks/${paragraphBlockId}`
  ));
  assert.deepEqual(saveRequest.body, {
    noteId,
    content: savedText,
  });

  const saved = await persistence.loadDocument({ workspaceId, noteId });
  assert.equal(saved.ok, true);
  const savedBlock = saved.document.blocks.find((block) => block.id === paragraphBlockId);
  assert.equal(savedBlock.plainText, savedText);
  assert.deepEqual(savedBlock.contentJson, { text: savedText });
  assert.notEqual(saved.document.sections[0].contentHash, originalSectionHash);
  assert.equal(saved.document.sections[0].lastStructuredHash, initialDocument.sections[0].lastStructuredHash);
});

function buildWebArtifact() {
  const result = spawnSync(process.execPath, ['scripts/build-web.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    [
      'node scripts/build-web.mjs failed',
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'),
  );
}

function createWorkerBackedFetchLike(workerFetch, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const response = await workerFetch(
      new Request(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
      }),
      {},
    );

    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.json();
      },
      async text() {
        return response.text();
      },
    };
  };
}

function createDocumentLike(rootBySelector) {
  return {
    querySelector(selector) {
      return rootBySelector[selector] ?? null;
    },
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
    addEventListener(type, listener) {
      this.listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      this.listeners[type] = this.listeners[type].filter((entry) => entry !== listener);
    },
    click(target) {
      for (const listener of this.listeners.click) {
        listener({ target });
      }
    },
  };
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
  const button = {
    dataset,
    closest(selector) {
      if (selector === '[data-action]') {
        return button;
      }
      assert.equal(selector, 'article[data-block-id]');
      return article;
    },
  };
  return button;
}

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  assert.equal(predicate(), true);
}
