import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NoteSurfaceHtmlRendererError,
  renderNoteSurfaceHtml,
} from '../../apps/web/src/noteSurfaceHtmlRenderer.ts';
import { createNoteSurfaceViewModel } from '../../apps/web/src/noteSurface.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('HTML renderer emits the note surface, editor, inline AI, memory, digest, and provenance DOM foundation', () => {
  const model = createNoteSurfaceViewModel(createMemoryCandidateDocument(), {
    workspaceName: 'MVP Workspace',
    editingBlockIds: ['block_paragraph_001'],
    inlineAiProjectionsVisible: true,
    memoryCandidatesVisible: true,
    returnLayerVisible: true,
    sourceSpanIdByBlockId: {
      block_ai_question_001: 'source_span_ai_question_001',
      block_ai_memory_candidate_001: 'source_span_memory_candidate_001',
    },
    expandedDigest: true,
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [
        { id: 'question_001', text: 'Clarify launch criteria.', sourceBlockId: 'block_paragraph_001' },
      ],
      decisions: [
        { id: 'decision_001', text: 'Keep writing flow uninterrupted.' },
      ],
      memoryCandidates: [
        { id: 'memory_candidate_001', text: 'Interested in editor ergonomics.' },
      ],
    },
    provenancePopover: {
      open: true,
      sourceBlockId: 'block_paragraph_001',
      sourceNoteId: noteDocumentFixture.note.id,
      sourceTitle: noteDocumentFixture.note.title,
      startOffset: 0,
      endOffset: 24,
      excerpt: 'The MVP should protect writing flow.',
      reason: 'Question derived from source block.',
    },
  });

  const { html, events } = renderNoteSurfaceHtml(model);

  assert.match(html, /data-layout="single_note_surface"/);
  assert.match(html, /ann-app--quiet-writing/);
  assert.match(html, /data-region="thinRail"/);
  assert.match(html, /data-action="manual_organize" data-target="writing_chrome" data-note-id="note_001"/);
  assert.match(html, /data-surface="single-note"/);
  assert.match(html, /data-component="block-editor"/);
  assert.match(html, /data-component="return-layer"/);
  assert.match(html, /整理された文脈/);
  assert.match(html, /編集/);
  assert.match(html, /削除/);
  assert.match(html, /持ち越す文脈/);
  assert.match(html, /<h2 class="ann-block-text ann-heading" data-block-editor-content="true" data-editor-composition-state="idle" data-empty-editor="false" role="textbox" aria-readonly="false" contenteditable="true" data-section-level="2" data-section-title="MVP scope">MVP scope<\/h2>/);
  assert.match(html, /data-block-id="block_paragraph_001"/);
  assert.match(html, /data-block-id="block_paragraph_001"[^>]*data-editor-layout-stability="block-identity"/);
  assert.match(html, /data-editor-state="editing"/);
  assert.match(html, /data-editor-save-status="dirty"/);
  assert.match(html, /data-editor-status-region="fixed" data-editor-layout-stability="status-reserved" data-editor-save-status="dirty" data-retry-available="false" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /data-block-editor-content="true" data-editor-composition-state="idle" data-empty-editor="false" role="textbox" aria-readonly="false" contenteditable="true"/);
  assert.match(html, /data-inline-ai-block="true"/);
  assert.match(html, /data-action="edit" data-target="ai_assist_block" data-block-id="block_ai_question_001"/);
  assert.match(html, /data-action="delete" data-target="ai_assist_block" data-block-id="block_ai_question_001"/);
  assert.match(html, /ann-return-layer--inline/);
  assert.match(html, /data-inline-memory-candidate="true"/);
  assert.match(html, /data-action="remember" data-target="memory_candidate_block" data-block-id="block_ai_memory_candidate_001"/);
  assert.match(html, /data-component="next-open-digest" data-available="true" data-expanded="true"/);
  assert.match(html, /前回からの整理/);
  assert.doesNotMatch(html, /本文に反映/);
  assert.match(html, /data-action="defer_return_layer"/);
  const aiAssistHtml = html.match(/<section class="ann-ai-assist-block"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(aiAssistHtml, /role="document" aria-readonly="true"/);
  assert.doesNotMatch(aiAssistHtml, /contenteditable="true"/);
  assert.match(html, /data-block-id="block_ai_memory_candidate_001"/);
  assert.match(html, /data-component="provenance-popover" data-open="true"/);
  assert.match(html, /data-action="close_provenance" data-target="provenance_popover"/);

  assert.equal(events.some((event) => (
    event.target === 'writing_chrome'
    && event.action === 'manual_organize'
    && event.apiIntent === 'note.manual_structure'
  )), true);
  assert.equal(events.some((event) => (
    event.target === 'block_editor'
    && event.action === 'save_block'
    && event.apiIntent === 'block.update'
  )), true);
  assert.equal(events.some((event) => (
    event.target === 'block_editor'
    && event.action === 'save_block'
    && event.blockId === 'block_heading_001'
    && event.blockType === 'heading'
    && event.apiIntent === 'block.update'
  )), true);
  assert.equal(events.some((event) => (
    event.target === 'ai_assist_block'
    && event.action === 'inspect_source'
    && event.apiIntent === 'provenance.lookup'
  )), true);
  assert.equal(events.some((event) => event.target === 'memory_candidate_block' && event.action === 'remember'), true);
  assert.equal(events.some((event) => event.target === 'return_layer' && event.action === 'close_return_layer'), true);
  assert.equal(events.some((event) => event.target === 'provenance_popover' && event.action === 'close_provenance'), true);
  assert.equal(events.every((event) => event.emitsAiProviderCall === false), true);
  assert.equal(events.every((event) => event.mutatesUserAuthoredBlock === false), true);
  assert.equal(events.every((event) => event.hiddenProfiling === false), true);
  assert.equal(events.every((event) => event.automaticActiveMemory === false), true);
});

