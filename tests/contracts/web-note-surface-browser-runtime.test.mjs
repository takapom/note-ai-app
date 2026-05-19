import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceBrowserRuntime } from '../../apps/web/src/noteSurfaceBrowserRuntime.ts';
import { createNoteSurfaceApiTransport } from '../../apps/web/src/noteSurfaceApiTransport.ts';
import { createNoteSurfaceEventController } from '../../apps/web/src/noteSurfaceEventController.ts';
import {
  NoteSurfaceHtmlRendererError,
  renderNoteSurfaceHtml,
} from '../../apps/web/src/noteSurfaceHtmlRenderer.ts';
import { createNoteSurfaceViewModel } from '../../apps/web/src/noteSurface.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('browser runtime mounts escaped HTML and binds render events through an injected host', async () => {
  const document = createMemoryCandidateDocument();
  document.note.title = 'Runtime <script>alert("x")</script>';
  const model = createNoteSurfaceViewModel(document, {
    expandedDigest: true,
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [
        { id: 'question_001', text: 'Check <unsafe> digest text.' },
      ],
    },
  });
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model,
    eventController: createController([]),
    host,
  });

  const mounted = await runtime.mount();

  assert.equal(mounted.ok, true);
  assert.equal(mounted.status, 'mounted');
  assert.equal(host.html, mounted.html);
  assert.match(host.html, /Runtime &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(host.html, /<script>alert/);
  assert.ok(host.events);
  assert.equal(host.events, mounted.events);
  assert.equal(host.events.some((event) => event.target === 'ai_assist_block' && event.action === 'adopt'), true);
  assert.equal(host.events.some((event) => event.target === 'memory_candidate_block' && event.action === 'remember'), true);
  assert.equal(typeof host.handler, 'function');
});

test('browser runtime dispatches AI memory digest and provenance actions through controller and transport', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(createMemoryCandidateDocument()),
    eventController: createController(calls),
    host,
  });
  const mounted = await runtime.mount();
  assert.equal(mounted.ok, true);

  const aiEvent = host.events.find((event) => event.target === 'ai_assist_block' && event.action === 'adopt');
  const memoryEvent = host.events.find((event) => event.target === 'memory_candidate_block' && event.action === 'remember');
  assert.ok(aiEvent);
  assert.ok(memoryEvent);

  const ai = await host.handler(aiEvent);
  const memory = await host.handler(memoryEvent);
  const digest = await host.handler({
    dataset: {
      action: 'read_digest',
      target: 'next_open_digest',
      apiIntent: 'GET /notes/:noteId/digest',
    },
  });
  const provenance = await host.handler({
    dataset: {
      action: 'inspect_source',
      target: 'provenance_popover',
      apiIntent: 'POST /provenance/source',
    },
  });

  assert.deepEqual(
    [ai, memory, digest, provenance].map((result) => [
      result.ok,
      result.status,
      result.controllerResult?.status,
    ]),
    [
      [true, 'handled', 'sent'],
      [true, 'handled', 'sent'],
      [true, 'handled', 'sent'],
      [true, 'handled', 'sent'],
    ],
  );
  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['POST', 'https://worker.example.test/api/ai-operations/operation_001/accept'],
    ['POST', 'https://worker.example.test/api/memory/memory_001/accept'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
    ['POST', 'https://worker.example.test/api/provenance/source'],
  ]);
});

test('browser runtime sends editor save actions through the block update boundary', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_paragraph_001'],
    }),
    eventController: createController(calls),
    host,
  });
  await runtime.mount();
  const editorEvents = host.events.filter((event) => event.target === 'block_editor');

  for (const action of ['edit_block', 'cancel_edit']) {
    const event = editorEvents.find((entry) => entry.action === action);
    assert.ok(event);
    const result = await host.handler(event);
    assert.equal(result.ok, true);
    assert.equal(result.controllerResult?.status, 'noop');
  }

  const saveEvent = editorEvents.find((entry) => (
    entry.action === 'save_block' && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(saveEvent);
  const save = await host.handler({
    ...saveEvent,
    content: 'Updated user-authored block text.',
  });

  assert.deepEqual([save.ok, save.status, save.controllerResult?.status], [true, 'handled', 'sent']);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    [
      'PATCH',
      'https://worker.example.test/api/blocks/block_paragraph_001',
      JSON.stringify({ noteId: 'note_001', content: 'Updated user-authored block text.' }),
    ],
  ]);
});

