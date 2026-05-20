import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { NoteDocumentBlockCommandPort } from '../../apps/worker/src/note-model/noteBlockCommandPort.ts';
import { InMemoryNoteDocumentPersistencePort } from '../../apps/worker/src/note-model/noteDocumentPersistencePort.ts';
import { createWorkerFetchHandler } from '../../apps/worker/src/runtime/http/workerEntrypoint.ts';
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

test('hosted note surface uses Worker env bindings for canonical and Agent-local runtime wiring', async () => {
  buildWebArtifact();
  const { startBrowserNoteSurfaceApp } = await import(
    '../../dist/web/assets/apps/web/src/browserNoteSurfaceAppEntry.js'
  );

  const initialDocument = structuredClone(noteDocumentFixture);
  const canonical = createCanonicalNoteSqlClient(initialDocument);
  const agentLocal = createAgentLocalDigestSqlClient({
    workspaceId,
    noteId,
    triggerReason: 'next_open',
    preparedAt: 1_764_000_222_000,
  });
  const env = {
    TURSO: canonical.client,
    AGENT_LOCAL_SQL: agentLocal.client,
  };
  const workerRequests = [];
  const workerFetch = createWorkerFetchHandler({
    now: () => 1_764_000_123_000,
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
      fetchLike: createWorkerBackedFetchLike(workerFetch, fetchCalls, env, workerRequests),
    },
  );

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.match(rootElement.innerHTML, /The MVP should protect writing flow before adding integrations\./);
  assert.equal(canonical.executed.some((statement) => /from notes/i.test(statement.sql)), true);
  assert.equal(
    agentLocal.executed.some((statement) => /agent_local_next_open_digest_preparation_intents/i.test(statement.sql)),
    true,
    JSON.stringify({
      fetchCalls: fetchCalls.map((call) => [call.init.method, call.url]),
      workerRequests,
      agentLocalExecuted: agentLocal.executed,
    }),
  );

  const savedText = 'Hosted env binding save reached canonical Turso wiring.';
  rootElement.click(createSaveActionElement({
    action: 'save_block',
    target: 'block_editor',
    blockId: paragraphBlockId,
  }, savedText));

  await waitFor(() => workerRequests.some((request) => (
    request.method === 'PATCH' && request.path === `/blocks/${paragraphBlockId}` && request.status === 200
  )));

  assert.deepEqual(fetchCalls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/notes/note_001'],
    ['GET', 'https://worker.example.test/notes/note_001/digest'],
    ['PATCH', 'https://worker.example.test/blocks/block_paragraph_001'],
  ]);
  assert.equal(canonical.executed.some((statement) => /^insert into blocks\b/i.test(statement.sql)), true);
  assert.equal(canonical.document.blocks.find((block) => block.id === paragraphBlockId)?.plainText, savedText);
  assert.notEqual(canonical.document.sections[0].contentHash, initialDocument.sections[0].contentHash);
  assert.equal(canonical.document.sections[0].lastStructuredHash, initialDocument.sections[0].lastStructuredHash);
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

function createWorkerBackedFetchLike(workerFetch, calls, env = {}, workerRequests = undefined) {
  return async (url, init) => {
    calls.push({ url, init });
    const request = new Request(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    const workerRequest = {
      method: request.method,
      path: new URL(request.url).pathname,
    };
    workerRequests?.push(workerRequest);
    const response = await workerFetch(
      request,
      env,
    );
    workerRequest.status = response.status;
    workerRequest.responseBody = await response.clone().json().catch(() => undefined);

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

function createCanonicalNoteSqlClient(initialDocument) {
  let document = structuredClone(initialDocument);
  const executed = [];

  return {
    get document() {
      return structuredClone(document);
    },
    executed,
    client: {
      async execute(statement) {
        executed.push(statement);
        const sql = statement.sql.toLowerCase();

        if (/^insert into notes\b/.test(sql)) {
          document = {
            ...document,
            note: noteFromInsertArgs(statement.args),
          };
          return { rowsAffected: 1 };
        }
        if (/^delete from blocks\b/.test(sql)) {
          document = {
            ...document,
            blocks: document.blocks.filter((block) => block.noteId !== statement.args[0]),
          };
          return { rowsAffected: 1 };
        }
        if (/^delete from sections\b/.test(sql)) {
          document = {
            ...document,
            sections: document.sections.filter((section) => section.noteId !== statement.args[0]),
          };
          return { rowsAffected: 1 };
        }
        if (/^insert into sections\b/.test(sql)) {
          document = {
            ...document,
            sections: [...document.sections, sectionFromInsertArgs(statement.args)],
          };
          return { rowsAffected: 1 };
        }
        if (/^insert into blocks\b/.test(sql)) {
          document = {
            ...document,
            blocks: [...document.blocks, blockFromInsertArgs(statement.args)],
          };
          return { rowsAffected: 1 };
        }
        if (/from notes\b/.test(sql)) {
          return { rows: [noteToRow(document.note)] };
        }
        if (/from sections\b/.test(sql)) {
          return { rows: document.sections.map(sectionToRow) };
        }
        if (/from blocks\b/.test(sql)) {
          return { rows: document.blocks.map(blockToRow) };
        }

        throw new Error(`unexpected canonical SQL: ${statement.sql}`);
      },
    },
  };
}

function createAgentLocalDigestSqlClient(digest) {
  const executed = [];
  return {
    executed,
    client: {
      async execute(statement) {
        executed.push(statement);
        if (!/agent_local_next_open_digest_preparation_intents/i.test(statement.sql)) {
          throw new Error(`unexpected Agent-local SQL: ${statement.sql}`);
        }

        return {
          rows: [{
            workspace_id: digest.workspaceId,
            note_id: digest.noteId,
            trigger_reason: digest.triggerReason,
            recovered_job_count: 1,
            prepared: true,
            prepared_at: digest.preparedAt,
            payload_json: JSON.stringify({
              workspaceId: digest.workspaceId,
              noteId: digest.noteId,
              prepared: true,
              recoveredJobCount: 1,
              triggerReason: digest.triggerReason,
              preparedAt: digest.preparedAt,
            }),
          }],
        };
      },
    },
  };
}

function noteToRow(note) {
  return {
    id: note.id,
    workspace_id: note.workspaceId,
    title: note.title,
    description_user: note.descriptionUser ?? null,
    description_ai: note.descriptionAi ?? null,
    description_ai_approved: note.descriptionAiApproved ?? null,
    description_effective: note.descriptionEffective ?? null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

function sectionToRow(section) {
  return {
    id: section.id,
    note_id: section.noteId,
    parent_section_id: section.parentSectionId ?? null,
    heading_block_id: section.headingBlockId ?? null,
    heading_level: section.headingLevel ?? null,
    title: section.title ?? null,
    description_ai: section.descriptionAi ?? null,
    content_hash: section.contentHash,
    last_structured_hash: section.lastStructuredHash ?? null,
    last_structured_at: section.lastStructuredAt ?? null,
    position: section.position,
    created_at: section.createdAt,
    updated_at: section.updatedAt,
  };
}

function blockToRow(block) {
  return {
    id: block.id,
    note_id: block.noteId,
    section_id: block.sectionId ?? null,
    parent_block_id: block.parentBlockId ?? null,
    type: block.type,
    content_json: JSON.stringify(block.contentJson),
    plain_text: block.plainText,
    position: block.position,
    origin: block.origin,
    content_hash: block.contentHash,
    created_at: block.createdAt,
    updated_at: block.updatedAt,
  };
}

function noteFromInsertArgs(args) {
  return {
    id: args[0],
    workspaceId: args[1],
    title: args[2],
    ...(args[3] === null ? {} : { descriptionUser: args[3] }),
    ...(args[4] === null ? {} : { descriptionAi: args[4] }),
    ...(args[5] === null ? {} : { descriptionAiApproved: args[5] }),
    ...(args[6] === null ? {} : { descriptionEffective: args[6] }),
    createdAt: args[7],
    updatedAt: args[8],
  };
}

function sectionFromInsertArgs(args) {
  return {
    id: args[0],
    noteId: args[1],
    ...(args[2] === null ? {} : { parentSectionId: args[2] }),
    ...(args[3] === null ? {} : { headingBlockId: args[3] }),
    ...(args[4] === null ? {} : { headingLevel: args[4] }),
    ...(args[5] === null ? {} : { title: args[5] }),
    ...(args[6] === null ? {} : { descriptionAi: args[6] }),
    contentHash: args[7],
    ...(args[8] === null ? {} : { lastStructuredHash: args[8] }),
    ...(args[9] === null ? {} : { lastStructuredAt: args[9] }),
    position: args[10],
    createdAt: args[11],
    updatedAt: args[12],
  };
}

function blockFromInsertArgs(args) {
  return {
    id: args[0],
    noteId: args[1],
    ...(args[2] === null ? {} : { sectionId: args[2] }),
    ...(args[3] === null ? {} : { parentBlockId: args[3] }),
    type: args[4],
    contentJson: JSON.parse(args[5]),
    plainText: args[6],
    position: args[7],
    origin: args[8],
    contentHash: args[9],
    createdAt: args[10],
    updatedAt: args[11],
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
