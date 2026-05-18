import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  mapRelatedNotesLookupToSql,
  mapRelatedNoteRowsToRelatedContextNotes,
  mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits,
  mapRelatedSemanticUnitsLookupToSql,
  mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts,
  mapRelatedSourceBlockExcerptsLookupToSql,
  TursoContextAssemblyRelatedContextSqlAdapter,
} from '../../apps/worker/src/contextAssemblyRelatedContextSqlAdapter.ts';
import { noteFixture, sectionFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const runtimeInput = {
  workspaceId: noteFixture.workspaceId,
  noteId: noteFixture.id,
  structureJobId: 'structure_job_context_001',
  targetScope: 'section',
  targetId: sectionFixture.id,
  now: 1_764_000_300_000,
};

test('context assembly related context SQL reads bounded section candidate projections', () => {
  assert.deepEqual(mapRelatedSemanticUnitsLookupToSql(runtimeInput), {
    sql: [
      'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.retrieval_reason, semantic_unit_related_candidates.relevance_score, semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, notes.workspace_id as related_workspace_id',
      'from semantic_unit_related_candidates',
      'inner join semantic_units on semantic_units.id = semantic_unit_related_candidates.related_semantic_unit_id',
      'inner join notes on notes.id = semantic_units.note_id',
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and semantic_unit_related_candidates.source_target_id = ? and notes.workspace_id = ? and not (semantic_units.note_id = ? and semantic_units.section_id = ?)',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_units.id asc',
    ].join(' '),
    args: [
      noteFixture.workspaceId,
      noteFixture.id,
      'section',
      sectionFixture.id,
      noteFixture.workspaceId,
      noteFixture.id,
      sectionFixture.id,
    ],
  });

  assert.deepEqual(mapRelatedNotesLookupToSql(runtimeInput), {
    sql: [
      'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.semantic_unit_ids, semantic_unit_related_candidates.source_block_excerpt_ids, semantic_unit_related_candidates.retrieval_reason, semantic_unit_related_candidates.relevance_score, notes.id, notes.workspace_id as note_workspace_id, notes.title, notes.description_effective',
      'from semantic_unit_related_candidates',
      'inner join notes on notes.id = semantic_unit_related_candidates.related_note_id',
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and semantic_unit_related_candidates.source_target_id = ? and notes.workspace_id = ? and notes.id <> ?',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, notes.id asc',
    ].join(' '),
    args: [
      noteFixture.workspaceId,
      noteFixture.id,
      'section',
      sectionFixture.id,
      noteFixture.workspaceId,
      noteFixture.id,
    ],
  });

  assert.deepEqual(mapRelatedSourceBlockExcerptsLookupToSql(runtimeInput), {
    sql: [
      'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.source_block_excerpt_id as id, blocks.note_id, blocks.id as block_id, blocks.section_id, blocks.plain_text, blocks.origin, semantic_unit_related_candidates.source_start_offset, semantic_unit_related_candidates.source_end_offset, notes.workspace_id as block_workspace_id',
      'from semantic_unit_related_candidates',
      'inner join blocks on blocks.id = semantic_unit_related_candidates.source_block_id',
      'inner join notes on notes.id = blocks.note_id',
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and semantic_unit_related_candidates.source_target_id = ? and notes.workspace_id = ? and semantic_unit_related_candidates.source_block_excerpt_id is not null and semantic_unit_related_candidates.source_block_id is not null and blocks.origin = ? and not (blocks.note_id = ? and blocks.section_id = ?)',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_unit_related_candidates.source_block_excerpt_id asc',
    ].join(' '),
    args: [
      noteFixture.workspaceId,
      noteFixture.id,
      'section',
      sectionFixture.id,
      noteFixture.workspaceId,
      'user',
      noteFixture.id,
      sectionFixture.id,
    ],
  });
});

test('context assembly related context SQL reads note-level candidates and excludes the current note', () => {
  const noteInput = {
    ...runtimeInput,
    targetScope: 'note',
  };
  delete noteInput.targetId;

  assert.deepEqual(mapRelatedSemanticUnitsLookupToSql(noteInput), {
    sql: [
      'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.retrieval_reason, semantic_unit_related_candidates.relevance_score, semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, notes.workspace_id as related_workspace_id',
      'from semantic_unit_related_candidates',
      'inner join semantic_units on semantic_units.id = semantic_unit_related_candidates.related_semantic_unit_id',
      'inner join notes on notes.id = semantic_units.note_id',
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and notes.workspace_id = ? and semantic_units.note_id <> ?',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_units.id asc',
    ].join(' '),
    args: [noteFixture.workspaceId, noteFixture.id, 'note', noteFixture.workspaceId, noteFixture.id],
  });

  assert.deepEqual(mapRelatedNotesLookupToSql(noteInput).args, [
    noteFixture.workspaceId,
    noteFixture.id,
    'note',
    noteFixture.workspaceId,
    noteFixture.id,
  ]);
  assert.match(mapRelatedNotesLookupToSql(noteInput).sql, /notes\.id <> \?/);

  assert.deepEqual(mapRelatedSourceBlockExcerptsLookupToSql(noteInput).args, [
    noteFixture.workspaceId,
    noteFixture.id,
    'note',
    noteFixture.workspaceId,
    'user',
    noteFixture.id,
  ]);
  assert.match(mapRelatedSourceBlockExcerptsLookupToSql(noteInput).sql, /blocks\.note_id <> \?/);
});

test('context assembly related context row mappers convert bounded projection rows', () => {
  assert.deepEqual(mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits([
    relatedSemanticUnitRow({
      id: 'unit_related_001',
      source_block_ids: JSON.stringify(['block_related_001', 'block_related_002']),
    }),
    relatedSemanticUnitRow({
      id: 'unit_related_002',
      title: null,
      source_block_ids: null,
      source_block_id: 'block_related_002',
      source_start_offset: null,
      source_end_offset: null,
      confidence: null,
      relevance_score: null,
      retrieval_reason: null,
    }),
  ], runtimeInput), {
    ok: true,
    semanticUnits: [
      {
        id: 'unit_related_001',
        noteId: 'note_related_001',
        sectionId: 'section_related_001',
        title: 'Explicit MVP link',
        summary: 'An explicitly linked unit about MVP boundaries.',
        sourceBlockIds: ['block_related_001', 'block_related_002'],
        sourceSpan: {
          sourceBlockId: 'block_related_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.92,
        relevanceScore: 0.88,
        retrievalReason: 'explicit_links',
      },
      {
        id: 'unit_related_002',
        noteId: 'note_related_001',
        sectionId: 'section_related_001',
        summary: 'An explicitly linked unit about MVP boundaries.',
        sourceBlockIds: ['block_related_002'],
      },
    ],
  });

  assert.deepEqual(mapRelatedNoteRowsToRelatedContextNotes([
    relatedNoteRow({
      semantic_unit_ids: JSON.stringify(['unit_related_001']),
      source_block_excerpt_ids: ['excerpt_001'],
    }),
  ], runtimeInput), {
    ok: true,
    notes: [
      {
        id: 'note_related_001',
        title: 'MVP notes',
        descriptionEffective: 'Human-written related note description.',
        semanticUnitIds: ['unit_related_001'],
        sourceBlockExcerptIds: ['excerpt_001'],
        relevanceScore: 0.77,
        retrievalReason: 'note_title_description_similarity',
      },
    ],
  });

  assert.deepEqual(mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts([
    relatedSourceBlockExcerptRow(),
  ], runtimeInput), {
    ok: true,
    sourceBlockExcerpts: [
      {
        id: 'excerpt_001',
        noteId: 'note_related_001',
        blockId: 'block_related_001',
        text: 'Related text',
        sourceSpan: {
          sourceBlockId: 'block_related_001',
          startOffset: 0,
          endOffset: 12,
        },
      },
    ],
  });
});

test('context assembly related context mappers reject invalid and mismatched projection rows', () => {
  const semanticResult = mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits([
    relatedSemanticUnitRow({
      candidate_workspace_id: 'workspace_other',
      source_note_id: 'note_other',
      source_scope: 'note',
      source_target_id: 'section_other',
      related_workspace_id: 'workspace_other',
      id: '',
      note_id: noteFixture.id,
      section_id: sectionFixture.id,
      title: ' invalid title ',
      summary: '',
      source_block_ids: JSON.stringify(['block_valid', ' invalid_block ']),
      source_block_id: 'block_other',
      source_start_offset: Number.NaN,
      source_end_offset: 2,
      confidence: Number.POSITIVE_INFINITY,
      relevance_score: 'high',
      retrieval_reason: 'unknown_reason',
    }),
  ], runtimeInput);

  assert.equal(semanticResult.ok, false);
  assert.deepEqual(semanticResult.errors, [
    'related semantic unit rows[0].candidate_workspace_id must match requested workspaceId',
    'related semantic unit rows[0].source_note_id must match requested noteId',
    'related semantic unit rows[0].source_scope must match requested targetScope',
    'related semantic unit rows[0].source_target_id must match requested targetId',
    'related semantic unit rows[0].related_workspace_id must match requested workspaceId',
    'related semantic unit rows[0].id must be a non-empty string',
    'related semantic unit rows[0].section_id must not match requested targetId for same-note related units',
    'related semantic unit rows[0].title must be a non-empty string when provided',
    'related semantic unit rows[0].summary must be a non-empty string',
    'related semantic unit rows[0].source_block_ids must be a JSON array or string array of non-empty strings',
    'related semantic unit rows[0].source_start_offset must be a non-negative finite number when provided',
    'related semantic unit rows[0].confidence must be a finite number between 0 and 1 when provided',
    'related semantic unit rows[0].relevance_score must be a finite number when provided',
    'related semantic unit rows[0].retrieval_reason must be a context assembly related retrieval reason when provided',
  ]);

  const noteResult = mapRelatedNoteRowsToRelatedContextNotes([
    relatedNoteRow({
      id: noteFixture.id,
      note_workspace_id: 'workspace_other',
      title: '',
      description_effective: '',
      semantic_unit_ids: [],
      source_block_excerpt_ids: JSON.stringify(['excerpt_valid', ' invalid_excerpt ']),
      relevance_score: Number.NaN,
      retrieval_reason: 'unknown_reason',
    }),
  ], runtimeInput);

  assert.equal(noteResult.ok, false);
  assert.ok(noteResult.errors.includes('related note rows[0].id must not match requested noteId'));
  assert.ok(noteResult.errors.includes('related note rows[0].note_workspace_id must match requested workspaceId'));
  assert.ok(noteResult.errors.includes('related note rows[0].description_effective must be a non-empty string'));
  assert.ok(noteResult.errors.includes('related note rows[0].semantic_unit_ids must contain at least one semantic unit id'));
  assert.ok(noteResult.errors.includes('related note rows[0].source_block_excerpt_ids must be a JSON array or string array of non-empty strings'));

  const excerptResult = mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts([
    relatedSourceBlockExcerptRow({
      block_workspace_id: 'workspace_other',
      id: '',
      note_id: noteFixture.id,
      section_id: sectionFixture.id,
      block_id: '',
      plain_text: 'short',
      origin: 'ai',
      source_start_offset: -1,
      source_end_offset: 99,
    }),
  ], runtimeInput);

  assert.equal(excerptResult.ok, false);
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].block_workspace_id must match requested workspaceId'));
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].id must be a non-empty string'));
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].section_id must not match requested targetId for same-note excerpts'));
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].block_id must be a non-empty string'));
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].origin must be user'));
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].source_start_offset must be a non-negative finite number'));
  assert.ok(excerptResult.errors.includes('related source block excerpt rows[0].source_end_offset must not exceed plain_text length'));
});