test('HTML renderer exposes organized layer history without AI calls or raw editing surface', () => {
  const model = createNoteSurfaceViewModel(noteDocumentFixture, {
    organizationLayer: {
      status: 'updated',
      updatedLabel: '整理済み',
      canRestore: true,
    },
  });

  const { html, events } = renderNoteSurfaceHtml(model);

  assert.match(html, /data-component="organization-history"/);
  assert.match(html, /data-default-layer="organized"/);
  assert.match(html, /data-capture-editable="false"/);
  assert.match(html, /data-action="open_organization_history" data-target="organization_history"/);
  assert.doesNotMatch(html, /data-component="raw-editor"/);
  assert.equal(events.some((event) => (
    event.target === 'organization_history'
    && event.action === 'open_organization_history'
    && event.apiIntent === 'none'
    && event.emitsAiProviderCall === false
    && event.mutatesUserAuthoredBlock === false
  )), true);
});

test('HTML renderer renders AI proposal edit mode as projection editing without source-of-truth mutation', () => {
  const model = createNoteSurfaceViewModel(noteDocumentFixture, {
    editingBlockIds: ['block_ai_question_001'],
    inlineAiProjectionsVisible: true,
  });

  const { html, events } = renderNoteSurfaceHtml(model);

  assert.match(html, /data-inline-ai-block="true"[\s\S]*data-editing="true"[\s\S]*contenteditable="true"/);
  assert.match(html, /data-action="edit" data-target="ai_assist_block" data-block-id="block_ai_question_001"[^>]*>完了</);
  assert.doesNotMatch(html, /出典なし/);
  assert.equal(events.some((event) => (
    event.target === 'ai_assist_block'
    && event.action === 'edit'
    && event.blockId === 'block_ai_question_001'
    && event.apiIntent === 'none'
  )), true);
  assert.equal(events.some((event) => (
    event.target === 'block_editor'
    && event.blockId === 'block_ai_question_001'
  )), false);
});

test('HTML renderer keeps secondary AI projection blocks out of the default writing surface', () => {
  const { html, events } = renderNoteSurfaceHtml(createNoteSurfaceViewModel(createMemoryCandidateDocument()));

  assert.doesNotMatch(html, /整理された文脈/);
  assert.doesNotMatch(html, /Should the initial digest be collapsed by default\?/);
  assert.doesNotMatch(html, /持ち越す文脈/);
  assert.doesNotMatch(html, /出典なし/);
  assert.doesNotMatch(html, /data-inline-ai-block="true"/);
  assert.doesNotMatch(html, /data-inline-memory-candidate="true"/);
  assert.doesNotMatch(html, /data-target="ai_assist_block"/);
  assert.doesNotMatch(html, /data-target="memory_candidate_block"/);
  assert.equal(events.some((event) => event.target === 'ai_assist_block'), false);
  assert.equal(events.some((event) => event.target === 'memory_candidate_block'), false);
});

