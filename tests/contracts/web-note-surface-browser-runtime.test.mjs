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
    inlineAiProjectionsVisible: true,
    memoryCandidatesVisible: true,
    returnLayerVisible: true,
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
  assert.equal(host.events.some((event) => event.target === 'ai_assist_block' && event.action === 'delete'), true);
  assert.equal(host.events.some((event) => event.target === 'memory_candidate_block' && event.action === 'remember'), true);
  assert.equal(typeof host.handler, 'function');
});

test('browser runtime dispatches AI memory digest and provenance actions through controller and transport', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(createMemoryCandidateDocument(), {
      inlineAiProjectionsVisible: true,
      memoryCandidatesVisible: true,
      sourceSpanIdByBlockId: {
        block_ai_question_001: 'source_span_ai_question_001',
      },
    }),
    eventController: createController(calls),
    host,
  });
  const mounted = await runtime.mount();
  assert.equal(mounted.ok, true);

  const aiEvent = host.events.find((event) => event.target === 'ai_assist_block' && event.action === 'delete');
  const provenanceEvent = host.events.find((event) => (
    event.target === 'ai_assist_block'
    && event.action === 'inspect_source'
    && event.apiIntent === 'provenance.lookup'
  ));
  const memoryEvent = host.events.find((event) => event.target === 'memory_candidate_block' && event.action === 'remember');
  assert.ok(aiEvent);
  assert.ok(provenanceEvent);
  assert.ok(memoryEvent);

  const ai = await host.handler(aiEvent);
  assert.doesNotMatch(host.html, /data-block-id="block_ai_question_001"/);
  assert.doesNotMatch(host.html, /data-action-state="pending"/);

  const memory = await host.handler(memoryEvent);
  assert.match(host.html, /data-block-id="block_ai_memory_candidate_001"/);
  const digest = await host.handler({
    dataset: {
      action: 'read_digest',
      target: 'next_open_digest',
      apiIntent: 'GET /notes/:noteId/digest',
    },
  });
  const provenance = await host.handler(provenanceEvent);

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
    ['POST', 'https://worker.example.test/api/ai-operations/operation_001/dismiss'],
    ['POST', 'https://worker.example.test/api/memory/memory_001/accept'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
    ['POST', 'https://worker.example.test/api/provenance/source'],
  ]);
});

test('browser runtime sends editor save actions through the block update boundary', async () => {
  const calls = [];
  const host = createHost();
  let observedSavingProjection = false;
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_paragraph_001'],
    }),
    eventController: createController(calls, () => {
      observedSavingProjection = /data-block-id="block_paragraph_001"[^>]*data-editor-save-status="saving"/.test(host.html)
        && /data-editor-status-region="fixed" data-editor-layout-stability="status-reserved" data-editor-save-status="saving"/.test(host.html);
    }),
    host,
  });
  await runtime.mount();
  const editorEvents = host.events.filter((event) => event.target === 'block_editor');

  const editEvent = editorEvents.find((entry) => (
    entry.action === 'edit_block' && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(editEvent);
  const edit = await host.handler(editEvent);
  assert.equal(edit.ok, true);
  assert.equal(edit.controllerResult, undefined);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="editing"/);

  const cancelEvent = host.events.find((entry) => (
    entry.target === 'block_editor'
    && entry.action === 'cancel_edit'
    && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(cancelEvent);
  const cancel = await host.handler(cancelEvent);
  assert.equal(cancel.ok, true);
  assert.equal(cancel.controllerResult, undefined);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="idle"/);
  assert.equal(calls.length, 0);

  const saveEvent = host.events.find((entry) => (
    entry.action === 'save_block' && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(saveEvent);
  const save = await host.handler({
    ...saveEvent,
    content: 'Updated user-authored block text.',
  });

  assert.deepEqual([save.ok, save.status, save.controllerResult?.status], [true, 'handled', 'sent']);
  assert.equal(observedSavingProjection, true);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="idle"/);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-save-status="saved"/);
  assert.match(host.html, /Updated user-authored block text\./);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    [
      'PATCH',
      'https://worker.example.test/api/blocks/block_paragraph_001',
      JSON.stringify({ noteId: 'note_001', content: 'Updated user-authored block text.' }),
    ],
  ]);
});

