import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  InMemoryProvenanceLookupPort,
  mapProvenanceSourceLookupToSql,
  provenanceExcerptMaxChars,
  TursoProvenanceLookupSqlAdapter,
} from '../../apps/worker/src/note-model/provenanceLookupPort.ts';
import { blockFixtures, noteFixture, sectionFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const userBlock = blockFixtures.find((block) => block.id === 'block_paragraph_001');
const baseInput = {
  workspaceId: noteFixture.workspaceId,
  sourceSpanId: 'source_span_provenance_001',
  sourceBlockId: 'block_paragraph_001',
  startOffset: 4,
  endOffset: 14,
};

test('in-memory provenance lookup returns bounded excerpt and source metadata', async () => {
  const port = new InMemoryProvenanceLookupPort([
    {
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
      sectionId: sectionFixture.id,
      blockId: userBlock.id,
      plainText: userBlock.plainText,
    },
  ]);

  assert.deepEqual(await port.lookupSource(baseInput), {
    ok: true,
    errors: [],
    body: {
      available: true,
      sourceSpanId: 'source_span_provenance_001',
      sourceBlockId: 'block_paragraph_001',
      excerpt: userBlock.plainText.slice(0, 62),
      source: {
        sourceSpanId: 'source_span_provenance_001',
        sourceBlockId: 'block_paragraph_001',
        noteId: noteFixture.id,
        sectionId: sectionFixture.id,
        startOffset: 4,
        endOffset: 14,
        excerptStartOffset: 0,
        excerptEndOffset: 62,
        truncatedBefore: false,
        truncatedAfter: true,
      },
    },
  });
});

test('provenance lookup bounds long excerpts instead of returning full block text', async () => {
  const longText = `${'A'.repeat(180)}SOURCE-SPAN${'Z'.repeat(180)}`;
  const startOffset = 180;
  const endOffset = 191;
  const port = new InMemoryProvenanceLookupPort([
    {
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
      blockId: 'block_long_source_001',
      plainText: longText,
    },
  ]);

  const result = await port.lookupSource({
    workspaceId: noteFixture.workspaceId,
    sourceSpanId: 'source_span_long_001',
    sourceBlockId: 'block_long_source_001',
    startOffset,
    endOffset,
  });

  assert.equal(result.ok, true);
  assert.equal(result.body.available, true);
  assert.equal(result.body.excerpt.includes('SOURCE-SPAN'), true);
  assert.equal(result.body.excerpt.length <= provenanceExcerptMaxChars, true);
  assert.equal(result.body.excerpt.length < longText.length, true);
  assert.equal(result.body.source.truncatedBefore, true);
  assert.equal(result.body.source.truncatedAfter, true);
});

test('SQL provenance lookup adapter rejects invalid ids and ranges before querying', async () => {
  let queryCount = 0;
  const adapter = new TursoProvenanceLookupSqlAdapter({
    executor: {
      async query() {
        queryCount += 1;
        return [];
      },
    },
  });

  assert.deepEqual(await adapter.lookupSource({
    workspaceId: 'workspace_unset',
    sourceSpanId: ' source_span_001',
    sourceBlockId: 'block_placeholder',
    startOffset: Number.NaN,
    endOffset: 2.5,
  }), {
    ok: false,
    errors: [
      'workspaceId must be a stable non-sentinel runtime id',
      'sourceSpanId must be a stable non-sentinel runtime id',
      'sourceBlockId must be a stable non-sentinel runtime id',
      'startOffset must be a non-negative finite integer',
      'endOffset must be a non-negative finite integer',
    ],
  });

  assert.deepEqual(await adapter.lookupSource({
    workspaceId: noteFixture.workspaceId,
    sourceSpanId: 'source_span_bad_range_001',
    sourceBlockId: 'block_paragraph_001',
    startOffset: 12,
    endOffset: 2,
  }), {
    ok: false,
    errors: ['endOffset must be greater than or equal to startOffset'],
  });
  assert.equal(queryCount, 0);
});

test('cross-workspace or missing provenance source returns safe unavailable or mismatch failure', async () => {
  const missing = new TursoProvenanceLookupSqlAdapter({
    executor: {
      async query() {
        return [];
      },
    },
  });
  assert.deepEqual(await missing.lookupSource(baseInput), {
    ok: true,
    errors: [],
    body: {
      available: false,
      sourceSpanId: baseInput.sourceSpanId,
      sourceBlockId: baseInput.sourceBlockId,
    },
  });

  const mismatched = new TursoProvenanceLookupSqlAdapter({
    executor: {
      async query() {
        return [{
        workspace_id: 'workspace_other',
        source_span_id: baseInput.sourceSpanId,
        source_block_id: baseInput.sourceBlockId,
        start_offset: baseInput.startOffset,
        end_offset: baseInput.endOffset,
        note_id: noteFixture.id,
        section_id: sectionFixture.id,
          block_id: 'block_paragraph_001',
          plain_text: userBlock.plainText,
          origin: 'user',
        }];
      },
    },
  });
  assert.deepEqual(await mismatched.lookupSource(baseInput), {
    ok: false,
    errors: ['source row workspace_id must match requested workspaceId'],
  });
});

test('SQL provenance lookup mapper is read-only and selects only bounded canonical source fields', () => {
  assert.deepEqual(mapProvenanceSourceLookupToSql(baseInput), {
    sql: [
      'select ai_operations.workspace_id, source_spans.target_id as source_span_id, source_spans.source_block_id, source_spans.start_offset, source_spans.end_offset, source_spans.reason, blocks.note_id, blocks.section_id, blocks.id as block_id, blocks.plain_text, blocks.origin',
      'from source_spans',
      'inner join ai_operations on ai_operations.id = source_spans.target_id and source_spans.target_type = ?',
      'inner join blocks on blocks.id = source_spans.source_block_id',
      'inner join notes on notes.id = blocks.note_id and notes.workspace_id = ai_operations.workspace_id',
      'where ai_operations.workspace_id = ? and source_spans.target_id = ? and source_spans.source_block_id = ? and source_spans.start_offset = ? and source_spans.end_offset = ? and blocks.origin = ?',
      'limit 2',
    ].join(' '),
    args: [
      'operation',
      noteFixture.workspaceId,
      'source_span_provenance_001',
      'block_paragraph_001',
      4,
      14,
      'user',
    ],
  });
});

test('SQL provenance lookup maps canonical block text without writing', async () => {
  const statements = [];
  const adapter = new TursoProvenanceLookupSqlAdapter({
    executor: {
      async query(statement) {
        statements.push(statement);
        return [{
          workspace_id: noteFixture.workspaceId,
          source_span_id: baseInput.sourceSpanId,
          source_block_id: baseInput.sourceBlockId,
          start_offset: baseInput.startOffset,
          end_offset: baseInput.endOffset,
          reason: 'supports operation',
          note_id: noteFixture.id,
          section_id: sectionFixture.id,
          block_id: 'block_paragraph_001',
          plain_text: userBlock.plainText,
          origin: 'user',
        }];
      },
    },
  });

  const result = await adapter.lookupSource(baseInput);
  assert.equal(result.ok, true);
  assert.equal(result.body.available, true);
  assert.equal(result.body.excerpt, userBlock.plainText.slice(0, 62));
  assert.equal(result.body.source.reason, 'supports operation');
  assert.deepEqual(statements, [mapProvenanceSourceLookupToSql(baseInput)]);
});

test('provenance lookup rejects source spans that exceed canonical block text', async () => {
  const adapter = new TursoProvenanceLookupSqlAdapter({
    executor: {
      async query() {
        return [{
          workspace_id: noteFixture.workspaceId,
          source_span_id: baseInput.sourceSpanId,
          source_block_id: baseInput.sourceBlockId,
          start_offset: 0,
          end_offset: 8,
          note_id: noteFixture.id,
          block_id: 'block_paragraph_001',
          plain_text: 'short',
          origin: 'user',
        }];
      },
    },
  });

  assert.deepEqual(await adapter.lookupSource({
    ...baseInput,
    startOffset: 0,
    endOffset: 8,
  }), {
    ok: false,
    errors: ['source span endOffset must not exceed source text length'],
  });
});

test('provenance lookup source guard forbids provider router audit memory activation and write SQL', async () => {
  const source = await readFile(new URL('apps/worker/src/note-model/provenanceLookupPort.ts', root), 'utf8');

  assert.match(source, /ProvenanceLookupPort/);
  assert.match(source, /from source_spans/);
  assert.match(source, /inner join notes/);
  assert.match(source, /inner join ai_operations/);
  assert.match(source, /inner join blocks/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|OperationRouter|provider|ai-sdk|auditPersistence|memory activation|ContextAssembly/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|replace\s+into|create table|alter table)\b/i);
  assert.doesNotMatch(source, /\b(from|join)\s+(?:memory_items|semantic_units)\b/i);
  assert.doesNotMatch(source, /\bselect\s+\*/i);
});
