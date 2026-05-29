import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  mapNoteListToSql,
  mapRowsToNoteList,
  TursoNoteListSqlAdapter,
} from '../../apps/worker/src/note-model/noteListSqlAdapter.ts';
import {
  noteFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const listRequest = {
  workspaceId: noteFixture.workspaceId,
};

test('note list SQL adapter reads workspace-scoped note summaries without block text', async () => {
  const queries = [];
  const adapter = new TursoNoteListSqlAdapter({
    async query(statement) {
      queries.push(statement);
      return [
        noteListRow({ id: 'note_older', title: 'Older note', updatedAt: 1_000 }),
        noteListRow({ id: 'note_newer', title: 'Newer note', updatedAt: 2_000 }),
      ];
    },
    async writeNoteDocument() {
      throw new Error('not used');
    },
  });

  const result = await adapter.listNotes(listRequest);

  assert.deepEqual(queries, [mapNoteListToSql(listRequest)]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.notes, [
    {
      noteId: 'note_newer',
      title: 'Newer note',
      descriptionEffective: 'Readable summary',
      createdAt: 500,
      updatedAt: 2_000,
    },
    {
      noteId: 'note_older',
      title: 'Older note',
      descriptionEffective: 'Readable summary',
      createdAt: 500,
      updatedAt: 1_000,
    },
  ]);

  assert.doesNotMatch(queries[0].sql, /\b(?:blocks|sections|plain_text|content_json)\b/i);
});

test('note list SQL mapper rejects mismatched and invalid rows without sentinels', () => {
  const result = mapRowsToNoteList([
    {
      ...noteListRow({ id: 'note_mismatch', title: 'Wrong workspace', updatedAt: 3_000 }),
      workspace_id: 'workspace_other',
    },
    {
      ...noteListRow({ id: '', title: '', updatedAt: Number.NaN }),
    },
  ], listRequest);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'notes[0].workspace_id must match requested workspaceId',
    'notes[1].noteId must be a non-empty string',
    'notes[1].title must be a non-empty string',
    'notes[1].updatedAt must be a finite timestamp',
  ]);
});

test('note list SQL adapter reports load infrastructure failures separately', async () => {
  const adapter = new TursoNoteListSqlAdapter({
    async query() {
      throw new Error('read unavailable');
    },
    async writeNoteDocument() {
      throw new Error('not used');
    },
  });

  assert.deepEqual(await adapter.listNotes(listRequest), {
    ok: false,
    errors: ['note list SQL load failed: read unavailable'],
  });
});

test('note list SQL adapter source stays in Note Model read boundary', async () => {
  const source = await readFile(new URL('apps/worker/src/note-model/noteListSqlAdapter.ts', root), 'utf8');
  const portSource = await readFile(new URL('apps/worker/src/note-model/noteListPort.ts', root), 'utf8');
  const combined = `${source}\n${portSource}`;

  assert.doesNotMatch(combined, /\b(?:insert\s+into|update|delete\s+from)\s+[`"]?(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_items)[`"]?\b/i);
  assert.doesNotMatch(combined, /operationRouter|OperationRouter|provider|ai_operations|source_spans|semantic_units|memory_items|agent_local_/);
  assert.doesNotMatch(combined, /from ['"].*docs\/generated\//);
});

function noteListRow({ id, title, updatedAt }) {
  return {
    id,
    workspace_id: noteFixture.workspaceId,
    title,
    description_effective: 'Readable summary',
    created_at: 500,
    updated_at: updatedAt,
  };
}
