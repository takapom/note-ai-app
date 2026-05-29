import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createWorkerTursoClientFromEnv,
  resolveWorkerTursoClient,
} from '../../apps/worker/src/runtime/composition/workerTursoClientFactory.ts';
import { createWorkerRuntimePorts } from '../../apps/worker/src/runtime/composition/workerRuntimePorts.ts';

const root = new URL('../..', import.meta.url);

test('worker runtime can create a Turso-compatible libSQL client from deployment URL env', () => {
  const client = createWorkerTursoClientFromEnv({
    TURSO_DATABASE_URL: 'http://127.0.0.1:8080',
  });

  assert.equal(typeof client?.execute, 'function');
});

test('worker runtime keeps object Turso bindings ahead of URL-created local clients', async () => {
  const binding = {
    async execute(statement) {
      return { rows: [{ sql: statement.sql }] };
    },
  };

  assert.equal(
    resolveWorkerTursoClient({
      TURSO: binding,
      TURSO_DATABASE_URL: 'http://127.0.0.1:8080',
    }),
    binding,
  );
});

test('worker default port wiring uses URL-created Turso client for canonical note ports', () => {
  const ports = createWorkerRuntimePorts({
    env: {
      TURSO_DATABASE_URL: 'http://127.0.0.1:8080',
    },
  });

  assert.equal(typeof ports.noteDocument?.loadDocument, 'function');
  assert.equal(typeof ports.noteBlocks?.updateBlock, 'function');
  assert.equal(typeof ports.provenanceLookup?.lookupSource, 'function');
});

test('local Turso seed script applies canonical schema fixture without Agent-local tables', async () => {
  const source = await readFile(new URL('scripts/seed-local-turso.mjs', root), 'utf8');

  assert.match(source, /canonicalSchemaFixture/);
  assert.match(source, /planLocalSmokeCanonicalSeedReset/);
  assert.match(source, /create table if not exists/);
  assert.doesNotMatch(source, /agent_local_/);
  for (const line of source.split(/\r?\n/).filter((candidate) => candidate.includes('stdout'))) {
    assert.doesNotMatch(line, /authToken|TOKEN/);
  }
});
