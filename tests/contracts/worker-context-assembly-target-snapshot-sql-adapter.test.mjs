import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  mapNoteRowsToContextAssemblyNote,
  mapOutlineRowsToContextAssemblyOutline,
  mapTargetBlocksLookupToSql,
  mapTargetBlockRowsToContextAssemblyTarget,
  mapTargetNoteLookupToSql,
  mapTargetOutlineLookupToSql,
  TursoContextAssemblyTargetSnapshotAdapter,
} from '../../apps/worker/src/contextAssemblyTargetSnapshotSqlAdapter.ts';
import { blockFixtures, noteFixture, sectionFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const runtimeInput = {
  workspaceId: noteFixture.workspaceId,
  userId: 'user_001',
  noteId: noteFixture.id,
  structureJobId: 'structure_job_context_001',
  targetScope: 'section',
  targetId: sectionFixture.id,
  now: 1_764_000_200_000,
};

test('context assembly target snapshot SQL reads canonical note, outline, and section blocks by workspace and note', () => {
  assert.deepEqual(mapTargetNoteLookupToSql(runtimeInput), {
    sql: [
      'select notes.id, notes.workspace_id, notes.title, notes.description_user, notes.description_ai, notes.description_ai_approved',
      'from notes',
      'where notes.workspace_id = ? and notes.id = ?',
      'limit 2',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id],
  });

  assert.deepEqual(mapTargetOutlineLookupToSql(runtimeInput), {
    sql: [
      'select sections.id, sections.note_id, sections.heading_level, sections.title, sections.position',
      'from sections',
      'inner join notes on notes.id = sections.note_id',
      'where notes.workspace_id = ? and sections.note_id = ? and sections.heading_level is not null and sections.title is not null',
      'order by sections.position asc, sections.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id],
  });

  assert.deepEqual(mapTargetBlocksLookupToSql(runtimeInput), {
    sql: [
      'select blocks.id, blocks.note_id, blocks.section_id, blocks.type, blocks.plain_text, blocks.position, blocks.origin',
      'from blocks',
      'inner join notes on notes.id = blocks.note_id',
      'where notes.workspace_id = ? and blocks.note_id = ? and blocks.section_id = ? and blocks.origin = ?',
      'order by blocks.position asc, blocks.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id, sectionFixture.id, 'user'],
  });

  assert.deepEqual(mapTargetBlocksLookupToSql({
    ...runtimeInput,
    targetScope: 'note',
    targetId: undefined,
  }), {
    sql: [
      'select blocks.id, blocks.note_id, blocks.section_id, blocks.type, blocks.plain_text, blocks.position, blocks.origin',
      'from blocks',
      'inner join notes on notes.id = blocks.note_id',
      'where notes.workspace_id = ? and blocks.note_id = ? and blocks.origin = ?',
      'order by blocks.position asc, blocks.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id, 'user'],
  });
});

test('context assembly target snapshot row mappers convert canonical rows without sentinels', () => {
  assert.deepEqual(mapNoteRowsToContextAssemblyNote([noteToRow(noteFixture)], runtimeInput), {
    ok: true,
    note: {
      id: noteFixture.id,
      title: noteFixture.title,
      descriptionUser: noteFixture.descriptionUser,
      descriptionAi: noteFixture.descriptionAi,
      descriptionAiApproved: noteFixture.descriptionAiApproved,
    },
  });

  assert.deepEqual(mapOutlineRowsToContextAssemblyOutline([
    sectionToOutlineRow(sectionFixture),
  ], noteFixture.id), {
    ok: true,
    outline: [
      {
        sectionId: sectionFixture.id,
        title: sectionFixture.title,
        level: sectionFixture.headingLevel,
      },
    ],
  });

  assert.deepEqual(mapTargetBlockRowsToContextAssemblyTarget([
    blockToTargetRow(blockFixtures[0]),
    blockToTargetRow(blockFixtures[1]),
  ], runtimeInput), {
    ok: true,
    target: {
      scope: 'section',
      text: [
        blockFixtures[0].plainText,
        blockFixtures[1].plainText,
      ].join('\n'),
      sourceBlockIds: [blockFixtures[0].id, blockFixtures[1].id],
    },
  });
});

test('context assembly target snapshot mappers reject invalid and mismatched rows', () => {
  assert.deepEqual(mapNoteRowsToContextAssemblyNote([], runtimeInput), {
    ok: false,
    errors: ['note row must exist for requested workspaceId and noteId'],
  });

  assert.deepEqual(mapNoteRowsToContextAssemblyNote([
    {
      id: 'note_other',
      workspace_id: 'workspace_other',
      title: ' valid title with spaces ',
      description_user: '',
      description_ai: ' ai ',
      description_ai_approved: 'yes',
    },
  ], runtimeInput), {
    ok: false,
    errors: [
      'note rows[0].id must match requested noteId',
      'note rows[0].workspace_id must match requested workspaceId',
      'note rows[0].title must be a non-empty string',
      'note rows[0].description_user must be a non-empty string when provided',
      'note rows[0].description_ai must be a non-empty string when provided',
      'note rows[0].description_ai_approved must be boolean-like when provided',
    ],
  });

  assert.deepEqual(mapOutlineRowsToContextAssemblyOutline([
    {
      id: '',
      note_id: 'note_other',
      heading_level: 4,
      title: '',
      position: Number.NaN,
    },
  ], noteFixture.id), {
    ok: false,
    errors: [
      'outline rows[0].id must be a non-empty string',
      'outline rows[0].note_id must match requested noteId',
      'outline rows[0].title must be a non-empty string',
      'outline rows[0].heading_level must be 1, 2, or 3',
      'outline rows[0].position must be a finite number',
    ],
  });

  assert.deepEqual(mapTargetBlockRowsToContextAssemblyTarget([
    {
      id: '',
      note_id: 'note_other',
      section_id: 'section_other',
      type: 'ai_summary',
      plain_text: 1,
      position: Number.POSITIVE_INFINITY,
      origin: 'ai',
    },
  ], runtimeInput), {
    ok: false,
    errors: [
      'target block rows[0].id must be a non-empty string',
      'target block rows[0].note_id must match requested noteId',
      'target block rows[0].section_id must match requested targetId',
      'target block rows[0].type must be a user block type',
      'target block rows[0].plain_text must be a string',
      'target block rows[0].position must be a finite number',
      'target block rows[0].origin must be user',
    ],
  });

  assert.deepEqual(mapTargetBlockRowsToContextAssemblyTarget([], runtimeInput), {
    ok: false,
    errors: ['target must include at least one user-authored source block'],
  });
});

test('context assembly target snapshot adapter loads note, outline, and user-authored target text', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyTargetSnapshotAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        if (statement.sql.startsWith('select notes.')) return [noteToRow(noteFixture)];
        if (statement.sql.startsWith('select sections.')) return [sectionToOutlineRow(sectionFixture)];
        if (statement.sql.startsWith('select blocks.')) {
          return [
            blockToTargetRow(blockFixtures[0]),
            blockToTargetRow(blockFixtures[1]),
          ];
        }
        throw new Error(`unexpected SQL: ${statement.sql}`);
      },
    },
  });

  const snapshot = await adapter.loadTargetContext(runtimeInput);

  assert.deepEqual(queries, [
    mapTargetNoteLookupToSql(runtimeInput),
    mapTargetOutlineLookupToSql(runtimeInput),
    mapTargetBlocksLookupToSql(runtimeInput),
  ]);
  assert.deepEqual(snapshot, {
    target: {
      scope: 'section',
      text: [
        blockFixtures[0].plainText,
        blockFixtures[1].plainText,
      ].join('\n'),
      sourceBlockIds: [blockFixtures[0].id, blockFixtures[1].id],
    },
    note: {
      id: noteFixture.id,
      title: noteFixture.title,
      descriptionUser: noteFixture.descriptionUser,
      descriptionAi: noteFixture.descriptionAi,
      descriptionAiApproved: noteFixture.descriptionAiApproved,
    },
    outline: [
      {
        sectionId: sectionFixture.id,
        title: sectionFixture.title,
        level: sectionFixture.headingLevel,
      },
    ],
  });
});

