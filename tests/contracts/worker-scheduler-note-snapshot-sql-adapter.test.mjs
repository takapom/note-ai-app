import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  mapDirtySectionMarksLookupToSql,
  mapDirtySectionMarkRows,
  mapSectionRowsToContracts,
  mapSectionSnapshotLookupToSql,
  overlayDirtySectionMarks,
  TursoSchedulerNoteSnapshotAdapter,
} from '../../apps/worker/src/scheduler/schedulerNoteSnapshotSqlAdapter.ts';
import { runStructureTriggerSchedulerFlow } from '../../apps/worker/src/scheduler/structureSchedulerRuntimeFlow.ts';
import { noteFixture, sectionFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import {
  dirtyFlagSectionFixture,
  dirtySectionFixture,
  schedulerNow,
  unchangedSectionFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

test('scheduler note snapshot SQL lookup reads canonical sections by workspace and note', () => {
  assert.deepEqual(mapSectionSnapshotLookupToSql({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  }), {
    sql: [
      'select sections.id, sections.note_id, sections.parent_section_id, sections.heading_block_id, sections.heading_level, sections.title, sections.description_ai, sections.content_hash, sections.last_structured_hash, sections.last_structured_at, sections.position, sections.created_at, sections.updated_at',
      'from sections',
      'inner join notes on notes.id = sections.note_id',
      'where notes.workspace_id = ? and sections.note_id = ?',
      'order by sections.position asc, sections.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id],
  });

  assert.deepEqual(mapDirtySectionMarksLookupToSql({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  }), {
    sql: [
      'select target_scope, note_id, section_id, is_dirty, marked_at',
      'from agent_local_dirty_scope_marks',
      'where note_id = ?',
      'order by marked_at asc, section_id asc',
    ].join(' '),
    args: [noteFixture.id],
  });
});

test('scheduler note snapshot mapper converts section rows without carrying Turso dirty policy', () => {
  const rows = [
    sectionToRow({
      ...sectionFixture,
      isDirty: true,
    }),
    {
      id: 'section_minimal',
      note_id: noteFixture.id,
      parent_section_id: null,
      heading_block_id: null,
      heading_level: null,
      title: null,
      description_ai: null,
      content_hash: 'hash_section_minimal',
      last_structured_hash: null,
      last_structured_at: null,
      position: 1,
      created_at: schedulerNow,
      updated_at: schedulerNow,
    },
  ];

  assert.deepEqual(mapSectionRowsToContracts(rows), {
    ok: true,
    sections: [
      {
        id: sectionFixture.id,
        noteId: sectionFixture.noteId,
        headingBlockId: sectionFixture.headingBlockId,
        headingLevel: sectionFixture.headingLevel,
        title: sectionFixture.title,
        descriptionAi: sectionFixture.descriptionAi,
        contentHash: sectionFixture.contentHash,
        lastStructuredHash: sectionFixture.lastStructuredHash,
        lastStructuredAt: sectionFixture.lastStructuredAt,
        isDirty: false,
        position: sectionFixture.position,
        createdAt: sectionFixture.createdAt,
        updatedAt: sectionFixture.updatedAt,
      },
      {
        id: 'section_minimal',
        noteId: noteFixture.id,
        contentHash: 'hash_section_minimal',
        isDirty: false,
        position: 1,
        createdAt: schedulerNow,
        updatedAt: schedulerNow,
      },
    ],
  });
});

test('scheduler note snapshot mapper rejects invalid section and dirty rows without sentinels', () => {
  assert.deepEqual(mapSectionRowsToContracts([
    {
      id: '',
      note_id: ' note_001 ',
      content_hash: '',
      heading_level: 4,
      position: Number.NaN,
      created_at: schedulerNow,
      updated_at: Number.POSITIVE_INFINITY,
    },
  ]), {
    ok: false,
    errors: [
      'section rows[0].id must be a non-empty string',
      'section rows[0].note_id must be a non-empty string',
      'section rows[0].heading_level must be 1, 2, or 3 when provided',
      'section rows[0].content_hash must be a non-empty string',
      'section rows[0].position must be a finite number',
      'section rows[0].updated_at must be a finite number',
    ],
  });

  assert.deepEqual(mapDirtySectionMarkRows([
    { target_scope: 'section', note_id: noteFixture.id, section_id: '', is_dirty: 1, marked_at: schedulerNow },
    { target_scope: 'section', note_id: noteFixture.id, section_id: dirtySectionFixture.id, is_dirty: 'yes', marked_at: Number.NaN },
  ]), {
    ok: false,
    errors: [
      'dirty section mark rows[0].section_id must be a non-empty string',
      'dirty section mark rows[1].is_dirty must be boolean-like',
      'dirty section mark rows[1].marked_at must be a finite number',
    ],
  });
});

test('dirty mark row mapper uses latest valid mark and ignores wrong note or target scope', () => {
  assert.deepEqual(mapDirtySectionMarkRows([
    {
      target_scope: 'section',
      note_id: noteFixture.id,
      section_id: dirtySectionFixture.id,
      is_dirty: 1,
      marked_at: schedulerNow,
    },
    {
      target_scope: 'section',
      note_id: 'note_other',
      section_id: unchangedSectionFixture.id,
      is_dirty: 1,
      marked_at: schedulerNow + 1,
    },
    {
      target_scope: 'note',
      note_id: noteFixture.id,
      section_id: unchangedSectionFixture.id,
      is_dirty: 1,
      marked_at: schedulerNow + 2,
    },
    {
      target_scope: 'section',
      note_id: noteFixture.id,
      section_id: dirtySectionFixture.id,
      is_dirty: 0,
      marked_at: schedulerNow + 3,
    },
    {
      target_scope: 'section',
      note_id: noteFixture.id,
      section_id: unchangedSectionFixture.id,
      is_dirty: true,
      marked_at: schedulerNow + 4,
    },
  ], noteFixture.id), {
    ok: true,
    dirtySectionIds: [unchangedSectionFixture.id],
  });
});

test('scheduler note snapshot adapter overlays agent-local dirty marks only after canonical mapping', async () => {
  const sectionQueries = [];
  const dirtyQueries = [];
  const adapter = new TursoSchedulerNoteSnapshotAdapter({
    sectionExecutor: {
      async query(statement) {
        sectionQueries.push(statement);
        return [
          sectionToRow(dirtySectionFixture),
          sectionToRow(unchangedSectionFixture),
        ];
      },
    },
    dirtyMarkExecutor: {
      async query(statement) {
        dirtyQueries.push(statement);
        return [{
          target_scope: 'section',
          note_id: noteFixture.id,
          section_id: unchangedSectionFixture.id,
          is_dirty: 1,
          marked_at: schedulerNow,
        }];
      },
    },
  });

  const sections = await adapter.loadSections({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
  });

  assert.deepEqual(sectionQueries, [
    mapSectionSnapshotLookupToSql({
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
    }),
  ]);
  assert.deepEqual(dirtyQueries, [
    mapDirtySectionMarksLookupToSql({
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
    }),
  ]);
  assert.deepEqual(
    sections.map((section) => [section.id, section.isDirty]),
    [
      [dirtySectionFixture.id, false],
      [unchangedSectionFixture.id, true],
    ],
  );

  assert.deepEqual(
    overlayDirtySectionMarks([dirtySectionFixture, dirtyFlagSectionFixture], [dirtySectionFixture.id])
      .map((section) => [section.id, section.isDirty]),
    [
      [dirtySectionFixture.id, true],
      [dirtyFlagSectionFixture.id, true],
    ],
  );
});

test('scheduler note snapshot adapter failure stops scheduler flow before enqueue', async () => {
  let enqueueCount = 0;
  const adapter = new TursoSchedulerNoteSnapshotAdapter({
    sectionExecutor: {
      async query() {
        throw new Error('turso unavailable');
      },
    },
  });

  const result = await runStructureTriggerSchedulerFlow({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'note_closed',
    now: schedulerNow,
    ports: {
      noteSnapshot: adapter,
      structureJobQueue: {
        async listCompletedJobs() {
          throw new Error('completed jobs should not be queried after snapshot failure');
        },
        async enqueueJobs() {
          enqueueCount += 1;
          return { ok: true, enqueuedCount: 0, errors: [] };
        },
      },
      nextOpenDigestPreparation: {
        async prepareDigest() {
          return { ok: true, errors: [] };
        },
      },
    },
  });

  assert.equal(enqueueCount, 0);
  assert.equal(result.enqueue.attempted, false);
  assert.deepEqual(result.errors, ['section snapshot load failed: turso unavailable']);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('scheduler note snapshot SQL adapter does not mention forbidden runtime boundaries', async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/worker/src/scheduler/schedulerNoteSnapshotSqlAdapter.ts',
  );
  const source = await readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|provider SDK|generated/i);
});

function sectionToRow(section) {
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
