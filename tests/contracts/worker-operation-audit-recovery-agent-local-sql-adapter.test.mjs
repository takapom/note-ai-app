import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AgentLocalOperationAuditRecoveryQueueAdapter,
  mapOperationAuditRecoveryPayloadToAgentLocalSql,
} from '../../apps/worker/src/operationAuditRecoveryAgentLocalSqlAdapter.ts';
import { routeGeneratedOperations } from '../../apps/worker/src/operationRoutingAdapter.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const root = new URL('../../', import.meta.url);
const failedAt = 1_700_000_001_000;
const routed = routeGeneratedOperations({
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_recovery_agent_local',
  aiResponse: [validOperationFixtures[0]],
  snapshot: operationRouterSnapshotFixture,
  now: 1_700_000_000_000,
  generatedBy: 'worker_runtime',
});

const [auditRecord] = routed.auditRecords;

test('Agent-local audit recovery adapter enqueues recovery intent as temporary SQL state', async () => {
  const executor = createExecutor();
  const adapter = new AgentLocalOperationAuditRecoveryQueueAdapter(executor);
  const payload = recoveryPayload();

  const result = await adapter.enqueue(payload);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.item, payload);
  assert.deepEqual(executor.writes, [
    mapOperationAuditRecoveryPayloadToAgentLocalSql(payload),
  ]);
  assert.equal(executor.writes[0].sql, [
    'insert into agent_local_operation_audit_recovery_queue',
    '(operation_id, workspace_id, note_id, structure_job_id, audit_record_json, failure_message, failed_at)',
    'values (?, ?, ?, ?, ?, ?, ?)',
  ].join(' '));
});

test('Agent-local audit recovery adapter keeps policy and status unchanged in payload JSON', async () => {
  const executor = createExecutor();
  const adapter = new AgentLocalOperationAuditRecoveryQueueAdapter(executor);
  const payload = recoveryPayload({
    auditRecord: {
      ...auditRecord,
      policy: 'runtime_passthrough_policy',
      status: 'runtime_passthrough_status',
    },
  });

  const result = await adapter.enqueue(payload);
  const persistedAuditRecord = JSON.parse(executor.writes[0].args[4]);

  assert.equal(result.ok, true);
  assert.equal(persistedAuditRecord.policy, 'runtime_passthrough_policy');
  assert.equal(persistedAuditRecord.status, 'runtime_passthrough_status');
});

test('Agent-local audit recovery adapter rejects invalid payloads before SQL execution', async () => {
  const executor = createExecutor();
  const adapter = new AgentLocalOperationAuditRecoveryQueueAdapter(executor);

  const result = await adapter.enqueue({
    ...recoveryPayload(),
    operationId: ' operation_bad ',
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('operationId must be trimmed'));
  assert.deepEqual(executor.writes, []);
});

test('Agent-local audit recovery adapter maps executor failure to stable enqueue meaning', async () => {
  const executor = createExecutor({
    executeError: new Error('SQLITE_BUSY: token leaked in lower-level detail'),
  });
  const adapter = new AgentLocalOperationAuditRecoveryQueueAdapter(executor);

  const result = await adapter.enqueue(recoveryPayload());

  assert.deepEqual(result, {
    ok: false,
    errors: ['audit recovery enqueue unavailable'],
  });
  assert.equal(executor.writes.length, 1);
});

test('Agent-local audit recovery adapter does not own retry, transaction, or canonical audit writes', async () => {
  const source = await readFile(
    new URL('apps/worker/src/operationAuditRecoveryAgentLocalSqlAdapter.ts', root),
    'utf8',
  );

  assert.match(source, /agent_local_operation_audit_recovery_queue/);
  assert.doesNotMatch(source, /\bwriteOperationAudit\b/);
  assert.doesNotMatch(source, /\b(begin|commit|rollback|transaction)\b/i);
  assert.doesNotMatch(source, /\bretry\s*\(/i);
  assert.doesNotMatch(source, /\b(insert into|update|delete from)\s+(notes|sections|blocks|ai_operations|source_spans)\b/i);
});

function recoveryPayload(overrides = {}) {
  const payloadAuditRecord = overrides.auditRecord ?? auditRecord;
  return {
    operationId: payloadAuditRecord.id,
    workspaceId: payloadAuditRecord.workspaceId,
    noteId: payloadAuditRecord.noteId,
    structureJobId: payloadAuditRecord.structureJobId,
    auditRecord: payloadAuditRecord,
    failureMessage: 'audit persistence unavailable',
    failedAt,
    ...overrides,
  };
}

function createExecutor({ executeError } = {}) {
  const writes = [];
  return {
    writes,
    async execute(statement) {
      writes.push(statement);
      if (executeError !== undefined) {
        throw executeError;
      }
      return { rowsAffected: 1 };
    },
  };
}
