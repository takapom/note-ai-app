import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NoteSurfaceViewModelError,
  createNoteSurfaceViewModel,
  provenanceExcerptMaxChars,
} from '../../apps/web/src/noteSurface.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('web note surface exposes one AppShell with one note surface', () => {
  const model = createNoteSurfaceViewModel(noteDocumentFixture, {
    workspaceName: 'MVP Workspace',
  });

  assert.equal(model.appShell.layout, 'single_note_surface');
  assert.deepEqual(model.appShell.regions, ['sidebar', 'topBar', 'noteSurface']);
  assert.equal(model.sidebar.kind, 'Sidebar');
  assert.deepEqual(model.sidebar.items.map((item) => item.id), ['notes', 'recent', 'search']);
  assert.equal(model.topBar.workspaceName, 'MVP Workspace');
  assert.equal(model.noteSurface.kind, 'NoteSurface');
  assert.equal(model.noteSurface.noteHeader.title, noteDocumentFixture.note.title);
  assert.equal(model.noteSurface.blockEditor.emitsAiProviderCall, false);
});

test('web note surface renders only structural H1/H2/H3 heading blocks as section boundaries', () => {
  const document = createHeadingDocument();
  const model = createNoteSurfaceViewModel(document);

  assert.deepEqual(
    model.noteSurface.sectionBoundaries.map((boundary) => ({
      blockId: boundary.blockId,
      level: boundary.level,
      title: boundary.title,
    })),
    [
      { blockId: 'block_h1', level: 1, title: 'North star' },
      { blockId: 'block_h2', level: 2, title: 'MVP scope' },
      { blockId: 'block_h3', level: 3, title: 'Editor foundation' },
    ],
  );

  const styledParagraph = model.noteSurface.blocks.find((block) => block.id === 'block_styled_paragraph');
  assert.equal(styledParagraph?.sectionBoundary, undefined);
});

test('block editing actions remain available when AI status is failed', () => {
  const editingBlockId = 'block_paragraph_001';
  const model = createNoteSurfaceViewModel(noteDocumentFixture, {
    aiStatus: 'failed',
    editingBlockIds: [editingBlockId],
  });

  assert.equal(model.topBar.aiStatus, 'failed');
  assert.deepEqual(model.noteSurface.availableActions.blockEditor, ['edit_block', 'save_block', 'cancel_edit']);
  assert.equal(model.noteSurface.availableActions.emitsAiProviderCall, false);

  const editingBlock = model.noteSurface.blocks.find((block) => block.id === editingBlockId);
  assert.equal(editingBlock?.editor.state, 'editing');
  assert.equal(editingBlock?.editor.saveStatus, 'dirty');
  assert.equal(editingBlock?.editor.statusMessage, 'Unsaved changes');
  assert.deepEqual(editingBlock?.editor.actions, ['edit_block', 'save_block', 'cancel_edit']);
});

test('AI assist blocks expose inline action intents without direct user block mutation', () => {
  const model = createNoteSurfaceViewModel(noteDocumentFixture);
  const aiBlock = model.noteSurface.blocks.find((block) => block.type === 'ai_question');

  assert.equal(aiBlock?.aiAssist?.sourceInspectable, true);
  assert.equal(aiBlock?.aiAssist?.emitsAiProviderCall, false);
  assert.equal(aiBlock?.aiAssist?.mutatesUserAuthoredBlock, false);
  assert.deepEqual(aiBlock?.aiAssist?.actions.map((action) => action.id), [
    'edit',
    'adopt',
    'delete',
    'inspect_source',
  ]);
  assert.deepEqual(aiBlock?.aiAssist?.actions.map((action) => action.apiIntent), [
    'none',
    'POST /ai-operations/:operationId/accept',
    'POST /ai-operations/:operationId/dismiss',
    'provenance.lookup',
  ]);
  assert.deepEqual(aiBlock?.aiAssist?.actions.map((action) => action.emitsAiProviderCall), [
    false,
    false,
    false,
    false,
  ]);
});

