import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NoteDocumentBlockCommandPort,
} from '../../apps/worker/src/note-model/noteBlockCommandPort.ts';
import {
  InMemoryNoteDocumentPersistencePort,
} from '../../apps/worker/src/note-model/noteDocumentPersistencePort.ts';
import {
  blockFixtures,
  noteDocumentFixture,
  noteFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_001_000_000;

test('note block command port creates blocks through canonical document persistence', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);
  const block = paragraphBlock({
    id: 'block_paragraph_002',
    text: 'A user-authored follow-up block.',
    position: 3,
  });

  const result = await port.createBlock({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    now,
    body: { block },
  });

  assert.equal(result.ok, true);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 1);
  assert.equal(result.body.block.id, 'block_paragraph_002');
  assert.equal(result.body.document.blocks.at(-1).plainText, 'A user-authored follow-up block.');
});

test('note block command port creates user-authored text blocks without frontend-generated ids', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence, {
    createBlockId() {
      return 'block_backend_created_001';
    },
  });

  const result = await port.createBlock({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    now,
    body: {
      content: 'Created by Worker from plain editor content.',
      afterBlockId: blockFixtures[1].id,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 1);
  assert.equal(result.body.block.id, 'block_backend_created_001');
  assert.equal(result.body.block.noteId, noteFixture.id);
  assert.equal(result.body.block.origin, 'user');
  assert.equal(result.body.block.type, 'paragraph');
  assert.equal(result.body.block.sectionId, blockFixtures[1].sectionId);
  assert.equal(result.body.block.plainText, 'Created by Worker from plain editor content.');
  assert.deepEqual(result.body.block.contentJson, {
    text: 'Created by Worker from plain editor content.',
  });
  assert.notEqual(result.body.document.sections[0].contentHash, noteDocumentFixture.sections[0].contentHash);
  assert.equal(result.body.document.sections[0].lastStructuredHash, noteDocumentFixture.sections[0].lastStructuredHash);
});

test('note block command port updates existing blocks without touching projections or AI runtime', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);
  const block = {
    ...blockFixtures[1],
    contentJson: { text: 'The MVP should protect writing flow and canonical blocks.' },
    plainText: 'The MVP should protect writing flow and canonical blocks.',
    contentHash: 'hash_block_paragraph_001_updated',
    updatedAt: now,
  };

  const result = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[1].id,
    now,
    body: { block },
  });

  assert.equal(result.ok, true);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 1);
  assert.equal(
    result.body.document.blocks.find((candidate) => candidate.id === blockFixtures[1].id).plainText,
    'The MVP should protect writing flow and canonical blocks.',
  );
});

test('note block command port updates user-authored text from explicit editor content', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const result = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[1].id,
    now,
    body: {
      noteId: noteFixture.id,
      content: 'Updated from the browser editor save action.',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 1);
  assert.equal(result.body.block.id, blockFixtures[1].id);
  assert.equal(result.body.block.noteId, noteFixture.id);
  assert.equal(result.body.block.origin, 'user');
  assert.equal(result.body.block.plainText, 'Updated from the browser editor save action.');
  assert.deepEqual(result.body.block.contentJson, {
    ...blockFixtures[1].contentJson,
    text: 'Updated from the browser editor save action.',
  });
  assert.equal(result.body.block.updatedAt, now);
  assert.match(result.body.block.contentHash, /^hash_block_paragraph_001_[a-f0-9]+$/);

  const savedSection = result.body.document.sections.find((candidate) => candidate.id === blockFixtures[1].sectionId);
  assert.equal(savedSection.title, 'MVP scope');
  assert.notEqual(savedSection.contentHash, noteDocumentFixture.sections[0].contentHash);
  assert.equal(savedSection.lastStructuredHash, noteDocumentFixture.sections[0].lastStructuredHash);
  assert.equal(savedSection.updatedAt, now);
});