test('browser runtime sends manual organize actions then reads backend digest projection', async () => {
  const calls = [];
  const host = createHost();
  let observedStructuringProjection = false;
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      returnLayerVisible: true,
    }),
    eventController: createController(calls, () => {
      observedStructuringProjection = /data-save-status="visible">整理中<\/span>/.test(host.html);
    }, (url) => {
      if (url.endsWith('/notes/note_001/digest')) {
        return {
          ok: true,
          status: 200,
          body: {
            available: true,
            decisions: [{
              id: 'digest_manual_decision_001',
              text: 'Manual organize returned a backend-owned digest projection.',
              sourceBlockId: 'block_paragraph_001',
            }],
          },
        };
      }

      return {
        ok: true,
        status: 202,
        body: {
          ok: true,
          route: 'manual_organize',
          triggerReason: 'manual_organize',
          scheduledJobs: [{ id: 'job_manual_001' }],
          errors: [],
        },
      };
    }),
    host,
  });
  await runtime.mount();

  const manualEvent = host.events.find((event) => (
    event.target === 'writing_chrome'
    && event.action === 'manual_organize'
    && event.apiIntent === 'note.manual_structure'
  ));
  assert.ok(manualEvent);

  const result = await host.handler(manualEvent);

  assert.deepEqual([result.ok, result.status, result.controllerResult?.status], [true, 'handled', 'sent']);
  assert.equal(observedStructuringProjection, true);
  assert.match(host.html, /data-save-status="visible">更新あり<\/span>/);
  assert.match(host.html, /Manual organize returned a backend-owned digest projection\./);
  assert.match(host.html, /data-component="next-open-digest" data-available="true" data-expanded="true"/);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    ['POST', 'https://worker.example.test/api/notes/note_001/structure/manual', undefined],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest', undefined],
  ]);
});

test('browser runtime marks manual organize failures without inventing a digest', async () => {
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture),
    eventController: {
      async handleRenderEvent() {
        return {
          ok: false,
          status: 'transport_error',
          errors: ['manual structure unavailable'],
        };
      },
    },
    host,
  });
  await runtime.mount();

  const result = await host.handler({
    action: 'manual_organize',
    target: 'writing_chrome',
    noteId: 'note_001',
    apiIntent: 'note.manual_structure',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'controller_error');
  assert.match(result.errors.join('\n'), /manual structure unavailable/);
  assert.match(host.html, /data-save-status="visible">保存に失敗<\/span>/);
  assert.doesNotMatch(host.html, /data-component="next-open-digest" data-available="true"/);
});

test('browser runtime suppresses composition-pending editor save without changing draft projection', async () => {
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

  const beforeHtml = host.html;
  const saveEvent = host.events.find((entry) => (
    entry.target === 'block_editor'
    && entry.action === 'save_block'
    && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(saveEvent);

  const save = await host.handler({
    ...saveEvent,
    focusedBlockId: 'block_paragraph_001',
    inputCompositionState: 'pending',
    content: 'IME draft not ready for transport.',
  });

  assert.deepEqual(save, {
    ok: true,
    status: 'handled',
    errors: [],
  });
  assert.equal(calls.length, 0);
  assert.equal(host.html, beforeHtml);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="editing"/);
  assert.match(host.html, /data-editor-status-region="fixed"[^>]*data-editor-save-status="dirty"/);
});

test('browser runtime preserves focused block identity and draft text across save status renders', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_paragraph_001'],
    }),
    eventController: createController(calls, () => {
      assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-layout-stability="block-identity"/);
      assert.match(host.html, /data-editor-status-region="fixed"[^>]*data-editor-layout-stability="status-reserved"[^>]*data-editor-save-status="saving"/);
      assert.match(host.html, /Draft text that keeps block identity\./);
    }),
    host,
  });
  await runtime.mount();

  const saveEvent = host.events.find((entry) => (
    entry.target === 'block_editor'
    && entry.action === 'save_block'
    && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(saveEvent);

  const save = await host.handler({
    ...saveEvent,
    focusedBlockId: 'block_paragraph_001',
    content: 'Draft text that keeps block identity.',
  });

  assert.deepEqual([save.ok, save.status, save.controllerResult?.status], [true, 'handled', 'sent']);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="idle"/);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-layout-stability="block-identity"/);
  assert.match(host.html, /Draft text that keeps block identity\./);
});