test('context assembly related context adapter loads candidates in SQL result order', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyRelatedContextSqlAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        if (statement.sql.startsWith('select semantic_unit_related_candidates.workspace_id as candidate_workspace_id')) {
          if (statement.sql.includes('inner join semantic_units')) {
            return [
              relatedSemanticUnitRow({ id: 'unit_related_001', relevance_score: 0.4 }),
              relatedSemanticUnitRow({ id: 'unit_related_002', title: 'Second related unit', relevance_score: 0.9 }),
            ];
          }
          if (statement.sql.includes('inner join blocks')) {
            return [relatedSourceBlockExcerptRow()];
          }
          if (statement.sql.includes('inner join notes')) {
            return [relatedNoteRow()];
          }
        }
        throw new Error(`unexpected SQL: ${statement.sql}`);
      },
    },
  });

  const relatedContext = await adapter.loadRelatedContext(runtimeInput);

  assert.deepEqual(queries, [
    mapRelatedSemanticUnitsLookupToSql(runtimeInput),
    mapRelatedNotesLookupToSql(runtimeInput),
    mapRelatedSourceBlockExcerptsLookupToSql(runtimeInput),
  ]);
  assert.deepEqual(relatedContext, {
    semanticUnits: [
      {
        id: 'unit_related_001',
        noteId: 'note_related_001',
        sectionId: 'section_related_001',
        title: 'Explicit MVP link',
        summary: 'An explicitly linked unit about MVP boundaries.',
        sourceBlockIds: ['block_related_001'],
        sourceSpan: {
          sourceBlockId: 'block_related_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.92,
        relevanceScore: 0.4,
        retrievalReason: 'explicit_links',
      },
      {
        id: 'unit_related_002',
        noteId: 'note_related_001',
        sectionId: 'section_related_001',
        title: 'Second related unit',
        summary: 'An explicitly linked unit about MVP boundaries.',
        sourceBlockIds: ['block_related_001'],
        sourceSpan: {
          sourceBlockId: 'block_related_001',
          startOffset: 0,
          endOffset: 18,
        },
        confidence: 0.92,
        relevanceScore: 0.9,
        retrievalReason: 'explicit_links',
      },
    ],
    notes: [
      {
        id: 'note_related_001',
        title: 'MVP notes',
        descriptionEffective: 'Human-written related note description.',
        semanticUnitIds: ['unit_related_001'],
        sourceBlockExcerptIds: ['excerpt_001'],
        relevanceScore: 0.77,
        retrievalReason: 'note_title_description_similarity',
      },
    ],
    sourceBlockExcerpts: [
      {
        id: 'excerpt_001',
        noteId: 'note_related_001',
        blockId: 'block_related_001',
        text: 'Related text',
        sourceSpan: {
          sourceBlockId: 'block_related_001',
          startOffset: 0,
          endOffset: 12,
        },
      },
    ],
  });
});

