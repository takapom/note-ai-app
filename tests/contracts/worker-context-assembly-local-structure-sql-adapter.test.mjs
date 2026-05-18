import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  mapLocalPreviousStructureSnapshotLookupToSql,
  mapLocalSectionSummariesLookupToSql,
  mapLocalSemanticUnitsLookupToSql,
  mapPreviousStructureSnapshotRowsToLocalStructureSnapshot,
  mapSectionSummaryRowsToLocalStructureSectionSummaries,
  mapSemanticUnitRowsToLocalStructureSemanticUnits,
  TursoContextAssemblyLocalStructureSqlAdapter,
} from '../../apps/worker/src/contextAssemblyLocalStructureSqlAdapter.ts';
import { noteFixture, sectionFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const runtimeInput = {
  workspaceId: noteFixture.workspaceId,
  userId: 'user_001',
  noteId: noteFixture.id,
  structureJobId: 'structure_job_context_001',
  targetScope: 'section',
  targetId: sectionFixture.id,
  now: 1_764_000_300_000,
};

test('context assembly local structure SQL reads same-note projection tables by workspace and section target', () => {
  assert.deepEqual(mapLocalSemanticUnitsLookupToSql(runtimeInput), {
    sql: [
      'select semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, semantic_units.relevance_score, semantic_units.updated_at, semantic_units.position',
      'from semantic_units',
      'inner join notes on notes.id = semantic_units.note_id',
      'where notes.workspace_id = ? and semantic_units.note_id = ? and semantic_units.section_id = ?',
      'order by semantic_units.position asc, semantic_units.updated_at desc, semantic_units.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id, sectionFixture.id],
  });

  assert.deepEqual(mapLocalSectionSummariesLookupToSql(runtimeInput), {
    sql: [
      'select semantic_unit_section_summaries.note_id, semantic_unit_section_summaries.section_id, semantic_unit_section_summaries.title, semantic_unit_section_summaries.summary, semantic_unit_section_summaries.source_block_ids, semantic_unit_section_summaries.updated_at, semantic_unit_section_summaries.position',
      'from semantic_unit_section_summaries',
      'inner join notes on notes.id = semantic_unit_section_summaries.note_id',
      'where notes.workspace_id = ? and semantic_unit_section_summaries.note_id = ? and semantic_unit_section_summaries.section_id = ?',
      'order by semantic_unit_section_summaries.position asc, semantic_unit_section_summaries.updated_at desc, semantic_unit_section_summaries.section_id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id, sectionFixture.id],
  });

  assert.deepEqual(mapLocalPreviousStructureSnapshotLookupToSql(runtimeInput), {
    sql: [
      'select semantic_unit_structure_snapshots.snapshot_id, semantic_unit_structure_snapshots.note_id, semantic_unit_structure_snapshots.section_id, semantic_unit_structure_snapshots.semantic_unit_ids, semantic_unit_structure_snapshots.summary, semantic_unit_structure_snapshots.generated_at',
      'from semantic_unit_structure_snapshots',
      'inner join notes on notes.id = semantic_unit_structure_snapshots.note_id',
      'where notes.workspace_id = ? and semantic_unit_structure_snapshots.note_id = ? and semantic_unit_structure_snapshots.section_id = ?',
      'order by semantic_unit_structure_snapshots.generated_at desc, semantic_unit_structure_snapshots.snapshot_id desc',
      'limit 1',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id, sectionFixture.id],
  });
});

test('context assembly local structure SQL reads note-level projection scope without section filtering', () => {
  const noteInput = {
    ...runtimeInput,
    targetScope: 'note',
  };
  delete noteInput.targetId;

  assert.deepEqual(mapLocalSemanticUnitsLookupToSql(noteInput), {
    sql: [
      'select semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, semantic_units.relevance_score, semantic_units.updated_at, semantic_units.position',
      'from semantic_units',
      'inner join notes on notes.id = semantic_units.note_id',
      'where notes.workspace_id = ? and semantic_units.note_id = ?',
      'order by semantic_units.position asc, semantic_units.updated_at desc, semantic_units.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id],
  });

  assert.deepEqual(mapLocalSectionSummariesLookupToSql(noteInput), {
    sql: [
      'select semantic_unit_section_summaries.note_id, semantic_unit_section_summaries.section_id, semantic_unit_section_summaries.title, semantic_unit_section_summaries.summary, semantic_unit_section_summaries.source_block_ids, semantic_unit_section_summaries.updated_at, semantic_unit_section_summaries.position',
      'from semantic_unit_section_summaries',
      'inner join notes on notes.id = semantic_unit_section_summaries.note_id',
      'where notes.workspace_id = ? and semantic_unit_section_summaries.note_id = ?',
      'order by semantic_unit_section_summaries.position asc, semantic_unit_section_summaries.updated_at desc, semantic_unit_section_summaries.section_id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id],
  });

  assert.deepEqual(mapLocalPreviousStructureSnapshotLookupToSql(noteInput), {
    sql: [
      'select semantic_unit_structure_snapshots.snapshot_id, semantic_unit_structure_snapshots.note_id, semantic_unit_structure_snapshots.section_id, semantic_unit_structure_snapshots.semantic_unit_ids, semantic_unit_structure_snapshots.summary, semantic_unit_structure_snapshots.generated_at',
      'from semantic_unit_structure_snapshots',
      'inner join notes on notes.id = semantic_unit_structure_snapshots.note_id',
      'where notes.workspace_id = ? and semantic_unit_structure_snapshots.note_id = ? and semantic_unit_structure_snapshots.section_id is null',
      'order by semantic_unit_structure_snapshots.generated_at desc, semantic_unit_structure_snapshots.snapshot_id desc',
      'limit 1',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id],
  });
});

test('context assembly local structure row mappers convert projection rows without sentinels', () => {
  assert.deepEqual(mapSemanticUnitRowsToLocalStructureSemanticUnits([
    semanticUnitRow({
      id: 'unit_local_001',
      source_block_ids: JSON.stringify(['block_heading_001', 'block_paragraph_001']),
    }),
    semanticUnitRow({
      id: 'unit_local_002',
      title: null,
      source_block_ids: null,
      source_block_id: 'block_paragraph_002',
      source_start_offset: null,
      source_end_offset: null,
      confidence: null,
      relevance_score: null,
    }),
  ], runtimeInput), {
    ok: true,
    existingSemanticUnits: [
      {
        id: 'unit_local_001',
        noteId: noteFixture.id,
        sectionId: sectionFixture.id,
        title: 'Writing flow first',
        summary: 'The MVP prioritizes uninterrupted user writing.',
        sourceBlockIds: ['block_heading_001', 'block_paragraph_001'],
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
      },
      {
        id: 'unit_local_002',
        noteId: noteFixture.id,
        sectionId: sectionFixture.id,
        summary: 'The MVP prioritizes uninterrupted user writing.',
        sourceBlockIds: ['block_paragraph_002'],
      },
    ],
  });

  assert.deepEqual(mapSectionSummaryRowsToLocalStructureSectionSummaries([
    sectionSummaryRow(),
  ], runtimeInput), {
    ok: true,
    sectionSummaries: [
      {
        sectionId: sectionFixture.id,
        title: 'MVP scope',
        summary: 'The section defines MVP boundaries around writing flow.',
        sourceBlockIds: ['block_heading_001', 'block_paragraph_001'],
      },
    ],
  });

  assert.deepEqual(mapPreviousStructureSnapshotRowsToLocalStructureSnapshot([
    previousSnapshotRow(),
  ], runtimeInput), {
    ok: true,
    snapshot: {
      snapshotId: 'snapshot_001',
      semanticUnitIds: ['unit_local_001', 'unit_local_002'],
      summary: 'Earlier snapshot before the section was edited.',
      generatedAt: 1_764_000_200_000,
    },
  });
});

test('context assembly local structure mappers reject invalid and mismatched projection rows', () => {
  assert.deepEqual(mapSemanticUnitRowsToLocalStructureSemanticUnits([
    {
      id: '',
      note_id: 'note_other',
      section_id: 'section_other',
      title: ' invalid title ',
      summary: '',
      source_block_ids: JSON.stringify(['block_valid', ' invalid_block ']),
      source_block_id: ' invalid_block ',
      source_start_offset: Number.NaN,
      source_end_offset: 2,
      confidence: 1.2,
      relevance_score: 'high',
      updated_at: 'later',
      position: Number.POSITIVE_INFINITY,
    },
  ], runtimeInput), {
    ok: false,
    errors: [
      'semantic unit rows[0].id must be a non-empty string',
      'semantic unit rows[0].note_id must match requested noteId',
      'semantic unit rows[0].section_id must match requested targetId',
      'semantic unit rows[0].title must be a non-empty string when provided',
      'semantic unit rows[0].summary must be a non-empty string',
      'semantic unit rows[0].source_block_id must be a non-empty string when provided',
      'semantic unit rows[0].source_block_ids must be a JSON array or string array of non-empty strings',
      'semantic unit rows[0].source_start_offset must be a finite number when provided',
      'semantic unit rows[0].confidence must be a finite number between 0 and 1 when provided',
      'semantic unit rows[0].relevance_score must be a finite number when provided',
      'semantic unit rows[0].updated_at must be a finite number when provided',
      'semantic unit rows[0].position must be a finite number when provided',
    ],
  });

  assert.deepEqual(mapSectionSummaryRowsToLocalStructureSectionSummaries([
    {
      note_id: 'note_other',
      section_id: '',
      title: ' invalid title ',
      summary: '',
      source_block_ids: 'not-json',
      updated_at: 'later',
      position: Number.NaN,
    },
  ], runtimeInput), {
    ok: false,
    errors: [
      'section summary rows[0].note_id must match requested noteId',
      'section summary rows[0].section_id must be a non-empty string',
      'section summary rows[0].title must be a non-empty string when provided',
      'section summary rows[0].summary must be a non-empty string',
      'section summary rows[0].source_block_ids must be a JSON array or string array of non-empty strings',
      'section summary rows[0].updated_at must be a finite number when provided',
      'section summary rows[0].position must be a finite number when provided',
    ],
  });

  assert.deepEqual(mapPreviousStructureSnapshotRowsToLocalStructureSnapshot([
    {
      snapshot_id: '',
      note_id: 'note_other',
      section_id: 'section_other',
      semantic_unit_ids: JSON.stringify(['unit_valid', ' invalid_unit ']),
      summary: '',
      generated_at: Number.NaN,
    },
  ], runtimeInput), {
    ok: false,
    errors: [
      'previous structure snapshot rows[0].snapshot_id must be a non-empty string',
      'previous structure snapshot rows[0].note_id must match requested noteId',
      'previous structure snapshot rows[0].section_id must match requested targetId',
      'previous structure snapshot rows[0].semantic_unit_ids must be a JSON array or string array of non-empty strings',
      'previous structure snapshot rows[0].summary must be a non-empty string',
      'previous structure snapshot rows[0].generated_at must be a finite number',
    ],
  });

  assert.deepEqual(mapPreviousStructureSnapshotRowsToLocalStructureSnapshot([
    previousSnapshotRow({ snapshot_id: 'snapshot_001' }),
    previousSnapshotRow({ snapshot_id: 'snapshot_002' }),
  ], runtimeInput), {
    ok: false,
    errors: ['previous structure snapshot lookup must return at most one row'],
  });
});

test('context assembly local structure adapter loads projection rows in SQL result order', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyLocalStructureSqlAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        if (statement.sql.startsWith('select semantic_units.')) {
          return [
            semanticUnitRow({ id: 'unit_local_001', source_block_ids: ['block_paragraph_001'] }),
            semanticUnitRow({ id: 'unit_local_002', title: 'Second unit', source_block_ids: ['block_paragraph_002'] }),
          ];
        }
        if (statement.sql.startsWith('select semantic_unit_section_summaries.')) {
          return [sectionSummaryRow()];
        }
        if (statement.sql.startsWith('select semantic_unit_structure_snapshots.')) {
          return [previousSnapshotRow()];
        }
        throw new Error(`unexpected SQL: ${statement.sql}`);
      },
    },
  });

  const localStructure = await adapter.loadLocalStructure(runtimeInput);

  assert.deepEqual(queries, [
    mapLocalSemanticUnitsLookupToSql(runtimeInput),
    mapLocalSectionSummariesLookupToSql(runtimeInput),
    mapLocalPreviousStructureSnapshotLookupToSql(runtimeInput),
  ]);
  assert.deepEqual(localStructure, {
    existingSemanticUnits: [
      {
        id: 'unit_local_001',
        noteId: noteFixture.id,
        sectionId: sectionFixture.id,
        title: 'Writing flow first',
        summary: 'The MVP prioritizes uninterrupted user writing.',
        sourceBlockIds: ['block_paragraph_001'],
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
      },
      {
        id: 'unit_local_002',
        noteId: noteFixture.id,
        sectionId: sectionFixture.id,
        title: 'Second unit',
        summary: 'The MVP prioritizes uninterrupted user writing.',
        sourceBlockIds: ['block_paragraph_002'],
        sourceSpan: {
          sourceBlockId: 'block_paragraph_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.91,
        relevanceScore: 0.7,
      },
    ],
    sectionSummaries: [
      {
        sectionId: sectionFixture.id,
        title: 'MVP scope',
        summary: 'The section defines MVP boundaries around writing flow.',
        sourceBlockIds: ['block_heading_001', 'block_paragraph_001'],
      },
    ],
    previousStructureSnapshot: {
      snapshotId: 'snapshot_001',
      semanticUnitIds: ['unit_local_001', 'unit_local_002'],
      summary: 'Earlier snapshot before the section was edited.',
      generatedAt: 1_764_000_200_000,
    },
  });
});

test('context assembly local structure adapter omits previous snapshot when projection has none', async () => {
  const adapter = new TursoContextAssemblyLocalStructureSqlAdapter({
    executor: {
      async query(statement) {
        if (statement.sql.startsWith('select semantic_units.')) return [semanticUnitRow()];
        if (statement.sql.startsWith('select semantic_unit_section_summaries.')) return [sectionSummaryRow()];
        if (statement.sql.startsWith('select semantic_unit_structure_snapshots.')) return [];
        throw new Error(`unexpected SQL: ${statement.sql}`);
      },
    },
  });

  const localStructure = await adapter.loadLocalStructure(runtimeInput);

  assert.equal('previousStructureSnapshot' in localStructure, false);
  assert.equal(localStructure.existingSemanticUnits.length, 1);
  assert.equal(localStructure.sectionSummaries.length, 1);
  assert.deepEqual(mapPreviousStructureSnapshotRowsToLocalStructureSnapshot([], runtimeInput), { ok: true });
});

test('context assembly local structure adapter rejects unsupported chunk scope before querying', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyLocalStructureSqlAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        return [];
      },
    },
  });

  await assert.rejects(
    () => adapter.loadLocalStructure({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
  assert.deepEqual(queries, []);
  assert.throws(
    () => mapLocalSemanticUnitsLookupToSql({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
});

test('context assembly local structure adapter requires section targetId', async () => {
  const adapter = new TursoContextAssemblyLocalStructureSqlAdapter({
    executor: {
      async query() {
        throw new Error('executor should not be called without section targetId');
      },
    },
  });

  await assert.rejects(
    () => adapter.loadLocalStructure({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
  assert.throws(
    () => mapLocalSectionSummariesLookupToSql({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
});

test('context assembly local structure SQL adapter stays read-only and avoids unrelated runtime boundaries', async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/worker/src/contextAssemblyLocalStructureSqlAdapter.ts',
  );
  const source = await readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create table|alter table)\b/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|memory_items|provider|ai-sdk/i);
  assert.doesNotMatch(source, /from blocks|join blocks|from sections|join sections|source_spans/i);
  assert.match(source, /from semantic_units/);
  assert.match(source, /from semantic_unit_section_summaries/);
  assert.match(source, /from semantic_unit_structure_snapshots/);
  assert.match(source, /inner join notes/);
});

function semanticUnitRow(overrides = {}) {
  return {
    id: 'unit_local_001',
    note_id: noteFixture.id,
    section_id: sectionFixture.id,
    title: 'Writing flow first',
    summary: 'The MVP prioritizes uninterrupted user writing.',
    source_block_ids: ['block_paragraph_001'],
    source_block_id: 'block_paragraph_001',
    source_start_offset: 0,
    source_end_offset: 18,
    confidence: 0.91,
    relevance_score: 0.7,
    updated_at: 1_764_000_100_000,
    position: 1,
    ...overrides,
  };
}

function sectionSummaryRow(overrides = {}) {
  return {
    note_id: noteFixture.id,
    section_id: sectionFixture.id,
    title: 'MVP scope',
    summary: 'The section defines MVP boundaries around writing flow.',
    source_block_ids: JSON.stringify(['block_heading_001', 'block_paragraph_001']),
    updated_at: 1_764_000_100_000,
    position: 1,
    ...overrides,
  };
}

function previousSnapshotRow(overrides = {}) {
  return {
    snapshot_id: 'snapshot_001',
    note_id: noteFixture.id,
    section_id: sectionFixture.id,
    semantic_unit_ids: JSON.stringify(['unit_local_001', 'unit_local_002']),
    summary: 'Earlier snapshot before the section was edited.',
    generated_at: 1_764_000_200_000,
    ...overrides,
  };
}