test('note block command port updates heading text and owning section title from explicit save content', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const result = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[0].id,
    now,
    body: {
      noteId: noteFixture.id,
      content: 'Updated MVP scope',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 1);
  assert.equal(result.body.block.id, blockFixtures[0].id);
  assert.equal(result.body.block.type, 'heading');
  assert.equal(result.body.block.origin, 'user');
  assert.deepEqual(result.body.block.contentJson, {
    ...blockFixtures[0].contentJson,
    text: 'Updated MVP scope',
  });
  assert.equal(result.body.block.plainText, 'Updated MVP scope');
  assert.equal(result.body.block.updatedAt, now);

  const savedSection = result.body.document.sections.find((candidate) => candidate.id === blockFixtures[0].sectionId);
  assert.equal(savedSection.title, 'Updated MVP scope');
  assert.equal(savedSection.headingBlockId, blockFixtures[0].id);
  assert.equal(savedSection.headingLevel, blockFixtures[0].contentJson.level);
  assert.notEqual(savedSection.contentHash, noteDocumentFixture.sections[0].contentHash);
  assert.equal(savedSection.lastStructuredHash, noteDocumentFixture.sections[0].lastStructuredHash);
  assert.equal(savedSection.updatedAt, now);
});

test('note block command port deletes existing blocks from the canonical document only', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const result = await port.deleteBlock({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    blockId: blockFixtures[1].id,
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 1);
  assert.equal(result.body.blockId, blockFixtures[1].id);
  assert.equal(
    result.body.document.blocks.some((candidate) => candidate.id === blockFixtures[1].id),
    false,
  );
});

test('note block command port rejects invalid identity and body primitives before persistence', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const result = await port.createBlock({
    workspaceId: 'workspace_unset',
    noteId: 'note_001',
    now: Number.NaN,
    body: { block: { ...blockFixtures[1], id: 'block_placeholder' } },
  });

  assert.equal(result.ok, false);
  assert.equal(persistence.loads, 0);
  assert.equal(persistence.saves, 0);
  assert.ok(result.errors.includes('workspaceId must be a stable non-sentinel runtime id'));
  assert.ok(result.errors.includes('now must be a finite number'));
  assert.ok(result.errors.includes('block.id must be a stable non-sentinel runtime id'));

  const bodyResult = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[1].id,
    now,
    body: { block: 'draft' },
  });

  assert.equal(bodyResult.ok, false);
  assert.equal(persistence.loads, 0);
  assert.equal(persistence.saves, 0);
  assert.deepEqual(bodyResult.errors, ['body.block must be provided as an object']);

  const textBodyResult = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[1].id,
    now,
    body: { noteId: noteFixture.id, content: '   ' },
  });

  assert.equal(textBodyResult.ok, false);
  assert.equal(persistence.loads, 0);
  assert.equal(persistence.saves, 0);
  assert.deepEqual(textBodyResult.errors, ['body.content must be a non-empty string']);
});

test('note block command port rejects Note Model block validation and document-level validation before saving', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const invalidBlockContract = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[1].id,
    now,
    body: {
      block: {
        ...blockFixtures[1],
        contentJson: { text: 'large styled text is not a heading', level: 2 },
      },
    },
  });

  assert.equal(invalidBlockContract.ok, false);
  assert.equal(persistence.loads, 0);
  assert.equal(persistence.saves, 0);
  assert.ok(invalidBlockContract.errors.includes('non-heading block content must not carry a heading level'));

  const invalidDocument = await port.createBlock({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    now,
    body: {
      block: paragraphBlock({
        id: 'block_paragraph_003',
        text: 'This points at a missing section.',
        position: 3,
        sectionId: 'section_missing',
      }),
    },
  });

  assert.equal(invalidDocument.ok, false);
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 0);
  assert.ok(invalidDocument.errors.includes('blocks[3].block sectionId must reference a document section'));
});

test('note block command port rejects missing blocks and noteId mismatches', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const missingUpdate = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: 'block_missing',
    now,
    body: {
      block: paragraphBlock({
        id: 'block_missing',
        text: 'Cannot update a block outside the canonical document.',
        position: 9,
      }),
    },
  });
  assert.equal(missingUpdate.ok, false);
  assert.deepEqual(missingUpdate.errors, ['block not found']);

  const missingDelete = await port.deleteBlock({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    blockId: 'block_missing',
    now,
  });
  assert.equal(missingDelete.ok, false);
  assert.deepEqual(missingDelete.errors, ['block not found']);

  const mismatch = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    blockId: blockFixtures[1].id,
    now,
    body: {
      block: {
        ...blockFixtures[1],
        noteId: 'note_other',
      },
    },
  });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.errors.includes('block.noteId must match noteId'));
  assert.equal(persistence.saves, 0);
});

