import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceAppBootstrap } from '../../apps/web/src/noteSurfaceAppBootstrap.ts';
import { createNoteSurfaceProductState } from '../../apps/web/src/noteSurfaceProductState.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('product state composes bootstrap options from caller supplied document view state and projection maps', async () => {
  const document = structuredClone(noteDocumentFixture);
  const productState = createNoteSurfaceProductState({
    document,
    viewState: {
      workspaceName: 'Research Workspace',
      aiStatus: 'updated',
      editingBlockIds: ['block_paragraph_001'],
      inlineAiProjectionsVisible: true,
      returnLayerVisible: true,
      nextOpenDigest: {
        available: true,
        unresolvedQuestions: [
          {
            id: 'digest_question_001',
            text: 'Clarify the next editor acceptance check.',
            sourceBlockId: 'block_paragraph_001',
          },
        ],
      },
      expandedDigest: true,
      provenancePopover: {
        open: true,
        sourceBlockId: 'block_paragraph_001',
        sourceNoteId: document.note.id,
        excerpt: 'User-authored source excerpt.',
      },
    },
    projectionMaps: {
      activeNoteId: 'note_active_runtime_001',
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
      sourceSpanIdByBlockId: {
        block_ai_question_001: 'source_span_001',
      },
    },
  });

  assert.equal(productState.ok, true);
  assert.equal(productState.document, document);
  assert.deepEqual(productState.viewOptions, {
    workspaceName: 'Research Workspace',
    aiStatus: 'updated',
    editingBlockIds: ['block_paragraph_001'],
    sourceSpanIdByBlockId: {
      block_ai_question_001: 'source_span_001',
    },
    inlineAiProjectionsVisible: true,
    returnLayerVisible: true,
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [
        {
          id: 'digest_question_001',
          text: 'Clarify the next editor acceptance check.',
          sourceBlockId: 'block_paragraph_001',
        },
      ],
    },
    expandedDigest: true,
    provenancePopover: {
      open: true,
      sourceBlockId: 'block_paragraph_001',
      sourceNoteId: document.note.id,
      excerpt: 'User-authored source excerpt.',
    },
  });
  assert.equal(productState.resolverOptions.activeNoteId, 'note_active_runtime_001');
  assert.deepEqual(productState.resolverOptions.operationIdByBlockId, {
    block_ai_question_001: 'operation_001',
  });

  const root = createFakeRoot();
  const calls = [];
  const app = createNoteSurfaceAppBootstrap({
    ...productState,
    root,
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls),
    ...metadata,
  });

  const mounted = await app.mount();

  assert.equal(mounted.ok, true);
  assert.match(root.innerHTML, /Research Workspace/);
  assert.match(root.innerHTML, /data-action="delete" data-target="ai_assist_block"/);

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

test('product state returns document validation errors before bootstrap composition', () => {
  const invalidDocument = structuredClone(noteDocumentFixture);
  invalidDocument.note.id = '';

  const productState = createNoteSurfaceProductState({
    document: invalidDocument,
    projectionMaps: {
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
    },
  });

  assert.equal(productState.ok, false);
  assert.match(productState.errors.join('\n'), /note\.id must be a non-empty string/);
});

test('product state uses only caller supplied projection ids and does not create fallback ids', () => {
  const productState = createNoteSurfaceProductState({
    document: structuredClone(noteDocumentFixture),
    projectionMaps: {
      operationIdByBlockId: {
        block_paragraph_001: 'operation_must_not_attach_to_user_block',
      },
      memoryIdByBlockId: {
        block_ai_question_001: 'memory_must_not_attach_to_non_memory_block',
      },
      sourceSpanIdByBlockId: {},
    },
  });

  assert.equal(productState.ok, true);
  assert.equal(productState.resolverOptions.operationIdByBlockId, undefined);
  assert.equal(productState.resolverOptions.memoryIdByBlockId, undefined);
  assert.equal(productState.resolverOptions.provenanceByBlockId, undefined);
});

test('product state source stays a product composition boundary without runtime imports id generation or direct mutation', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceProductState.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceProductState/);
  assert.match(source, /createNoteSurfaceResolverOptionsFromDocument/);
  assert.doesNotMatch(source, /createNoteSurfaceViewModel|createNoteSurfaceAppBootstrap|createNoteSurfaceApiTransport/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|new Request|globalThis\.fetch/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
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