test('context assembly related context adapter rejects unsupported chunk scope before querying', async () => {
  const queries = [];
  const adapter = new TursoContextAssemblyRelatedContextSqlAdapter({
    executor: {
      async query(statement) {
        queries.push(statement);
        return [];
      },
    },
  });

  await assert.rejects(
    () => adapter.loadRelatedContext({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
  assert.deepEqual(queries, []);
  assert.throws(
    () => mapRelatedSemanticUnitsLookupToSql({
      ...runtimeInput,
      targetScope: 'chunk',
      targetId: 'chunk_001',
    }),
    /targetScope chunk is unsupported until a stable chunk SQL schema exists/,
  );
});

test('context assembly related context adapter requires section targetId', async () => {
  const adapter = new TursoContextAssemblyRelatedContextSqlAdapter({
    executor: {
      async query() {
        throw new Error('executor should not be called without section targetId');
      },
    },
  });

  await assert.rejects(
    () => adapter.loadRelatedContext({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
  assert.throws(
    () => mapRelatedNotesLookupToSql({
      ...runtimeInput,
      targetId: undefined,
    }),
    /targetId must be provided for section target scope/,
  );
});

test('context assembly related context mappers reject full dump-shaped row fields', () => {
  for (const forbidden of ['fullWorkspace', 'fullNote', 'dump', 'allNotes', 'allMemory']) {
    const result = mapRelatedNoteRowsToRelatedContextNotes([
      relatedNoteRow({ [forbidden]: {} }),
    ], runtimeInput);

    assert.equal(result.ok, false, forbidden);
    assert.ok(
      result.errors.includes('related note rows[0].row must not include full workspace, full note, dump, all notes, or all memory fields'),
      forbidden,
    );
  }
});

test('context assembly related context SQL adapter stays read-only and avoids forbidden runtime boundaries', async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../apps/worker/src/contextAssemblyRelatedContextSqlAdapter.ts',
  );
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /ContextAssemblyRelatedContextRetrievalPort/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create table|alter table)\b/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|memory_items|provider|ai-sdk/i);
  assert.doesNotMatch(source, /description_user|description_ai|content_json|select \*/i);
  assert.match(source, /notes\.description_effective/);
  assert.match(source, /from semantic_unit_related_candidates/);
  assert.match(source, /inner join semantic_units/);
  assert.match(source, /inner join notes/);
  assert.match(source, /inner join blocks/);
  assert.match(source, /blocks\.origin = \?/);
});

function candidateScope(overrides = {}) {
  return {
    candidate_workspace_id: noteFixture.workspaceId,
    source_note_id: noteFixture.id,
    source_scope: 'section',
    source_target_id: sectionFixture.id,
    ...overrides,
  };
}

function relatedSemanticUnitRow(overrides = {}) {
  return {
    ...candidateScope(),
    related_workspace_id: noteFixture.workspaceId,
    id: 'unit_related_001',
    note_id: 'note_related_001',
    section_id: 'section_related_001',
    title: 'Explicit MVP link',
    summary: 'An explicitly linked unit about MVP boundaries.',
    source_block_ids: ['block_related_001'],
    source_block_id: 'block_related_001',
    source_start_offset: 0,
    source_end_offset: 18,
    confidence: 0.92,
    relevance_score: 0.88,
    retrieval_reason: 'explicit_links',
    ...overrides,
  };
}

function relatedNoteRow(overrides = {}) {
  return {
    ...candidateScope(),
    id: 'note_related_001',
    note_workspace_id: noteFixture.workspaceId,
    title: 'MVP notes',
    description_effective: 'Human-written related note description.',
    semantic_unit_ids: ['unit_related_001'],
    source_block_excerpt_ids: JSON.stringify(['excerpt_001']),
    relevance_score: 0.77,
    retrieval_reason: 'note_title_description_similarity',
    ...overrides,
  };
}

function relatedSourceBlockExcerptRow(overrides = {}) {
  return {
    ...candidateScope(),
    block_workspace_id: noteFixture.workspaceId,
    id: 'excerpt_001',
    note_id: 'note_related_001',
    block_id: 'block_related_001',
    section_id: 'section_related_001',
    plain_text: 'Related text about MVP boundaries.',
    origin: 'user',
    source_start_offset: 0,
    source_end_offset: 12,
    ...overrides,
  };
}
