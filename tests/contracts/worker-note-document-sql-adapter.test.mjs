import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  mapBlocksLookupToSql,
  mapNoteDocumentToSql,
  mapNoteLookupToSql,
  mapRowsToNoteDocument,
  mapSectionsLookupToSql,
  TursoNoteDocumentPersistenceAdapter,
} from '../../apps/worker/src/note-model/noteDocumentSqlAdapter.ts';
import {
  blockFixtures,
  noteDocumentFixture,
  noteFixture,
  sectionFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const loadRequest = {
  workspaceId: noteFixture.workspaceId,
  noteId: noteFixture.id,
};

test('note document SQL adapter maps canonical document saves to ordered notes sections blocks statements only', () => {
  const statements = mapNoteDocumentToSql(noteDocumentFixture);

  assert.equal(statements.length, 1 + 2 + noteDocumentFixture.sections.length + noteDocumentFixture.blocks.length);
  assert.match(statements[0].sql, /^insert into notes /);
  assert.deepEqual(statements[0].args.slice(0, 3), [
    noteFixture.id,
    noteFixture.workspaceId,
    noteFixture.title,
  ]);
  assert.deepEqual(statements.slice(1, 3), [
    {
      sql: 'delete from blocks where note_id = ?',
      args: [noteFixture.id],
    },
    {
      sql: 'delete from sections where note_id = ?',
      args: [noteFixture.id],
    },
  ]);
  assert.match(statements[3].sql, /^insert into sections /);
  assert.deepEqual(statements[3].args.slice(0, 8), [
    sectionFixture.id,
    noteFixture.id,
    null,
    'block_heading_001',
    2,
    'MVP scope',
    'A section about the MVP boundary.',
    'hash_section_001',
  ]);
  assert.match(statements[4].sql, /^insert into blocks /);
  assert.equal(statements[4].args[5], JSON.stringify(blockFixtures[0].contentJson));

  const statementText = statements.map((statement) => statement.sql).join('\n');
  assert.doesNotMatch(statementText, /\b(?:semantic_units|memory_items|ai_operations|source_spans|agent_local_)/i);
  assert.match(statementText, /\binsert into notes\b/i);
  assert.match(statementText, /\binsert into sections\b/i);
  assert.match(statementText, /\binsert into blocks\b/i);
});

test('note document SQL adapter loads document rows without sentinel values', async () => {
  const queries = [];
  const adapter = new TursoNoteDocumentPersistenceAdapter({
    async query(statement) {
      queries.push(statement);
      if (statement.sql.startsWith('select id, workspace_id')) return [noteRow(noteFixture)];
      if (statement.sql.startsWith('select id, note_id, parent_section_id')) return [sectionRow(sectionFixture)];
      if (statement.sql.startsWith('select id, note_id, section_id')) return blockFixtures.map(blockRow);
      throw new Error(`unexpected SQL: ${statement.sql}`);
    },
    async writeNoteDocument() {
      throw new Error('not used');
    },
  });

  const result = await adapter.loadDocument(loadRequest);

  assert.deepEqual(queries, [
    mapNoteLookupToSql(loadRequest),
    mapSectionsLookupToSql(loadRequest),
    mapBlocksLookupToSql(loadRequest),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.document, {
    note: noteFixture,
    sections: [{ ...sectionFixture, isDirty: false }],
    blocks: blockFixtures,
  });
});

test('note document SQL adapter rejects invalid and mismatched loaded rows', () => {
  const result = mapRowsToNoteDocument([
    {
      ...noteRow(noteFixture),
      id: 'note_other',
      workspace_id: 'workspace_other',
      title: '',
      description_ai_approved: 'yes',
      updated_at: Number.NaN,
    },
  ], [
    {
      ...sectionRow(sectionFixture),
      note_id: 'note_other',
      heading_level: 4,
      content_hash: '',
    },
  ], [
    {
      ...blockRow(blockFixtures[0]),
      note_id: 'note_other',
      section_id: 'section_missing',
      type: 'heading',
      content_json: JSON.stringify({ text: 'Invalid heading', level: 4 }),
    },
  ], loadRequest);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'note rows[0].id must match requested noteId',
    'note rows[0].workspace_id must match requested workspaceId',
    'note rows[0].title must be a non-empty string',
    'note rows[0].description_ai_approved must be boolean-like when provided',
    'note rows[0].updated_at must be a finite number',
  ]);
});

test('note document SQL adapter rejects cross reference errors after row mapping', () => {
  const result = mapRowsToNoteDocument([
    noteRow(noteFixture),
  ], [
    sectionRow(sectionFixture),
  ], [
    {
      ...blockRow(blockFixtures[0]),
      section_id: 'section_missing',
    },
  ], loadRequest);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'blocks[0].block sectionId must reference a document section',
    'sections[0].headingBlockId must reference a block in the same section',
  ]);
});

test('note document SQL adapter reports write and load infrastructure failures separately', async () => {
  const adapter = new TursoNoteDocumentPersistenceAdapter({
    async query() {
      throw new Error('read unavailable');
    },
    async writeNoteDocument() {
      throw new Error('write unavailable');
    },
  });

  assert.deepEqual(await adapter.saveDocument(noteDocumentFixture), {
    ok: false,
    errors: ['note document SQL write failed: write unavailable'],
  });
  assert.deepEqual(await adapter.loadDocument(loadRequest), {
    ok: false,
    errors: ['note document SQL load failed: read unavailable'],
  });
});

test('note document SQL adapter rejects invalid save input before writing', async () => {
  let writes = 0;
  const adapter = new TursoNoteDocumentPersistenceAdapter({
    async query() {
      return [];
    },
    async writeNoteDocument() {
      writes += 1;
    },
  });

  const result = await adapter.saveDocument({
    ...noteDocumentFixture,
    note: { ...noteFixture, id: '' },
  });

  assert.equal(result.ok, false);
  assert.equal(writes, 0);
  assert.deepEqual(result.errors, ['note.id must be a non-empty string']);
});

test('note document persistence source stays in Note Model persistence boundary', async () => {
  const source = await readFile(new URL('apps/worker/src/note-model/noteDocumentSqlAdapter.ts', root), 'utf8');
  const portSource = await readFile(new URL('apps/worker/src/note-model/noteDocumentPersistencePort.ts', root), 'utf8');
  const combined = `${source}\n${portSource}`;

  assert.doesNotMatch(combined, /operationRouter|OperationRouter|provider|ai_operations|source_spans|semantic_units|memory_items|agent_local_/);
  assert.doesNotMatch(combined, /from ['"].*docs\/generated\//);
});

function noteRow(note) {
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

function sectionRow(section) {
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

function blockRow(block) {
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
