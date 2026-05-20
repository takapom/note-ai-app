import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapBlockChangedOutputToAgentLocalSql,
  mapNextOpenDigestPreparationToAgentLocalSql,
  mapStructureJobsToAgentLocalSql,
} from '../../apps/worker/src/scheduler/schedulerAgentLocalSqlAdapter.ts';
import {
  mapClaimedStructureJobToAgentLocalSql,
  mapCompletedStructureJobToAgentLocalSql,
  mapFailedStructureJobToAgentLocalSql,
  mapNextQueuedStructureJobLookupToAgentLocalSql,
  mapStructureJobLookupByIdToAgentLocalSql,
} from '../../apps/worker/src/scheduler/structureJobWorkQueueAgentLocalSqlAdapter.ts';
import {
  mapNextOpenDigestReadToAgentLocalSql,
} from '../../apps/worker/src/scheduler/nextOpenDigestReadPort.ts';
import {
  mapOperationAuditRecoveryPayloadToAgentLocalSql,
} from '../../apps/worker/src/ai-operations/operationAuditRecoveryAgentLocalSqlAdapter.ts';
import {
  validateOperationAuditRecoveryPayload,
} from '../../apps/worker/src/ai-operations/operationAuditRecoveryQueue.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import { handleBlockChanged } from '../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  blockChangedInputFixture,
  completedSectionJobFixture,
  schedulerNow,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';
import {
  agentLocalTableNames,
  agentLocalTemporarySchema,
} from '../fixtures/worker-agent-local-schema-fixture.mjs';

test('Agent-local schema readiness fixture contains only temporary state tables', () => {
  const tableNames = agentLocalTableNames();

  assert.deepEqual(tableNames, [
    'agent_local_block_save_intents',
    'agent_local_dirty_scope_marks',
    'agent_local_edit_events',
    'agent_local_lightweight_index_updates',
    'agent_local_next_open_digest_preparation_intents',
    'agent_local_operation_audit_recovery_queue',
    'agent_local_structure_jobs',
  ]);

  for (const tableName of tableNames) {
    assert.match(tableName, /^agent_local_/);
    assert.equal(agentLocalTemporarySchema.tables[tableName].placement, 'agent-local-temporary');
  }

  for (const canonicalTable of agentLocalTemporarySchema.forbiddenCanonicalTables) {
    assert.equal(
      agentLocalTemporarySchema.tables[canonicalTable],
      undefined,
      `${canonicalTable} must remain canonical Turso state, not Agent-local readiness state`,
    );
  }
});

test('scheduler Agent-local SQL mapper assumptions are covered by temporary schema', () => {
  const output = handleBlockChanged(blockChangedInputFixture);
  const statements = [
    ...mapBlockChangedOutputToAgentLocalSql(output),
    ...mapStructureJobsToAgentLocalSql([{
      ...completedSectionJobFixture,
      id: 'structure_job_agent_local_schema_001',
      status: 'queued',
      createdAt: schedulerNow,
    }]),
    ...mapNextOpenDigestPreparationToAgentLocalSql({
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
      triggerReason: 'next_open',
      recoveredJobCount: 1,
      prepared: true,
    }),
  ];

  for (const statement of statements) {
    assertAgentLocalStatement(statement.sql);
    const insert = parseInsert(statement.sql);
    assert.notEqual(insert, undefined, `expected insert statement: ${statement.sql}`);
    assertSchemaContainsColumns(insert.table, insert.columns);
  }
});

test('StructureJob work queue Agent-local SQL assumptions are covered by temporary schema', () => {
  const runningJob = {
    ...completedSectionJobFixture,
    id: 'structure_job_agent_local_schema_running',
    status: 'running',
    startedAt: schedulerNow + 1,
  };
  const completedJob = {
    ...runningJob,
    status: 'completed',
    completedAt: schedulerNow + 2,
  };
  const failedJob = {
    ...runningJob,
    status: 'failed',
    failedAt: schedulerNow + 3,
    failureMessage: 'context assembly failed',
  };
  const statements = [
    mapNextQueuedStructureJobLookupToAgentLocalSql({ workspaceId: noteFixture.workspaceId }),
    mapStructureJobLookupByIdToAgentLocalSql(runningJob.id),
    mapClaimedStructureJobToAgentLocalSql(runningJob),
    mapCompletedStructureJobToAgentLocalSql(completedJob),
    mapFailedStructureJobToAgentLocalSql(failedJob),
  ];

  for (const statement of statements) {
    assertAgentLocalStatement(statement.sql);
  }

  const nextQueuedLookup = parseSelect(statements[0].sql);
  assertSchemaContainsColumns(nextQueuedLookup.table, nextQueuedLookup.columns);
  assert.deepEqual(nextQueuedLookup.orderByColumns, ['created_at', 'id']);

  const lookupById = parseSelect(statements[1].sql);
  assertSchemaContainsColumns(lookupById.table, lookupById.columns);

  for (const statement of statements.slice(2)) {
    const update = parseUpdate(statement.sql);
    assertSchemaContainsColumns(update.table, update.columns);
    assert.equal(update.table, 'agent_local_structure_jobs');
  }
});

