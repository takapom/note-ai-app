import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  runOperationAcceptHandler,
  runOperationDismissHandler,
} from '../../apps/worker/src/operationApprovalRuntimeHandlers.ts';
import {
  InMemoryOperationProposalPersistencePort,
  runOperationProposalPersistenceFlow,
} from '../../apps/worker/src/operationProposalPort.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import { routeGeneratedOperations } from '../../apps/worker/src/operationRoutingAdapter.ts';

const root = new URL('../../', import.meta.url);
const now = 1_700_000_000_000;

const routed = routeGeneratedOperations({
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_proposal_fixture',
  aiResponse: [validOperationFixtures[2]],
  snapshot: operationRouterSnapshotFixture,
  now,
  generatedBy: 'worker_runtime',
});

const baseAuditRecord = routed.auditRecords[0];

test('proposed operation is persisted as proposal, not active projection', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const auditRecord = makeAuditRecord({ id: 'operation_proposal_001' });

  const result = await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    auditRecord,
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.state, 'pending');
  assert.equal(result.proposal.operationId, 'operation_proposal_001');
  assert.equal(result.proposal.auditRecord.id, 'operation_proposal_001');
  assert.deepEqual(result.activeProjectionMutations, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.deepEqual(
    proposalPersistence.listProposals().map((proposal) => ({
      operationId: proposal.operationId,
      workspaceId: proposal.workspaceId,
      state: proposal.state,
    })),
    [
      {
        operationId: 'operation_proposal_001',
        workspaceId: 'workspace_001',
        state: 'pending',
      },
    ],
  );
});

test('proposal persistence rejects operation id and workspace mismatches', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const auditRecord = makeAuditRecord({ id: 'operation_proposal_002' });

  const operationMismatch = await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: 'operation_proposal_other',
    workspaceId: auditRecord.workspaceId,
    auditRecord,
    now,
  });
  const workspaceMismatch = await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: auditRecord.id,
    workspaceId: 'workspace_other',
    auditRecord,
    now,
  });

  assert.equal(operationMismatch.ok, false);
  assert.ok(operationMismatch.errors.includes('auditRecord.id must match operationId'));
  assert.equal(workspaceMismatch.ok, false);
  assert.ok(workspaceMismatch.errors.includes('auditRecord.workspaceId must match workspaceId'));
  assert.deepEqual(proposalPersistence.listProposals(), []);
});

test('proposal persistence accepts only inline or review proposal operations', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const inlineAuditRecord = makeAuditRecord({
    id: 'operation_proposal_inline_001',
    operationType: 'insert_assist_block',
    policy: 'inline',
  });
  const silentAuditRecord = makeAuditRecord({
    id: 'operation_proposal_silent_001',
    operationType: 'create_semantic_unit',
    policy: 'silent',
  });

  const inline = await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: inlineAuditRecord.id,
    workspaceId: inlineAuditRecord.workspaceId,
    auditRecord: inlineAuditRecord,
    now,
  });
  const silent = await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: silentAuditRecord.id,
    workspaceId: silentAuditRecord.workspaceId,
    auditRecord: silentAuditRecord,
    now,
  });

  assert.equal(inline.ok, true);
  assert.equal(silent.ok, false);
  assert.ok(silent.errors.includes('auditRecord.policy must be inline or review for proposal persistence'));
  assert.ok(silent.errors.includes(
    'auditRecord.operationType must be insert_assist_block or create_memory_candidate for proposal persistence',
  ));
});

test('accept requires an existing workspace-scoped proposal', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const auditRecord = makeAuditRecord({ id: 'operation_proposal_accept_001' });

  const missing = await runOperationAcceptHandler({
    proposalPersistence,
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 1,
  });

  await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    auditRecord,
    now,
  });

  const wrongWorkspace = await runOperationAcceptHandler({
    proposalPersistence,
    workspaceId: 'workspace_other',
    operationId: auditRecord.id,
    now: now + 1,
  });
  const accepted = await runOperationAcceptHandler({
    proposalPersistence,
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 2,
  });

  assert.equal(missing.ok, false);
  assert.deepEqual(missing.errors, [
    'operation proposal operation_proposal_accept_001 was not found in workspace workspace_001',
  ]);
  assert.equal(wrongWorkspace.ok, false);
  assert.deepEqual(wrongWorkspace.errors, [
    'operation proposal operation_proposal_accept_001 was not found in workspace workspace_other',
  ]);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.proposal.state, 'accepted');
  assert.equal(accepted.approvedIntent.type, 'operation_proposal_accepted');
});