test('browser runtime updates heading projection after the canonical save boundary succeeds', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_heading_001'],
    }),
    eventController: createController(calls),
    host,
  });
  await runtime.mount();

  const headingSaveEvent = host.events.find((entry) => (
    entry.target === 'block_editor'
    && entry.action === 'save_block'
    && entry.blockId === 'block_heading_001'
  ));
  assert.ok(headingSaveEvent);

  const save = await host.handler({
    ...headingSaveEvent,
    content: 'Updated MVP scope',
  });

  assert.deepEqual([save.ok, save.status, save.controllerResult?.status], [true, 'handled', 'sent']);
  assert.match(host.html, /data-block-id="block_heading_001"[^>]*data-editor-state="idle"/);
  assert.match(host.html, /data-section-title="Updated MVP scope">Updated MVP scope<\/h2>/);
  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    [
      'PATCH',
      'https://worker.example.test/api/blocks/block_heading_001',
      JSON.stringify({ noteId: 'note_001', content: 'Updated MVP scope' }),
    ],
  ]);
});

test('browser runtime keeps editing projection when save transport fails', async () => {
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_paragraph_001'],
    }),
    eventController: {
      async handleRenderEvent() {
        return {
          ok: false,
          status: 'transport_error',
          errors: ['request failed with status 503'],
        };
      },
    },
    host,
  });
  await runtime.mount();

  const saveEvent = host.events.find((entry) => (
    entry.target === 'block_editor'
    && entry.action === 'save_block'
    && entry.blockId === 'block_paragraph_001'
  ));
  assert.ok(saveEvent);

  const save = await host.handler({
    ...saveEvent,
    content: 'Unsaved text should stay local to the DOM editor.',
  });

  assert.equal(save.ok, false);
  assert.equal(save.status, 'controller_error');
  assert.match(save.errors.join('\n'), /request failed with status 503/);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="editing"/);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-save-status="error"/);
  assert.match(host.html, /data-editor-status-region="fixed" data-editor-layout-stability="status-reserved" data-editor-save-status="error" data-retry-available="true" data-retry-action="save_block" aria-live="polite" aria-atomic="true"/);
  assert.match(host.html, /request failed with status 503/);
  assert.match(host.html, /Unsaved text should stay local to the DOM editor\./);
  assert.match(host.html, /data-action="save_block" data-target="block_editor" data-block-id="block_paragraph_001" data-action-state="idle">再試行<\/button>/);
});

test('browser runtime does not dispatch block save while input composition is active or pending', async () => {
  const host = createHost();
  let controllerCalls = 0;
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_paragraph_001'],
    }),
    eventController: {
      async handleRenderEvent() {
        controllerCalls += 1;
        throw new Error('composition-blocked save must not reach transport');
      },
    },
    host,
  });
  await runtime.mount();
  const before = host.html;

  const active = await host.handler({
    action: 'save_block',
    target: 'block_editor',
    apiIntent: 'block.update',
    blockId: 'block_paragraph_001',
    content: 'Composition text must remain in the DOM editor.',
    inputCompositionState: 'active',
  });
  const pending = await host.handler({
    action: 'save_block',
    target: 'block_editor',
    apiIntent: 'block.update',
    blockId: 'block_paragraph_001',
    content: 'Composition text must remain in the DOM editor.',
    inputCompositionState: 'pending',
  });

  assert.deepEqual([active.ok, active.status], [true, 'handled']);
  assert.deepEqual([pending.ok, pending.status], [true, 'handled']);
  assert.equal(controllerCalls, 0);
  assert.equal(host.html, before);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-state="editing"/);
  assert.match(host.html, /data-block-id="block_paragraph_001"[^>]*data-editor-save-status="dirty"/);
});

test('browser runtime only suppresses composition saves after block update intent is resolved', async () => {
  const host = createHost();
  let controllerCalls = 0;
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      editingBlockIds: ['block_paragraph_001'],
    }),
    eventController: {
      async handleRenderEvent() {
        controllerCalls += 1;
        return { ok: true, status: 'sent', errors: [] };
      },
    },
    host,
  });
  await runtime.mount();

  const result = await host.handler({
    action: 'save_block',
    target: 'block_editor',
    inputCompositionState: 'active',
  });

  assert.deepEqual([result.ok, result.status, result.controllerResult?.status], [true, 'handled', 'sent']);
  assert.equal(controllerCalls, 1);
});