test('context assembly target snapshot adapter rejects unsupported chunk scope before querying', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyTargetSnapshotAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        return [];
      },
    },
  });

  await assert.rejects(
    () => adapter.loadTargetContext({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
  assert.deepEqual(queries, []);
  assert.throws(
    () => mapTargetBlocksLookupToSql({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
});

test('context assembly target snapshot adapter requires section targetId and rejects section row mismatch', async () => {
  const adapter = new TursoContextAssemblyTargetSnapshotAdapter({
    executor: {
      async query() {
        throw new Error('executor should not be called without section targetId');
      },
    },
  });

  await assert.rejects(
    () => adapter.loadTargetContext({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
  assert.throws(
    () => mapTargetBlocksLookupToSql({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );

  assert.deepEqual(mapTargetBlockRowsToContextAssemblyTarget([
    {
      ...blockToTargetRow(blockFixtures[0]),
      section_id: 'section_other',
    },
  ], runtimeInput), {
    ok: false,
    errors: ['target block rows[0].section_id must match requested targetId'],
  });
});

test('context assembly target snapshot SQL adapter stays read-only and avoids unrelated runtime boundaries', async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/worker/src/contextAssemblyTargetSnapshotSqlAdapter.ts',
  );
  const source = await readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create table|alter table)\b/i);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|provider SDK|generated/i);
});

function noteToRow(note) {
  return {
    id: note.id,
    workspace_id: note.workspaceId,
    title: note.title,
    description_user: note.descriptionUser ?? null,
    description_ai: note.descriptionAi ?? null,
    description_ai_approved: note.descriptionAiApproved ?? null,
  };
}

function sectionToOutlineRow(section) {
  return {
    id: section.id,
    note_id: section.noteId,
    heading_level: section.headingLevel,
    title: section.title,
    position: section.position,
  };
}

function blockToTargetRow(block) {
  return {
    id: block.id,
    note_id: block.noteId,
    section_id: block.sectionId ?? null,
    type: block.type,
    plain_text: block.plainText,
    position: block.position,
    origin: block.origin,
  };
}