test('memory candidate blocks expose review actions without hidden activation', () => {
  const model = createNoteSurfaceViewModel(createMemoryCandidateDocument());
  const memoryBlock = model.noteSurface.blocks.find((block) => block.type === 'ai_memory_candidate');

  assert.equal(memoryBlock?.memoryCandidate?.label, 'Memory candidate');
  assert.equal(memoryBlock?.memoryCandidate?.hiddenProfiling, false);
  assert.equal(memoryBlock?.memoryCandidate?.automaticActiveMemory, false);
  assert.equal(memoryBlock?.memoryCandidate?.emitsAiProviderCall, false);
  assert.deepEqual(memoryBlock?.memoryCandidate?.actions.map((action) => action.id), [
    'remember',
    'edit',
    'reject',
    'delete',
    'snooze',
  ]);
  assert.deepEqual(memoryBlock?.memoryCandidate?.actions.map((action) => action.apiIntent), [
    'POST /memory/:memoryId/accept',
    'POST /memory/:memoryId/edit',
    'POST /memory/:memoryId/reject',
    'POST /memory/:memoryId/delete',
    'POST /memory/:memoryId/hold',
  ]);
});

test('next open digest is compact, expandable, and does not invent unavailable content', () => {
  const unavailable = createNoteSurfaceViewModel(noteDocumentFixture, {
    nextOpenDigest: { available: false },
    expandedDigest: true,
  }).noteSurface.nextOpenDigest;

  assert.equal(unavailable.available, false);
  assert.equal(unavailable.compact, true);
  assert.equal(unavailable.expandable, true);
  assert.equal(unavailable.expanded, false);
  assert.equal(unavailable.emptyState, 'unavailable');
  assert.deepEqual(unavailable.sections, []);

  const empty = createNoteSurfaceViewModel(noteDocumentFixture, {
    nextOpenDigest: { available: true },
  }).noteSurface.nextOpenDigest;

  assert.equal(empty.available, true);
  assert.equal(empty.emptyState, 'no_items');
  assert.deepEqual(empty.sections, []);

  const expanded = createNoteSurfaceViewModel(noteDocumentFixture, {
    expandedDigest: true,
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [{ id: 'question_001', text: 'Clarify launch criteria.', sourceBlockId: 'block_paragraph_001' }],
      decisions: [{ id: 'decision_001', text: 'Keep writing flow uninterrupted.' }],
      relatedNotes: [],
      memoryCandidates: [{ id: 'memory_candidate_001', text: 'Interested in editor ergonomics.' }],
    },
  }).noteSurface.nextOpenDigest;

  assert.equal(expanded.expanded, true);
  assert.equal(expanded.emptyState, 'has_items');
  assert.deepEqual(expanded.sections.map((section) => section.id), [
    'unresolved_questions',
    'decisions',
    'memory_candidates',
  ]);
  assert.equal(expanded.emitsAiProviderCall, false);
});

test('provenance popover contains only bounded excerpt and source metadata', () => {
  const fullNoteText = 'full-note-text-'.repeat(80);
  const model = createNoteSurfaceViewModel(noteDocumentFixture, {
    provenancePopover: {
      open: true,
      sourceBlockId: 'block_paragraph_001',
      sourceNoteId: noteDocumentFixture.note.id,
      sourceTitle: noteDocumentFixture.note.title,
      startOffset: 0,
      endOffset: fullNoteText.length,
      excerpt: fullNoteText,
      reason: 'Question derived from the source block.',
    },
  });

  const popover = model.noteSurface.provenancePopover;
  assert.equal(popover.open, true);
  assert.equal(popover.includesFullNote, false);
  assert.equal(popover.includesFullWorkspace, false);
  assert.equal(popover.emitsAiProviderCall, false);
  assert.equal(popover.boundedExcerpt?.length, provenanceExcerptMaxChars);
  assert.notEqual(popover.boundedExcerpt, fullNoteText);
  assert.deepEqual(popover.source, {
    blockId: 'block_paragraph_001',
    noteId: noteDocumentFixture.note.id,
    title: noteDocumentFixture.note.title,
    startOffset: 0,
    endOffset: fullNoteText.length,
  });
});

test('AI failure digest and provenance state do not remove editing actions', () => {
  const editingBlockId = 'block_paragraph_001';
  const model = createNoteSurfaceViewModel(noteDocumentFixture, {
    aiStatus: 'failed',
    editingBlockIds: [editingBlockId],
    nextOpenDigest: { available: false },
    provenancePopover: { open: false },
  });

  assert.equal(model.noteSurface.nextOpenDigest.available, false);
  assert.equal(model.noteSurface.provenancePopover.open, false);
  assert.deepEqual(model.noteSurface.availableActions.blockEditor, ['edit_block', 'save_block', 'cancel_edit']);

  const editingBlock = model.noteSurface.blocks.find((block) => block.id === editingBlockId);
  assert.equal(editingBlock?.editor.state, 'editing');
  assert.deepEqual(editingBlock?.editor.actions, ['edit_block', 'save_block', 'cancel_edit']);
});