test('browser runtime applies digest and provenance UI-only actions as local projection state', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      returnLayerVisible: true,
      expandedDigest: false,
      nextOpenDigest: {
        available: true,
        unresolvedQuestions: [
          { id: 'question_001', text: 'Follow up on editor projection state.' },
        ],
      },
      provenancePopover: {
        open: true,
        sourceBlockId: 'block_paragraph_001',
        excerpt: 'Bounded provenance excerpt.',
      },
    }),
    eventController: createController(calls),
    host,
  });

  const mounted = await runtime.mount();
  assert.equal(mounted.ok, true);
  assert.match(host.html, /data-component="next-open-digest" data-available="true" data-expanded="false"/);
  assert.match(host.html, /data-component="provenance-popover" data-open="true"/);

  const expandEvent = host.events.find((event) => event.target === 'next_open_digest');
  assert.ok(expandEvent);
  assert.equal(expandEvent.action, 'expand_digest');
  const expand = await host.handler(expandEvent);
  assert.equal(expand.ok, true);
  assert.equal(expand.controllerResult, undefined);
  assert.match(host.html, /data-component="next-open-digest" data-available="true" data-expanded="true"/);
  assert.match(host.html, /Follow up on editor projection state\./);

  const collapseEvent = host.events.find((event) => event.target === 'return_layer' && event.action === 'close_return_layer');
  assert.ok(collapseEvent);
  const collapse = await host.handler(collapseEvent);
  assert.equal(collapse.ok, true);
  assert.equal(collapse.controllerResult, undefined);
  assert.match(host.html, /data-component="next-open-digest" data-available="true" data-expanded="false"/);
  assert.match(host.html, /data-component="return-layer" data-open="false"/);

  const closeEvent = host.events.find((event) => event.target === 'provenance_popover');
  assert.ok(closeEvent);
  assert.equal(closeEvent.action, 'close_provenance');
  const close = await host.handler(closeEvent);
  assert.equal(close.ok, true);
  assert.equal(close.controllerResult, undefined);
  assert.match(host.html, /data-component="provenance-popover" data-open="false"/);
  assert.equal(calls.length, 0);
  assert.ok(host.renderCount >= 4);
});

test('browser runtime focuses the writing surface after continue_writing', async () => {
  const focusedBlockIds = [];
  const host = {
    ...createHost(),
    focusWritingBlock(blockId) {
      focusedBlockIds.push(blockId);
    },
  };
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      returnLayerVisible: true,
      expandedDigest: false,
      nextOpenDigest: {
        available: true,
        unresolvedQuestions: [
          {
            id: 'question_001',
            text: 'Resume from digest point.',
            sourceBlockId: 'block_paragraph_001',
          },
        ],
      },
    }),
    eventController: createController([]),
    host,
  });

  const mounted = await runtime.mount();
  assert.equal(mounted.ok, true);

  const continueEvent = host.events.find((event) => (
    event.target === 're_entry_surface' && event.action === 'continue_writing'
  ));
  assert.ok(continueEvent);

  const result = await host.handler(continueEvent);
  assert.equal(result.ok, true);
  assert.deepEqual(focusedBlockIds, ['block_paragraph_001']);
});

test('browser runtime toggles AI assist projection editing locally without dispatching transport', async () => {
  const calls = [];
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      inlineAiProjectionsVisible: true,
    }),
    eventController: createController(calls),
    host,
  });
  await runtime.mount();

  const edit = await host.handler({
    action: 'edit',
    target: 'ai_assist_block',
    apiIntent: 'none',
    blockId: 'block_ai_question_001',
  });

  assert.equal(edit.ok, true);
  assert.equal(edit.controllerResult, undefined);
  assert.match(host.html, /data-inline-ai-block="true"[\s\S]*data-editing="true"[\s\S]*contenteditable="true"/);
  assert.match(host.html, /data-action="edit" data-target="ai_assist_block" data-block-id="block_ai_question_001"[^>]*>完了</);

  const finish = await host.handler({
    action: 'edit',
    target: 'ai_assist_block',
    apiIntent: 'none',
    blockId: 'block_ai_question_001',
    content: 'Keep the digest collapsed on first open.',
  });

  assert.equal(finish.ok, true);
  assert.match(host.html, /data-editing="false"/);
  assert.match(host.html, /Keep the digest collapsed on first open\./);
  assert.match(host.html, /data-inline-ai-block="true"[^>]*>[\s\S]*role="document" aria-readonly="true"/);
  assert.deepEqual(calls, []);
});

