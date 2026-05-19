import assert from 'node:assert/strict';
import test from 'node:test';

import { NoteDocumentBlockCommandPort } from '../../apps/worker/src/noteBlockCommandPort.ts';
import { TursoNoteDocumentPersistenceAdapter } from '../../apps/worker/src/noteDocumentSqlAdapter.ts';
import { WorkerTursoSqlExecutor } from '../../apps/worker/src/workerRuntimePorts.ts';
import {
  blockFixtures,
  noteDocumentFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';
import {
  createLocalSmokeCanonicalFixtureSqlClient,
  localSmokeCanonicalFixtureManifest,
  planLocalSmokeCanonicalSeedReset,
} from '../fixtures/worker-local-smoke-canonical-fixture.mjs';

test('local smoke canonical seed/reset planner is deterministic and excludes Agent-local state', () => {
  const plan = planLocalSmokeCanonicalSeedReset();

  assert.equal(plan.role, 'local-smoke-canonical-seed-reset-plan');
  assert.deepEqual(plan.manifest, {
    workspaceId: noteDocumentFixture.note.workspaceId,
    noteId: noteDocumentFixture.note.id,
    blockIds: noteDocumentFixture.blocks.map((block) => block.id),
  });
  assert.deepEqual(
    plan.resetStatements.map((statement) => statement.sql),
    [
      'delete from source_spans',
      'delete from ai_operations',
      'delete from operation_proposals',
      'delete from memory_context_candidates',
      'delete from memory_items',
      'delete from semantic_unit_related_candidates',
      'delete from semantic_unit_structure_snapshots',
      'delete from semantic_unit_section_summaries',
      'delete from semantic_edges',
      'delete from semantic_units',
      'delete from blocks',
      'delete from sections',
      'delete from notes',
    ],
  );
  assert.equal(
    plan.statements.some((statement) => /\bagent_local_/i.test(statement.sql)),
    false,
  );
  assert.equal(Object.hasOwn(localSmokeCanonicalFixtureManifest, 'authSecret'), false);
});

test('local smoke canonical fixture client resetAndSeed is idempotent after canonical mutation', async () => {
  const fixture = createLocalSmokeCanonicalFixtureSqlClient();
  const persistence = new TursoNoteDocumentPersistenceAdapter(
    new WorkerTursoSqlExecutor(fixture.client),
  );
  const noteBlocks = new NoteDocumentBlockCommandPort(persistence);

  await fixture.resetAndSeed();
  const baselineSnapshot = fixture.snapshot();

  await fixture.resetAndSeed();
  assert.deepEqual(fixture.snapshot(), baselineSnapshot);

  const update = await noteBlocks.updateBlock({
    workspaceId: noteDocumentFixture.note.workspaceId,
    userId: 'user_001',
    noteId: noteDocumentFixture.note.id,
    blockId: blockFixtures[1].id,
    now: noteDocumentFixture.note.updatedAt + 1_000,
    body: {
      noteId: noteDocumentFixture.note.id,
      content: 'Local smoke fixture mutation should be removed by reset.',
    },
  });

  assert.equal(update.ok, true);
  assert.notDeepEqual(fixture.snapshot(), baselineSnapshot);

  await fixture.resetAndSeed();
  assert.deepEqual(fixture.snapshot(), baselineSnapshot);

  const loaded = await persistence.loadDocument({
    workspaceId: noteDocumentFixture.note.workspaceId,
    noteId: noteDocumentFixture.note.id,
  });
  assert.equal(loaded.ok, true);
  assert.equal(
    loaded.document.blocks.find((block) => block.id === blockFixtures[1].id)?.plainText,
    blockFixtures[1].plainText,
  );
});