test('MVP-excluded surfaces are absent from the view model', () => {
  const model = createNoteSurfaceViewModel(noteDocumentFixture);
  const serialized = JSON.stringify(model);

  assert.deepEqual(model.excludedSurfaces, {
    persistentChatPanel: false,
    aiModeSwitcher: false,
    externalIntegrationsDashboard: false,
  });
  assert.doesNotMatch(serialized, /persistentChatPanel":true/);
  assert.doesNotMatch(serialized, /aiModeSwitcher":true/);
  assert.doesNotMatch(serialized, /externalIntegrationsDashboard":true/);
  assert.doesNotMatch(serialized, /"chatPanel":|"modeSwitcher":|"integrationsDashboard":/i);
  assert.doesNotMatch(serialized, /callProvider|providerAdapter|externalAction/i);
});

test('invalid note documents are rejected before view model creation', () => {
  assert.throws(
    () => createNoteSurfaceViewModel({
      ...noteDocumentFixture,
      blocks: [
        {
          ...noteDocumentFixture.blocks[1],
          type: 'paragraph',
          origin: 'ai',
          contentJson: { text: 'Styled text cannot become a heading boundary.', level: 2 },
        },
      ],
    }),
    (error) => {
      assert.equal(error instanceof NoteSurfaceViewModelError, true);
      assert.match(error.message, /block origin must match block type/);
      assert.match(error.message, /non-heading block content must not carry a heading level/);
      return true;
    },
  );
});

test('web note surface delegates document semantics to the Note Model contract', async () => {
  const source = await readFile(new URL('../../apps/web/src/noteSurface.ts', import.meta.url), 'utf8');

  assert.match(source, /validateNoteDocumentContract/);
  assert.doesNotMatch(source, /function validateSection|function validateDocumentReferences|function validateUniqueIds/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
});

function createHeadingDocument() {
  const now = 1_764_000_000_000;
  const note = {
    id: 'note_heading_sections',
    workspaceId: 'workspace_001',
    title: 'Heading sections',
    descriptionEffective: 'Heading sections',
    createdAt: now,
    updatedAt: now,
  };

  const sections = [
    createSection('section_h1', note.id, 'block_h1', 1, 0),
    createSection('section_h2', note.id, 'block_h2', 2, 1, 'section_h1'),
    createSection('section_h3', note.id, 'block_h3', 3, 2, 'section_h2'),
  ];

  const blocks = [
    createHeadingBlock('block_h1', note.id, 'section_h1', 1, 'North star', 0),
    createParagraphBlock('block_styled_paragraph', note.id, 'section_h1', 'BIG VISUAL TEXT', 1),
    createHeadingBlock('block_h2', note.id, 'section_h2', 2, 'MVP scope', 2),
    createHeadingBlock('block_h3', note.id, 'section_h3', 3, 'Editor foundation', 3),
  ];

  return { note, sections, blocks };
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

function createSection(id, noteId, headingBlockId, headingLevel, position, parentSectionId) {
  const now = 1_764_000_000_000;
  return {
    id,
    noteId,
    ...(parentSectionId === undefined ? {} : { parentSectionId }),
    headingBlockId,
    headingLevel,
    title: id,
    contentHash: `hash_${id}`,
    isDirty: false,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

function createHeadingBlock(id, noteId, sectionId, level, text, position) {
  const now = 1_764_000_000_000;
  return {
    id,
    noteId,
    sectionId,
    type: 'heading',
    contentJson: { text, level },
    plainText: text,
    position,
    origin: 'user',
    contentHash: `hash_${id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function createParagraphBlock(id, noteId, sectionId, text, position) {
  const now = 1_764_000_000_000;
  return {
    id,
    noteId,
    sectionId,
    type: 'paragraph',
    contentJson: { text },
    plainText: text,
    position,
    origin: 'user',
    contentHash: `hash_${id}`,
    createdAt: now,
    updatedAt: now,
  };
}
