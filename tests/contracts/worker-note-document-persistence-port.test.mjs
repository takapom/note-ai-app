import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryNoteDocumentPersistencePort,
  validateLoadRequest,
  validateNoteDocumentForPersistence,
} from '../../apps/worker/src/note-model/noteDocumentPersistencePort.ts';
import {
  blockFixtures,
  noteDocumentFixture,
  noteFixture,
  sectionFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('in-memory note document port saves and loads canonical Note Section Block documents', async () => {
  const port = new InMemoryNoteDocumentPersistencePort();

  const save = await port.saveDocument(noteDocumentFixture);
  const load = await port.loadDocument({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  });

  assert.equal(save.ok, true);
  assert.equal(load.ok, true);
  assert.deepEqual(load.document, noteDocumentFixture);
});

test('in-memory note document port returns cloned documents instead of mutable internal state', async () => {
  const port = new InMemoryNoteDocumentPersistencePort([noteDocumentFixture]);
  const first = await port.loadDocument({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  });

  first.document.blocks[0].contentJson.text = 'mutated outside the port';

  const second = await port.loadDocument({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  });

  assert.equal(second.document.blocks[0].contentJson.text, 'MVP scope');
});

test('note document persistence rejects invalid primitives and cross references without sentinels', async () => {
  const port = new InMemoryNoteDocumentPersistencePort();
  const result = await port.saveDocument({
    note: {
      ...noteFixture,
      title: '',
      updatedAt: Number.NaN,
    },
    sections: [
      {
        ...sectionFixture,
        noteId: 'note_other',
        headingLevel: 4,
        contentHash: '',
      },
    ],
    blocks: [
      {
        ...blockFixtures[0],
        noteId: 'note_other',
        sectionId: 'section_missing',
        contentJson: { text: 'large styled text is not a heading', level: 5 },
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('note.title must be a non-empty string'));
  assert.ok(result.errors.includes('note.updatedAt must be a finite timestamp'));
  assert.ok(result.errors.includes('sections[0].noteId must match document note.id'));
  assert.ok(result.errors.includes('sections[0].headingLevel must be H1, H2, or H3 when provided'));
  assert.ok(result.errors.includes('sections[0].contentHash must be a non-empty string'));
  assert.ok(result.errors.includes('blocks[0].heading block content level must be H1, H2, or H3'));
  assert.ok(result.errors.includes('blocks[0].block noteId must match document note.id'));
  assert.ok(result.errors.includes('blocks[0].block sectionId must reference a document section'));
});

test('note document persistence rejects duplicate section and block ids', () => {
  assert.deepEqual(validateNoteDocumentForPersistence({
    ...noteDocumentFixture,
    sections: [sectionFixture, { ...sectionFixture }],
    blocks: [blockFixtures[0], { ...blockFixtures[0] }],
  }).filter((error) => error.includes('must be unique')), [
    'sections[1].section id must be unique',
    'blocks[1].block id must be unique',
  ]);
});

test('note document persistence validates document-level section and block references', () => {
  assert.deepEqual(validateNoteDocumentForPersistence({
    ...noteDocumentFixture,
    sections: [
      {
        ...sectionFixture,
        parentSectionId: 'section_missing',
        headingBlockId: 'block_paragraph_001',
      },
    ],
    blocks: [
      blockFixtures[0],
      {
        ...blockFixtures[1],
        parentBlockId: 'block_missing',
      },
    ],
  }).filter((error) => error.includes('reference')), [
    'sections[0].parentSectionId must reference a document section',
    'sections[0].headingBlockId must reference a heading block',
    'blocks[1].parentBlockId must reference a document block',
  ]);
});

test('note document load request rejects invalid identity primitives', () => {
  assert.deepEqual(validateLoadRequest({
    workspaceId: ' ',
    noteId: '',
  }), [
    'workspaceId must be a non-empty string',
    'noteId must be a non-empty string',
  ]);
});