test('browser runtime applies successful API response projections without owning canonical note state', async () => {
  const host = createHost();
  const controllerResults = [
    {
      ok: true,
      status: 'sent',
      transportResult: {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            available: true,
            unresolvedQuestions: [
              {
                id: 'digest_question_001',
                text: 'Review the response projection reducer.',
                sourceBlockId: 'block_paragraph_001',
              },
            ],
          },
        },
        errors: [],
      },
      errors: [],
    },
    {
      ok: true,
      status: 'sent',
      transportResult: {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            available: true,
            sourceSpanId: 'span_001',
            sourceBlockId: 'block_paragraph_001',
            excerpt: 'Bounded source excerpt from the Worker response.',
            source: {
              sourceBlockId: 'block_paragraph_001',
              noteId: 'note_001',
              startOffset: 4,
              endOffset: 42,
              reason: 'memory_candidate_source',
            },
          },
        },
        errors: [],
      },
      errors: [],
    },
    {
      ok: true,
      status: 'sent',
      transportResult: {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            memory: {
              id: 'memory_001',
              content: 'Remember the edited response projection text.',
            },
          },
        },
        errors: [],
      },
      errors: [],
    },
    {
      ok: true,
      status: 'sent',
      transportResult: {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            memory: {
              id: 'memory_001',
              status: 'active',
            },
          },
        },
        errors: [],
      },
      errors: [],
    },
  ];
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(createMemoryCandidateDocument(), {
      inlineAiProjectionsVisible: true,
      memoryCandidatesVisible: true,
      returnLayerVisible: true,
      expandedDigest: true,
      sourceSpanIdByBlockId: {
        block_ai_question_001: 'source_span_ai_question_001',
      },
      nextOpenDigest: { available: true },
      provenancePopover: { open: false },
    }),
    eventController: createQueuedController(controllerResults),
    host,
  });
  await runtime.mount();

  const digest = await host.handler({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'GET /notes/:noteId/digest',
    noteId: 'note_001',
  });

  assert.deepEqual([digest.ok, digest.status, digest.controllerResult?.status], [true, 'handled', 'sent']);
  assert.match(host.html, /data-component="next-open-digest" data-available="true" data-expanded="true"/);
  assert.match(host.html, /Review the response projection reducer\./);
  assert.match(host.html, /data-digest-item-id="digest_question_001" data-source-block-id="block_paragraph_001"/);

  const provenanceEvent = host.events.find((event) => (
    event.target === 'ai_assist_block'
    && event.action === 'inspect_source'
    && event.apiIntent === 'provenance.lookup'
  ));
  assert.ok(provenanceEvent);
  const provenance = await host.handler(provenanceEvent);

  assert.deepEqual([provenance.ok, provenance.status, provenance.controllerResult?.status], [true, 'handled', 'sent']);
  assert.match(host.html, /data-component="provenance-popover" data-open="true"/);
  assert.match(host.html, /data-source-block-id="block_paragraph_001"/);
  assert.match(host.html, /Bounded source excerpt from the Worker response\./);
  assert.match(host.html, /memory_candidate_source/);

  const edit = await host.handler({
    action: 'edit',
    target: 'memory_candidate_block',
    apiIntent: 'POST /memory/:memoryId/edit',
    blockId: 'block_ai_memory_candidate_001',
    content: 'Client draft should lose to response content.',
  });

  assert.deepEqual([edit.ok, edit.status, edit.controllerResult?.status], [true, 'handled', 'sent']);
  assert.match(host.html, /Remember the edited response projection text\./);
  assert.doesNotMatch(host.html, /Client draft should lose/);

  const remember = await host.handler({
    action: 'remember',
    target: 'memory_candidate_block',
    apiIntent: 'POST /memory/:memoryId/accept',
    blockId: 'block_ai_memory_candidate_001',
  });

  assert.deepEqual([remember.ok, remember.status, remember.controllerResult?.status], [true, 'handled', 'sent']);
  assert.doesNotMatch(host.html, /data-block-id="block_ai_memory_candidate_001"/);
  assert.doesNotMatch(host.html, /Remember the edited response projection text\./);
});

