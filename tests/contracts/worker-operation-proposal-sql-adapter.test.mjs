import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  mapOperationProposalInsertToSql,
  mapOperationProposalLookupToSql,
  mapOperationProposalRows,
  mapOperationProposalStateUpdateToSql,
  TursoOperationProposalSqlAdapter,
} from '../../apps/worker/src/ai-operations/operationProposalSqlAdapter.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_001_000_000;
const workspaceId = 'workspace_001';
const operationId = 'operation_proposal_001';

test('operation proposal SQL adapter saves, finds, and updates proposal state', async () => {
  const statements = [];
  const rowsByOperationId = new Map();
  const adapter = new TursoOperationProposalSqlAdapter({
    executor: {
      async query(statement) {
        statements.push(statement);
        return rowsByOperationId.get(statement.args[1]) ?? [];
      },
      async write(statement) {
        statements.push(statement);
        if (/^insert into operation_proposals/i.test(statement.sql)) {
          rowsByOperationId.set(statement.args[0], [rowFromInsert(statement)]);
        }
        if (/^update operation_proposals/i.test(statement.sql)) {
          const row = rowsByOperationId.get(statement.args[5])?.[0];
          rowsByOperationId.set(statement.args[5], [{
            ...row,
            state: statement.args[0],
            updated_at: statement.args[1],
            accepted_at: statement.args[2],
            dismissed_at: statement.args[3],
          }]);
        }
        return { rowsAffected: 1 };
      },
    },
  });
  const auditRecord = makeAuditRecord({ id: operationId });

  const saved = await adapter.saveProposal({
    workspaceId,
    operationId,
    auditRecord,
    now,
  });
  const found = await adapter.findProposal({ workspaceId, operationId });
  const accepted = await adapter.updateProposalState({
    workspaceId,
    operationId,
    state: 'accepted',
    now: now + 1,
  });

  assert.equal(saved.ok, true);
  assert.equal(saved.proposal.state, 'pending');
  assert.equal(found.operationId, operationId);
  assert.deepEqual(found.auditRecord, auditRecord);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.proposal.state, 'accepted');
  assert.equal(accepted.proposal.acceptedAt, now + 1);
  assert.deepEqual(statements.map((statement) => statement.sql), [
    mapOperationProposalLookupToSql({ workspaceId, operationId }).sql,
    mapOperationProposalInsertToSql(saved.proposal).sql,
    mapOperationProposalLookupToSql({ workspaceId, operationId }).sql,
    mapOperationProposalLookupToSql({ workspaceId, operationId }).sql,
    mapOperationProposalStateUpdateToSql(accepted.proposal).sql,
  ]);
});

test('operation proposal SQL adapter rejects duplicates and terminal updates', async () => {
  const auditRecord = makeAuditRecord({ id: operationId });
  const existing = proposalRow({
    operationId,
    workspaceId,
    state: 'dismissed',
    auditRecord,
    createdAt: now,
    updatedAt: now + 1,
    dismissedAt: now + 1,
  });
  let writeCount = 0;
  const adapter = new TursoOperationProposalSqlAdapter({
    executor: {
      async query() {
        return [existing];
      },
      async write() {
        writeCount += 1;
        return { rowsAffected: 1 };
      },
    },
  });

  const duplicate = await adapter.saveProposal({ workspaceId, operationId, auditRecord, now });
  const terminal = await adapter.updateProposalState({
    workspaceId,
    operationId,
    state: 'accepted',
    now: now + 2,
  });

  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.errors, [
    `operation proposal ${operationId} already exists in workspace ${workspaceId}`,
  ]);
  assert.equal(terminal.ok, false);
  assert.deepEqual(terminal.errors, [`operation proposal ${operationId} is already dismissed`]);
  assert.equal(writeCount, 0);
});

test('operation proposal SQL adapter short-circuits invalid primitives before query or write', async () => {
  let queryCount = 0;
  let writeCount = 0;
  const adapter = new TursoOperationProposalSqlAdapter({
    executor: {
      async query() {
        queryCount += 1;
        return [];
      },
      async write() {
        writeCount += 1;
        return { rowsAffected: 1 };
      },
    },
  });

  const invalidSave = await adapter.saveProposal({
    workspaceId: 'workspace_unset',
    operationId: ' operation_001',
    auditRecord: {},
    now: Number.NaN,
  });
  const invalidFind = await adapter.findProposal({
    workspaceId: 'workspace_unset',
    operationId: ' operation_001',
  });
  const invalidUpdate = await adapter.updateProposalState({
    workspaceId: 'workspace_unset',
    operationId: 'operation_unknown',
    state: 'accepted',
    now: Number.NaN,
  });

  assert.equal(invalidSave.ok, false);
  assert.ok(invalidSave.errors.includes('workspaceId must be a stable non-sentinel runtime id'));
  assert.ok(invalidSave.errors.includes('operationId must be a stable non-sentinel runtime id'));
  assert.ok(invalidSave.errors.includes('now must be a finite number'));
  assert.equal(invalidFind, undefined);
  assert.equal(invalidUpdate.ok, false);
  assert.equal(queryCount, 0);
  assert.equal(writeCount, 0);
});

