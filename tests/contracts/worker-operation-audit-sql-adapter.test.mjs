import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapOperationAuditRecordToSql,
  OperationAuditSqlPersistenceAdapter,
} from '../../apps/worker/src/ai-operations/operationAuditSqlAdapter.ts';
import { routeGeneratedOperations } from '../../apps/worker/src/ai-operations/operationRoutingAdapter.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const routed = routeGeneratedOperations({
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_sql_001',
  aiResponse: [validOperationFixtures[0]],
  snapshot: operationRouterSnapshotFixture,
  now: 1_700_000_000_000,
  generatedBy: 'worker_runtime',
});

const [auditRecord] = routed.auditRecords;

test('SQL adapter maps one Operation Router audit record to ai_operations and source_spans statements', () => {
  const statements = mapOperationAuditRecordToSql(auditRecord);

  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /^insert into ai_operations /);
  assert.deepEqual(statements[0].args.slice(0, 7), [
    'operation_sql_001_0',
    'workspace_001',
    'note_001',
    'structure_job_001',
    'create_semantic_unit',
    'silent',
    'proposed',
  ]);
  assert.equal(statements[0].args[7], JSON.stringify(auditRecord.operation));
  assert.equal(statements[0].args[8], JSON.stringify([]));
  assert.match(statements[1].sql, /^insert into source_spans /);
  assert.deepEqual(statements[1].args, [
    'operation',
    'operation_sql_001_0',
    'block_001',
    0,
    42,
    'create_semantic_unit',
    0,
  ]);
});

test('SQL adapter writes mapped statements through executor without reclassifying operation policy', async () => {
  const writes = [];
  const adapter = new OperationAuditSqlPersistenceAdapter({
    async writeOperationAudit(statements) {
      writes.push(statements);
    },
  });
  const record = {
    ...auditRecord,
    policy: 'review',
    status: 'failed',
  };

  const result = await adapter.save(record);

  assert.equal(result.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].args[5], 'review');
  assert.equal(writes[0][0].args[6], 'failed');
});

test('SQL adapter rejects invalid persistence shape before writing', async () => {
  let writeCount = 0;
  const adapter = new OperationAuditSqlPersistenceAdapter({
    async writeOperationAudit() {
      writeCount += 1;
    },
  });

  const result = await adapter.save({
    ...auditRecord,
    id: '',
  });

  assert.equal(result.ok, false);
  assert.equal(writeCount, 0);
  assert.deepEqual(result.errors, ['auditRecord.id must be a non-empty string']);
});

test('SQL adapter reports infrastructure write failure without changing route decisions', async () => {
  const adapter = new OperationAuditSqlPersistenceAdapter({
    async writeOperationAudit() {
      throw new Error('turso unavailable');
    },
  });

  const result = await adapter.save(auditRecord);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['operation audit SQL write failed: turso unavailable']);
});