test('next-open digest read/write SQL assumptions stay Agent-local and schema-covered', () => {
  const writeStatements = mapNextOpenDigestPreparationToAgentLocalSql({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    triggerReason: 'next_open',
    recoveredJobCount: 2,
    prepared: true,
  });
  const readStatements = mapNextOpenDigestReadToAgentLocalSql({
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    now: schedulerNow,
  });

  for (const statement of [...writeStatements, ...readStatements]) {
    assertAgentLocalStatement(statement.sql);
  }

  const insert = parseInsert(writeStatements[0].sql);
  assertSchemaContainsColumns(insert.table, insert.columns);

  const select = parseSelect(readStatements[0].sql);
  assert.equal(select.table, 'agent_local_next_open_digest_preparation_intents');
  assertSchemaContainsColumns(select.table, select.columns);
});

test('operation audit recovery queue readiness is temporary state and not canonical audit storage', () => {
  const table = agentLocalTemporarySchema.tables.agent_local_operation_audit_recovery_queue;
  const payload = operationAuditRecoveryPayload();
  const statement = mapOperationAuditRecoveryPayloadToAgentLocalSql(payload);
  const insert = parseInsert(statement.sql);

  assert.equal(table.placement, 'agent-local-temporary');
  assert.deepEqual(table.columns, [
    'operation_id',
    'workspace_id',
    'note_id',
    'structure_job_id',
    'audit_record_json',
    'failure_message',
    'failed_at',
  ]);
  assert.equal(agentLocalTemporarySchema.tables.ai_operations, undefined);
  assert.equal(agentLocalTemporarySchema.tables.source_spans, undefined);
  assertAgentLocalStatement(statement.sql);
  assert.equal(insert.table, 'agent_local_operation_audit_recovery_queue');
  assertSchemaContainsColumns(insert.table, insert.columns);

  const recoveryPayloadErrors = validateOperationAuditRecoveryPayload(payload);
  assert.deepEqual(recoveryPayloadErrors, []);
});

function operationAuditRecoveryPayload() {
  return {
    operationId: 'operation_agent_local_schema_001',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    structureJobId: 'structure_job_agent_local_schema_001',
    auditRecord: {
      id: 'operation_agent_local_schema_001',
      workspaceId: noteFixture.workspaceId,
      noteId: noteFixture.id,
      structureJobId: 'structure_job_agent_local_schema_001',
      operationType: 'create_ai_block',
      status: 'proposed',
      policy: 'requires_review',
      errors: [],
      sourceSpans: [],
      createdAt: schedulerNow,
    },
    failureMessage: 'operation audit SQL write failed: turso unavailable',
    failedAt: schedulerNow + 10,
  };
}

function assertAgentLocalStatement(sql) {
  const normalized = normalizeSql(sql);
  assert.doesNotMatch(normalized, /\bturso\b/i);
  assert.doesNotMatch(normalized, /\bturso_sync\b/i);
  assert.doesNotMatch(normalized, /\b(?:insert into|update|delete from|from|join)\s+(?:notes|sections|blocks)\b/i);

  const referencedTables = referencedTableNames(normalized);
  assert.notEqual(referencedTables.length, 0, `expected table reference in SQL: ${sql}`);
  for (const table of referencedTables) {
    assert.ok(
      table.startsWith('agent_local_'),
      `${table} must be an Agent-local temporary table`,
    );
    assert.notEqual(
      agentLocalTemporarySchema.tables[table],
      undefined,
      `${table} must be represented by the Agent-local readiness fixture`,
    );
  }
}

function assertSchemaContainsColumns(table, columns) {
  const schemaTable = agentLocalTemporarySchema.tables[table];
  assert.notEqual(schemaTable, undefined, `${table} must be represented by schema fixture`);

  for (const column of columns) {
    assert.ok(
      schemaTable.columns.includes(column),
      `${table}.${column} must be represented by schema fixture`,
    );
  }
}

function referencedTableNames(sql) {
  const names = [];
  const tablePattern = /\b(?:insert into|update|from|join)\s+([a-z_][a-z0-9_]*)\b/gi;
  let match;
  while ((match = tablePattern.exec(sql)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function parseInsert(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/\binsert into\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/i);
  if (match === null) {
    return undefined;
  }

  return {
    table: match[1],
    columns: splitColumns(match[2]),
  };
}

function parseSelect(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/\bselect\s+(.+?)\s+from\s+([a-z_][a-z0-9_]*)\b/i);
  assert.notEqual(match, null, `expected select statement: ${sql}`);

  return {
    table: match[2],
    columns: splitColumns(match[1]),
    orderByColumns: parseOrderByColumns(normalized),
  };
}

function parseUpdate(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/\bupdate\s+([a-z_][a-z0-9_]*)\s+set\s+(.+?)\s+where\s+(.+)$/i);
  assert.notEqual(match, null, `expected update statement: ${sql}`);

  return {
    table: match[1],
    columns: [
      ...splitAssignments(match[2]),
      ...splitWhereColumns(match[3]),
    ],
  };
}

function parseOrderByColumns(sql) {
  const match = sql.match(/\border by\s+(.+?)(?:\s+limit\b|$)/i);
  if (match === null) {
    return [];
  }

  return match[1]
    .split(',')
    .map((item) => item.trim().replace(/\s+(?:asc|desc)$/i, ''))
    .filter(Boolean);
}

function splitColumns(value) {
  return value
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
}

function splitAssignments(value) {
  return value
    .split(',')
    .map((assignment) => assignment.trim().split(/\s*=\s*/)[0])
    .filter(Boolean);
}

function splitWhereColumns(value) {
  return [...value.matchAll(/\b([a-z_][a-z0-9_]*)\s*=\s*\?/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}