test('note block command port rejects editor text updates for non-user blocks', async () => {
  const persistence = new TrackingPersistence([noteDocumentFixture]);
  const port = new NoteDocumentBlockCommandPort(persistence);

  const aiBlock = await port.updateBlock({
    workspaceId: noteFixture.workspaceId,
    blockId: blockFixtures[2].id,
    now,
    body: {
      noteId: noteFixture.id,
      content: 'Attempted AI block edit.',
    },
  });

  assert.equal(aiBlock.ok, false);
  assert.deepEqual(aiBlock.errors, ['only user-authored blocks can be updated from editor text content']);
  assert.equal(persistence.saves, 0);
});

test('note block command port rejects heading text updates when the section boundary is inconsistent', async () => {
  const cases = [
    {
      name: 'missing section id',
      document: {
        ...noteDocumentFixture,
        blocks: noteDocumentFixture.blocks.map((block) => (
          block.id === blockFixtures[0].id ? withoutKey(block, 'sectionId') : block
        )),
      },
      errors: [
        'heading block sectionId must reference its owning section',
        'heading block sectionId must reference a document section',
      ],
    },
    {
      name: 'missing section',
      document: {
        ...noteDocumentFixture,
        blocks: noteDocumentFixture.blocks.map((block) => (
          block.id === blockFixtures[0].id ? { ...block, sectionId: 'section_missing' } : block
        )),
      },
      errors: ['heading block sectionId must reference a document section'],
    },
    {
      name: 'heading block mismatch',
      document: {
        ...noteDocumentFixture,
        sections: noteDocumentFixture.sections.map((section) => ({
          ...section,
          headingBlockId: 'block_heading_other',
        })),
      },
      errors: ['section.headingBlockId must match heading block id'],
    },
    {
      name: 'heading level mismatch',
      document: {
        ...noteDocumentFixture,
        sections: noteDocumentFixture.sections.map((section) => ({
          ...section,
          headingLevel: 3,
        })),
      },
      errors: ['section.headingLevel must match heading block level'],
    },
  ];

  for (const fixture of cases) {
    const persistence = new LooseTrackingPersistence(fixture.document);
    const port = new NoteDocumentBlockCommandPort(persistence);

    const result = await port.updateBlock({
      workspaceId: noteFixture.workspaceId,
      blockId: blockFixtures[0].id,
      now,
      body: {
        noteId: noteFixture.id,
        content: 'Rejected heading update.',
      },
    });

    assert.equal(result.ok, false, fixture.name);
    assert.deepEqual(result.errors, fixture.errors, fixture.name);
    assert.equal(persistence.saves, 0, fixture.name);
  }
});

test('note block command port source stays inside Note Model and persistence boundaries', async () => {
  const source = await readFile(new URL('apps/worker/src/note-model/noteBlockCommandPort.ts', root), 'utf8');

  assert.doesNotMatch(source, /from ['"].*workerHttpRouter/);
  assert.doesNotMatch(source, /from ['"].*(scheduler|context-assembly|ai-operations|memory)/);
  assert.doesNotMatch(source, /OperationRouter|providerRegistry|audit|source_spans|semantic_units|memory_items/);
  assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from)\s+[`"]?(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_items)[`"]?\b/i);
});

class TrackingPersistence {
  loads = 0;
  saves = 0;
  savedDocuments = [];

  constructor(initialDocuments) {
    this.inner = new InMemoryNoteDocumentPersistencePort(initialDocuments);
  }

  async loadDocument(input) {
    this.loads += 1;
    return this.inner.loadDocument(input);
  }

  async saveDocument(document) {
    this.saves += 1;
    this.savedDocuments.push(structuredClone(document));
    return this.inner.saveDocument(document);
  }
}

class LooseTrackingPersistence {
  loads = 0;
  saves = 0;

  constructor(document) {
    this.document = structuredClone(document);
  }

  async loadDocument() {
    this.loads += 1;
    return {
      ok: true,
      errors: [],
      document: structuredClone(this.document),
    };
  }

  async saveDocument() {
    this.saves += 1;
    return {
      ok: false,
      errors: ['unexpected save for invalid boundary fixture'],
    };
  }
}

function paragraphBlock({ id, text, position, sectionId = blockFixtures[1].sectionId }) {
  return {
    id,
    noteId: noteFixture.id,
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

function withoutKey(object, key) {
  const clone = { ...object };
  delete clone[key];
  return clone;
}