test('operation proposal SQL mapper stores JSON audit record and updates only proposal state fields', () => {
  const auditRecord = makeAuditRecord({ id: operationId });
  const pending = {
    operationId,
    workspaceId,
    state: 'pending',
    auditRecord,
    createdAt: now,
    updatedAt: now,
  };
  const accepted = {
    ...pending,
    state: 'accepted',
    updatedAt: now + 1,
    acceptedAt: now + 1,
  };

  const insert = mapOperationProposalInsertToSql(pending);
  const update = mapOperationProposalStateUpdateToSql(accepted);

  assert.equal(insert.sql, [
    'insert into operation_proposals',
    '(operation_id, workspace_id, state, audit_record_json, created_at, updated_at, accepted_at, dismissed_at)',
    'values (?, ?, ?, ?, ?, ?, ?, ?)',
  ].join(' '));
  assert.deepEqual(insert.args, [
    operationId,
    workspaceId,
    'pending',
    JSON.stringify(auditRecord),
    now,
    now,
    null,
    null,
  ]);
  assert.equal(update.sql, [
    'update operation_proposals',
    'set state = ?, updated_at = ?, accepted_at = ?, dismissed_at = ?',
    'where workspace_id = ? and operation_id = ? and state = ?',
  ].join(' '));
  assert.deepEqual(update.args, [
    'accepted',
    now + 1,
    now + 1,
    null,
    workspaceId,
    operationId,
    'pending',
  ]);
  assert.doesNotMatch(update.sql, /\b(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_items)\b/i);
});

test('operation proposal row mapper rejects workspace and operation id mismatches', () => {
  const auditRecord = makeAuditRecord({ id: operationId });
  const mapped = mapOperationProposalRows([
    proposalRow({
      operationId: 'operation_other',
      workspaceId: 'workspace_other',
      state: 'pending',
      auditRecord,
      createdAt: now,
      updatedAt: now,
    }),
  ], { workspaceId, operationId });

  assert.equal(mapped.ok, false);
  assert.deepEqual(mapped.errors, [
    'operation proposal row operation_id must match operationId',
    'operation proposal row workspace_id must match workspaceId',
  ]);
});

test('operation proposal SQL adapter source guard keeps policy and direct SoT writes out', async () => {
  const source = await readFile(new URL('apps/worker/src/ai-operations/operationProposalSqlAdapter.ts', root), 'utf8');

  assert.match(source, /operation_proposals/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouter|operation router|OperationRouter|provider|ai-sdk|contextAssembly|ContextAssembly/i);
  assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from)\s+[`"]?(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_items)[`"]?\b/i);
  assert.doesNotMatch(source, /classifyOperationPolicy|validateStructureOperation|routeGeneratedOperations/);
});

function makeAuditRecord(overrides = {}) {
  return {
    id: overrides.id ?? operationId,
    workspaceId: overrides.workspaceId ?? workspaceId,
    noteId: 'note_001',
    structureJobId: 'structure_job_001',
    operationType: overrides.operationType ?? 'insert_assist_block',
    policy: overrides.policy ?? 'inline',
    status: 'proposed',
    operation: {
      type: overrides.operationType ?? 'insert_assist_block',
      target: {
        noteId: 'note_001',
        sectionId: 'section_001',
      },
      content: 'Suggested assist block',
    },
    errors: [],
    sourceSpans: [],
    confidence: 0.92,
    targetType: 'assist_block',
    targetId: 'assist_block_001',
    generatedBy: 'worker_runtime',
    createdAt: now,
    updatedAt: now,
  };
}

function proposalRow(proposal) {
  return {
    operation_id: proposal.operationId,
    workspace_id: proposal.workspaceId,
    state: proposal.state,
    audit_record_json: JSON.stringify(proposal.auditRecord),
    created_at: proposal.createdAt,
    updated_at: proposal.updatedAt,
    accepted_at: proposal.acceptedAt ?? null,
    dismissed_at: proposal.dismissedAt ?? null,
  };
}

function rowFromInsert(statement) {
  return {
    operation_id: statement.args[0],
    workspace_id: statement.args[1],
    state: statement.args[2],
    audit_record_json: statement.args[3],
    created_at: statement.args[4],
    updated_at: statement.args[5],
    accepted_at: statement.args[6],
    dismissed_at: statement.args[7],
  };
}