test('browser runtime preserves projection state when API action transport fails', async () => {
  const host = createHost();
  const runtime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(createMemoryCandidateDocument(), {
      memoryCandidatesVisible: true,
      returnLayerVisible: true,
      expandedDigest: true,
      nextOpenDigest: {
        available: true,
        unresolvedQuestions: [
          { id: 'question_existing', text: 'Existing digest item remains visible.' },
        ],
      },
      provenancePopover: { open: false },
    }),
    eventController: {
      async handleRenderEvent() {
        return {
          ok: false,
          status: 'transport_error',
          transportResult: {
            ok: false,
            status: 503,
            body: {
              ok: false,
              errors: ['projection unavailable'],
            },
            errors: ['projection unavailable'],
          },
          errors: ['projection unavailable'],
        };
      },
    },
    host,
  });
  await runtime.mount();

  const before = host.html;
  const result = await host.handler({
    action: 'remember',
    target: 'memory_candidate_block',
    apiIntent: 'POST /memory/:memoryId/accept',
    blockId: 'block_ai_memory_candidate_001',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'controller_error');
  assert.match(result.errors.join('\n'), /projection unavailable/);
  assert.notEqual(host.html, before);
  assert.match(host.html, /data-block-id="block_ai_memory_candidate_001"/);
  assert.match(host.html, /data-action-state="failed"/);
  assert.match(host.html, /失敗しました/);
  assert.match(host.html, /Existing digest item remains visible\./);
});

test('browser runtime renders digest read transport and invalid-body failures honestly', async () => {
  const invalidHost = createHost();
  const invalidRuntime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      returnLayerVisible: true,
    }),
    eventController: createQueuedController([
      {
        ok: true,
        status: 'sent',
        transportResult: {
          ok: true,
          status: 200,
          body: { ok: true, result: { available: true, unresolvedQuestions: [{ content: 'missing id' }] } },
          errors: [],
        },
        errors: [],
      },
    ]),
    host: invalidHost,
  });
  await invalidRuntime.mount();

  const invalid = await invalidHost.handler({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'GET /notes/:noteId/digest',
    noteId: 'note_001',
  });

  assert.deepEqual([invalid.ok, invalid.status, invalid.controllerResult?.status], [true, 'handled', 'sent']);
  assert.match(invalidHost.html, /整理データを読み取れませんでした/);
  assert.match(invalidHost.html, /data-digest-status-kind="invalid_body"/);

  const transportHost = createHost();
  const transportRuntime = createNoteSurfaceBrowserRuntime({
    model: createNoteSurfaceViewModel(noteDocumentFixture, {
      returnLayerVisible: true,
    }),
    eventController: createQueuedController([
      {
        ok: false,
        status: 'transport_error',
        transportResult: {
          ok: false,
          status: 503,
          body: { ok: false, errors: ['digest unavailable'] },
          errors: ['digest unavailable'],
        },
        errors: ['digest unavailable'],
      },
    ]),
    host: transportHost,
  });
  await transportRuntime.mount();

  const transport = await transportHost.handler({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'GET /notes/:noteId/digest',
    noteId: 'note_001',
  });

  assert.equal(transport.ok, false);
  assert.equal(transport.status, 'controller_error');
  assert.match(transportHost.html, /整理の取得に失敗しました/);
  assert.match(transportHost.html, /data-digest-status-kind="load_failed"/);
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
    action: 'delete',
    target: 'ai_assist_block',
    apiIntent: 'POST /ai-operations/:operationId/dismiss',
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

function createController(calls, beforeFetch, responseFor) {
  const transport = createNoteSurfaceApiTransport({
    baseUrl: 'https://worker.example.test/api/',
    async fetchLike(url, init) {
      beforeFetch?.();
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
    },
  });

  return createNoteSurfaceEventController({
    ...metadata,
    transport,
    resolveActionInput(event) {
      if (
        event.action === 'inspect_source'
        || event.apiIntent === 'provenance.lookup'
        || event.apiIntent === 'POST /provenance/source'
      ) {
        return {
          provenance: {
            sourceSpanId: 'span_001',
            sourceBlockId: 'block_source_001',
            startOffset: 4,
            endOffset: 42,
          },
        };
      }
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
      if (event.target === 'writing_chrome') {
        return { noteId: event.noteId ?? 'note_001' };
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

function createQueuedController(results) {
  return {
    async handleRenderEvent() {
      const result = results.shift();
      assert.ok(result, 'expected queued controller result');
      return result;
    },
  };
}

function createHost() {
  return {
    html: '',
    events: undefined,
    handler: undefined,
    renderCount: 0,
    setHtml(html) {
      this.html = html;
      this.renderCount += 1;
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
