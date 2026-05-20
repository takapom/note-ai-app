import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AgentLocalNextOpenDigestReadAdapter,
  InMemoryNextOpenDigestReadPort,
  mapNextOpenDigestReadToAgentLocalSql,
} from '../../apps/worker/src/scheduler/nextOpenDigestReadPort.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_001_000_000;
const baseInput = {
  workspaceId: noteFixture.workspaceId,
  noteId: noteFixture.id,
  now,
};

test('in-memory next open digest read port returns an available digest projection', async () => {
  const port = new InMemoryNextOpenDigestReadPort([
    {
      available: true,
      noteId: noteFixture.id,
      triggerReason: 'next_open',
      preparedAt: now - 100,
      recoveredJobCount: 2,
      sections: [{ sectionId: 'section_001', label: 'Recovered section' }],
      items: [{ kind: 'structure_job', count: 2 }],
    },
  ], noteFixture.workspaceId);

  assert.deepEqual(await port.getDigest(baseInput), {
    ok: true,
    errors: [],
    body: {
      available: true,
      noteId: noteFixture.id,
      triggerReason: 'next_open',
      preparedAt: now - 100,
      recoveredJobCount: 2,
      sections: [{ sectionId: 'section_001', label: 'Recovered section' }],
      items: [{ kind: 'structure_job', count: 2 }],
    },
  });
});

test('next open digest read port returns unavailable for a missing digest without fake content', async () => {
  const port = new InMemoryNextOpenDigestReadPort([], noteFixture.workspaceId);

  assert.deepEqual(await port.getDigest(baseInput), {
    ok: true,
    errors: [],
    body: {
      available: false,
      noteId: noteFixture.id,
    },
  });
});

test('SQL next open digest read adapter rejects invalid primitives before querying', async () => {
  let queryCount = 0;
  const adapter = new AgentLocalNextOpenDigestReadAdapter({
    async query() {
      queryCount += 1;
      return [];
    },
  });

  assert.deepEqual(await adapter.getDigest({
    workspaceId: 'workspace_unset',
    noteId: ' note_001',
    now: Number.NaN,
  }), {
    ok: false,
    errors: [
      'workspaceId must be a stable non-sentinel runtime id',
      'noteId must be a stable non-sentinel runtime id',
      'now must be a finite number',
    ],
  });
  assert.equal(queryCount, 0);
});

test('SQL next open digest read mapping selects the latest agent-local preparation row', () => {
  assert.deepEqual(mapNextOpenDigestReadToAgentLocalSql(baseInput), [
    {
      sql: [
        'select workspace_id, note_id, trigger_reason, recovered_job_count, prepared, payload_json',
        'from agent_local_next_open_digest_preparation_intents',
        'where workspace_id = ? and note_id = ?',
        'order by rowid desc',
        'limit 1',
      ].join(' '),
      args: [
        noteFixture.workspaceId,
        noteFixture.id,
      ],
    },
  ]);
});

test('SQL next open digest read adapter maps preparation payload without writing', async () => {
  const statements = [];
  const adapter = new AgentLocalNextOpenDigestReadAdapter({
    async query(statement) {
      statements.push(statement);
      return [{
        workspace_id: noteFixture.workspaceId,
        note_id: noteFixture.id,
        trigger_reason: 'next_open',
        recovered_job_count: 2,
        prepared: 1,
        payload_json: JSON.stringify({
          workspaceId: noteFixture.workspaceId,
          noteId: noteFixture.id,
          triggerReason: 'next_open',
          prepared: true,
          preparedAt: now - 50,
          recoveredJobCount: 2,
          sections: [{ sectionId: 'section_001' }],
          items: [{ kind: 'recovered_jobs', count: 2 }],
        }),
      }];
    },
  });

  assert.deepEqual(await adapter.getDigest(baseInput), {
    ok: true,
    errors: [],
    body: {
      available: true,
      noteId: noteFixture.id,
      triggerReason: 'next_open',
      preparedAt: now - 50,
      recoveredJobCount: 2,
      sections: [{ sectionId: 'section_001' }],
      items: [{ kind: 'recovered_jobs', count: 2 }],
    },
  });
  assert.deepEqual(statements, mapNextOpenDigestReadToAgentLocalSql(baseInput));
});

test('SQL next open digest read rejects cross-workspace rows', async () => {
  const adapter = new AgentLocalNextOpenDigestReadAdapter({
    async query() {
      return [{
        workspace_id: 'workspace_other',
        note_id: noteFixture.id,
        recovered_job_count: 0,
        prepared: 1,
        payload_json: JSON.stringify({
          workspaceId: 'workspace_other',
          noteId: noteFixture.id,
          prepared: true,
          recoveredJobCount: 0,
        }),
      }];
    },
  });

  assert.deepEqual(await adapter.getDigest(baseInput), {
    ok: false,
    errors: ['digest row workspaceId must match requested workspaceId'],
  });
});

test('next open digest read source stays a focused read boundary', async () => {
  const source = await readFile(new URL('apps/worker/src/scheduler/nextOpenDigestReadPort.ts', root), 'utf8');

  assert.match(source, /DigestReadPort/);
  assert.match(source, /from agent_local_next_open_digest_preparation_intents/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|OperationRouter|provider|ai-sdk|audit|memory_items|memory activation|contextAssembly|ContextAssembly/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
});