test('browser runtime closes render and event controller failures into boundary results', async () => {
  const invalidModel = createNoteSurfaceViewModel(noteDocumentFixture);
  invalidModel.excludedSurfaces.persistentChatPanel = true;
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: invalidModel,
    eventController: createController([]),
    host,
  });

  const renderFailure = await runtime.mount();

  assert.equal(renderFailure.ok, false);
  assert.equal(renderFailure.status, 'render_error');
  assert.match(renderFailure.errors.join('\n'), /chat-first side surface/);
  assert.equal(host.html, '');
  assert.equal(host.events, undefined);

  const controllerFailureRuntime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture),
    eventController: {
      async handleRenderEvent() {
        throw new Error('controller unavailable');
      },
    },
    host: createHost(),
  });
  const controllerFailure = await controllerFailureRuntime.handleAction({
    action: 'adopt',
    target: 'ai_assist_block',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  });

  assert.deepEqual(controllerFailure, {
    ok: false,
    status: 'controller_error',
    errors: ['controller unavailable'],
  });
});

test('browser runtime keeps renderer validation errors structured when available', async () => {
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture),
    render() {
      throw new NoteSurfaceHtmlRendererError(['first render issue', 'second render issue']);
    },
    eventController: createController([]),
    host: createHost(),
  });

  const result = await runtime.mount();

  assert.deepEqual(result, {
    ok: false,
    status: 'render_error',
    errors: ['first render issue', 'second render issue'],
  });
});

test('browser runtime source stays framework-neutral and outside runtime internals', async () => {
  const source = await readFile(new URL('../../apps/web/src/noteSurfaceBrowserRuntime.ts', import.meta.url), 'utf8');
  const rendered = renderNoteSurfaceHtml(createNoteSurfaceViewModel(noteDocumentFixture));

  assert.match(source, /export function createNoteSurfaceBrowserRuntime/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /fetch\(|globalThis\.fetch|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /document\.|window\.|HTMLElement|addEventListener|querySelector/);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.equal(rendered.events.every((event) => event.emitsAiProviderCall === false), true);
});

function createController(calls) {
  const transport = createNoteSurfaceApiTransport({
    baseUrl: 'https://worker.example.test/api/',
    async fetchLike(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { handled: true };
        },
      };
    },
  });

  return createNoteSurfaceEventController({
    ...metadata,
    transport,
    resolveActionInput(event) {
      if (event.target === 'ai_assist_block') {
        return { operationId: 'operation_001' };
      }
      if (event.target === 'memory_candidate_block') {
        return {
          memoryId: 'memory_001',
          content: event.action === 'edit' ? 'Remember the source-backed editor preference.' : undefined,
        };
      }
      if (event.target === 'next_open_digest') {
        return { noteId: 'note_001' };
      }
      if (event.target === 'provenance_popover') {
        return {
          provenance: {
            sourceSpanId: 'span_001',
            sourceBlockId: 'block_source_001',
            startOffset: 4,
            endOffset: 42,
          },
        };
      }
      if (event.target === 'block_editor') {
        return {
          noteId: event.noteId,
          blockId: event.blockId,
          content: event.content,
        };
      }
      return undefined;
    },
  });
}

function createHost() {
  return {
    html: '',
    events: undefined,
    handler: undefined,
    setHtml(html) {
      this.html = html;
    },
    bindActionEvents(events, handler) {
      this.events = events;
      this.handler = handler;
    },
  };
}

function createMemoryCandidateDocument() {
  const now = 1_764_000_000_000;
  const document = structuredClone(noteDocumentFixture);

  document.blocks = [
    ...document.blocks,
    {
      id: 'block_ai_memory_candidate_001',
      noteId: document.note.id,
      sectionId: 'section_001',
      type: 'ai_memory_candidate',
      contentJson: {
        text: 'Remember that the user is evaluating editor ergonomics.',
        annotations: [
          {
            kind: 'source_span',
            sourceBlockId: 'block_paragraph_001',
            startOffset: 0,
            endOffset: 20,
            reason: 'Memory candidate is source-backed.',
          },
        ],
      },
      plainText: 'Remember that the user is evaluating editor ergonomics.',
      position: 3,
      origin: 'ai',
      contentHash: 'hash_block_ai_memory_candidate_001',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return document;
}