test('accept advances proposal state without writing user-authored block text', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const auditRecord = makeAuditRecord({ id: 'operation_proposal_accept_002' });

  await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    auditRecord,
    now,
  });

  const result = await runOperationAcceptHandler({
    proposalPersistence,
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 1,
  });
  const repeat = await runOperationAcceptHandler({
    proposalPersistence,
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.state, 'accepted');
  assert.equal(result.approvedIntent.operationId, auditRecord.id);
  assert.deepEqual(result.activeProjectionMutations, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.deepEqual(result.userAuthoredBlockMutations, []);
  assert.equal(repeat.ok, false);
  assert.deepEqual(repeat.errors, [`operation proposal ${auditRecord.id} is already accepted`]);
});

test('dismiss advances proposal state without writing user-authored block text', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const auditRecord = makeAuditRecord({ id: 'operation_proposal_dismiss_001' });

  await runOperationProposalPersistenceFlow({
    proposalPersistence,
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    auditRecord,
    now,
  });

  const result = await runOperationDismissHandler({
    proposalPersistence,
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 1,
  });
  const repeat = await runOperationDismissHandler({
    proposalPersistence,
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.state, 'dismissed');
  assert.equal(result.approvedIntent, undefined);
  assert.deepEqual(result.activeProjectionMutations, []);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.deepEqual(result.userAuthoredBlockMutations, []);
  assert.equal(repeat.ok, false);
  assert.deepEqual(repeat.errors, [`operation proposal ${auditRecord.id} is already dismissed`]);
});

test('approval boundary rejects returned proposal workspace and operation id mismatches', async () => {
  const auditRecord = makeAuditRecord({ id: 'operation_proposal_mismatch_001' });
  let updateCount = 0;

  const mismatchedWorkspace = await runOperationAcceptHandler({
    proposalPersistence: {
      async findProposal() {
        return {
          operationId: auditRecord.id,
          workspaceId: 'workspace_other',
          state: 'pending',
          auditRecord,
          createdAt: now,
          updatedAt: now,
        };
      },
      async saveProposal() {
        throw new Error('not used');
      },
      async updateProposalState() {
        updateCount += 1;
        return { ok: false, errors: ['must not update mismatched proposal'] };
      },
    },
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 1,
  });

  const mismatchedOperation = await runOperationAcceptHandler({
    proposalPersistence: {
      async findProposal() {
        return {
          operationId: 'operation_proposal_other',
          workspaceId: auditRecord.workspaceId,
          state: 'pending',
          auditRecord,
          createdAt: now,
          updatedAt: now,
        };
      },
      async saveProposal() {
        throw new Error('not used');
      },
      async updateProposalState() {
        updateCount += 1;
        return { ok: false, errors: ['must not update mismatched proposal'] };
      },
    },
    workspaceId: auditRecord.workspaceId,
    operationId: auditRecord.id,
    now: now + 1,
  });

  assert.equal(mismatchedWorkspace.ok, false);
  assert.ok(mismatchedWorkspace.errors.includes('proposal.workspaceId must match workspaceId'));
  assert.equal(mismatchedOperation.ok, false);
  assert.ok(mismatchedOperation.errors.includes('proposal.operationId must match operationId'));
  assert.equal(updateCount, 0);
});

test('approval handlers do not import provider SDK, Operation Router internals, or canonical note SQL writes', async () => {
  for (const file of [
    'apps/worker/src/operationProposalPort.ts',
    'apps/worker/src/operationApprovalRuntimeHandlers.ts',
  ]) {
    const source = await readFile(new URL(file, root), 'utf8');

    assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/, file);
    assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/, file);
    assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i, file);
    assert.doesNotMatch(
      source,
      /\b(insert\s+into|update|delete\s+from|upsert|create|alter)\s+(notes|sections|blocks)\b/i,
      file,
    );
  }
});

function makeAuditRecord(overrides = {}) {
  const id = overrides.id ?? baseAuditRecord.id;
  const sourceSpans = baseAuditRecord.sourceSpans.map((span) => ({
    ...span,
    targetId: id,
  }));

  return {
    ...baseAuditRecord,
    id,
    sourceSpans,
    ...overrides,
  };
}