test('HTML renderer escapes note, block, digest, and provenance text', () => {
  const document = structuredClone(noteDocumentFixture);
  document.note.title = 'Title <script>alert("x")</script>';
  document.note.descriptionEffective = 'Description & <b>bold</b>';
  document.blocks[1].contentJson.text = 'User <img src=x onerror="alert(1)"> & note';
  document.blocks[1].plainText = 'User <img src=x onerror="alert(1)"> & note';

  const model = createNoteSurfaceViewModel(document, {
    returnLayerVisible: true,
    expandedDigest: true,
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [
        { id: 'question_unsafe', text: 'Digest <svg onload="alert(1)"> item' },
      ],
    },
    provenancePopover: {
      open: true,
      sourceTitle: 'Source "title" <unsafe>',
      excerpt: '<script>source()</script>',
      reason: 'Reason <b>not html</b>',
    },
  });

  const { html } = renderNoteSurfaceHtml(model);

  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<svg onload/);
  assert.doesNotMatch(html, /<b>not html<\/b>/);
  assert.match(html, /Title &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Description &amp; &lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /User &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; note/);
  assert.match(html, /Digest &lt;svg onload=&quot;alert\(1\)&quot;&gt; item/);
  assert.match(html, /&lt;script&gt;source\(\)&lt;\/script&gt;/);
});

test('HTML renderer keeps next-open digest re-entry out of the default writing surface', () => {
  const { html, events } = renderNoteSurfaceHtml(createNoteSurfaceViewModel(noteDocumentFixture, {
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [
        { id: 'question_001', text: 'MVP の優先順位を 3 つに整理' },
      ],
    },
    expandedDigest: true,
  }));

  assert.doesNotMatch(html, /前回から整理された入口/);
  assert.doesNotMatch(html, /前回からの整理/);
  assert.doesNotMatch(html, /MVP の優先順位を 3 つに整理/);
  assert.doesNotMatch(html, /data-component="return-layer"/);
  assert.doesNotMatch(html, /data-component="re-entry-surface"/);
  assert.equal(events.some((event) => event.target === 'next_open_digest'), false);
  assert.equal(events.some((event) => event.target === 're_entry_surface'), false);
  assert.equal(events.some((event) => event.target === 'return_layer'), false);
});

test('HTML renderer rejects MVP-excluded surfaces and render-unsafe action flags', () => {
  const model = createNoteSurfaceViewModel(noteDocumentFixture);
  const chatModel = structuredClone(model);
  chatModel.excludedSurfaces.persistentChatPanel = true;

  assert.throws(
    () => renderNoteSurfaceHtml(chatModel),
    (error) => {
      assert.equal(error instanceof NoteSurfaceHtmlRendererError, true);
      assert.match(error.message, /chat-first side surface/);
      return true;
    },
  );

  const unsafeActionModel = structuredClone(createNoteSurfaceViewModel(noteDocumentFixture, {
    inlineAiProjectionsVisible: true,
  }));
  const deleteAction = unsafeActionModel.noteSurface.blocks[2].aiAssist.actions.find((action) => action.id === 'delete');
  assert.ok(deleteAction);
  deleteAction.mutatesUserAuthoredBlock = true;

  assert.throws(
    () => renderNoteSurfaceHtml(unsafeActionModel),
    /AI assist action delete on block block_ai_question_001 is not render-safe/,
  );
});

test('HTML renderer source stays dependency-free and does not add non-MVP surfaces or direct runtime behavior', async () => {
  const source = await readFile(new URL('../../apps/web/src/noteSurfaceHtmlRenderer.ts', import.meta.url), 'utf8');
  const { html } = renderNoteSurfaceHtml(createNoteSurfaceViewModel(noteDocumentFixture));

  assert.match(source, /export function renderNoteSurfaceHtml/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|new Request|providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock\(/i);
  assert.doesNotMatch(html, /chat-panel|mode-switcher|integrations-dashboard|external-integrations/i);
});

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
