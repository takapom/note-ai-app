import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NoteSurfaceViewModelError,
  createNoteSurfaceViewModel,
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
