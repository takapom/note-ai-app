import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  runOperationProjectionPersistenceFlow,
} from '../../apps/worker/src/ai-operations/operationProjectionPersistenceFlow.ts';
import {
  InMemoryOperationProjectionPersistencePort,
} from '../../apps/worker/src/ai-operations/operationProjectionPort.ts';
import {
  InMemoryOperationProposalPersistencePort,
} from '../../apps/worker/src/ai-operations/operationProposalPort.ts';
import { routeGeneratedOperations } from '../../apps/worker/src/ai-operations/operationRoutingAdapter.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const root = new URL('../../', import.meta.url);
const now = 1_700_000_000_000;

const runtimeInput = {
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_projection_001',
  operationIdPrefix: 'operation_projection_flow',
  snapshot: operationRouterSnapshotFixture,
  now,
  generatedBy: 'worker_runtime',
};

test('projection flow persists only silent apply effects as active projection write intents', async () => {
  const routing = routeGeneratedOperations({
    ...runtimeInput,
    aiResponse: [
      validOperationFixtures[0],
      validOperationFixtures[1],
      validOperationFixtures[4],
      validOperationFixtures[5],
    ],
  });
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();

  const result = await runOperationProjectionPersistenceFlow({
    routing,
    projectionPersistence,
    proposalPersistence,
    now: now + 1,
  });

  assert.equal(result.routing, routing);
  assert.equal(result.projectionPersistence.ok, true);
  assert.equal(result.projectionPersistence.savedCount, 3);
  assert.deepEqual(result.proposalPersistence, {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
    results: [],
  });
  assert.deepEqual(
    projectionPersistence.list().map((intent) => ({
      operationId: intent.operationId,
      workspaceId: intent.workspaceId,
      effect: intent.effect,
      auditPolicy: intent.auditRecord.policy,
      createdAt: intent.createdAt,
    })),
    [
      {
        operationId: 'operation_projection_flow_0',
        workspaceId: 'workspace_001',
        effect: 'create_semantic_unit',
        auditPolicy: 'silent',
        createdAt: now + 1,
      },
      {
        operationId: 'operation_projection_flow_1',
        workspaceId: 'workspace_001',
        effect: 'create_relation',
        auditPolicy: 'silent',
        createdAt: now + 1,
      },
      {
        operationId: 'operation_projection_flow_2',
        workspaceId: 'workspace_001',
        effect: 'mark_stale',
        auditPolicy: 'silent',
        createdAt: now + 1,
      },
    ],
  );
  assert.deepEqual(result.activeProjectionWriteIntents.map((intent) => intent.effect), [
    'create_semantic_unit',
    'create_relation',
    'mark_stale',
  ]);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.noteSotMutations, []);
  assert.deepEqual(result.userAuthoredBlockMutations, []);
});

test('projection flow sends propose actions to proposal persistence without active projection writes', async () => {
  const routing = routeGeneratedOperations({
    ...runtimeInput,
    operationIdPrefix: 'operation_projection_proposal',
    aiResponse: [validOperationFixtures[2], validOperationFixtures[3]],
  });
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();

  const result = await runOperationProjectionPersistenceFlow({
    routing,
    projectionPersistence,
    proposalPersistence,
    now: now + 1,
  });

  assert.equal(result.projectionPersistence.attempted, false);
  assert.deepEqual(projectionPersistence.list(), []);
  assert.equal(result.proposalPersistence.ok, true);
  assert.equal(result.proposalPersistence.savedCount, 2);
  assert.deepEqual(
    proposalPersistence.listProposals().map((proposal) => ({
      operationId: proposal.operationId,
      state: proposal.state,
      operationType: proposal.auditRecord.operationType,
    })),
    [
      {
        operationId: 'operation_projection_proposal_0',
        state: 'pending',
        operationType: 'create_memory_candidate',
      },
      {
        operationId: 'operation_projection_proposal_1',
        state: 'pending',
        operationType: 'insert_assist_block',
      },
    ],
  );
});

test('projection flow does not write for reject or no_apply route decisions', async () => {
  const routing = routeGeneratedOperations({
    ...runtimeInput,
    operationIdPrefix: 'operation_projection_rejected',
    aiResponse: [
      {
        ...validOperationFixtures[0],
        confidence: 0.1,
      },
      {
        type: 'rewrite_user_block',
        blockId: 'block_001',
        content: 'Replace the user-authored text.',
      },
      validOperationFixtures[5],
    ],
  });
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();

  const result = await runOperationProjectionPersistenceFlow({
    routing,
    projectionPersistence,
    proposalPersistence,
    now: now + 1,
  });

  assert.deepEqual(routing.applyResults.map((applyResult) => applyResult.action), [
    'no_apply',
    'reject',
    'no_apply',
  ]);
  assert.deepEqual(result.projectionPersistence, {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
  });
  assert.deepEqual(result.proposalPersistence, {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
    results: [],
  });
  assert.deepEqual(projectionPersistence.list(), []);
  assert.deepEqual(proposalPersistence.listProposals(), []);
});

test('projection persistence failure stays separate from routing and proposal decisions', async () => {
  const routing = routeGeneratedOperations({
    ...runtimeInput,
    operationIdPrefix: 'operation_projection_failure',
    aiResponse: [validOperationFixtures[0], validOperationFixtures[2]],
  });
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();

  const result = await runOperationProjectionPersistenceFlow({
    routing,
    projectionPersistence: {
      async saveActiveProjection() {
        throw new Error('projection store unavailable');
      },
    },
    proposalPersistence,
    now: now + 1,
  });

  assert.equal(result.routing, routing);
  assert.equal(result.routing.ok, true);
  assert.deepEqual(result.routing.errors, []);
  assert.deepEqual(result.projectionPersistence, {
    attempted: true,
    ok: false,
    savedCount: 0,
    errors: [
      'projection operation_projection_failure_0: projection persistence unavailable',
    ],
  });
  assert.equal(result.proposalPersistence.ok, true);
  assert.equal(result.proposalPersistence.savedCount, 1);
  assert.deepEqual(proposalPersistence.listProposals().map((proposal) => proposal.operationId), [
    'operation_projection_failure_1',
  ]);
  assert.deepEqual(result.activeProjectionWriteIntents, []);
});

test('proposal persistence failure stays separate from active projection writes', async () => {
  const routing = routeGeneratedOperations({
    ...runtimeInput,
    operationIdPrefix: 'operation_projection_proposal_failure',
    aiResponse: [validOperationFixtures[0], validOperationFixtures[2]],
  });
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();

  const result = await runOperationProjectionPersistenceFlow({
    routing,
    projectionPersistence,
    proposalPersistence: {
      async saveProposal() {
        return { ok: false, errors: ['proposal store unavailable'] };
      },
      async findProposal() {
        throw new Error('not used');
      },
      async updateProposalState() {
        throw new Error('not used');
      },
    },
    now: now + 1,
  });

  assert.equal(result.routing.ok, true);
  assert.deepEqual(result.projectionPersistence, {
    attempted: true,
    ok: true,
    savedCount: 1,
    errors: [],
  });
  assert.deepEqual(result.proposalPersistence.errors, [
    'proposal operation_projection_proposal_failure_1: proposal persistence unavailable',
  ]);
  assert.equal(result.proposalPersistence.ok, false);
  assert.deepEqual(projectionPersistence.list().map((intent) => intent.operationId), [
    'operation_projection_proposal_failure_0',
  ]);
});

test('projection port rejects mismatched or non-silent active projection intents without reclassifying operations', async () => {
  const routing = routeGeneratedOperations({
    ...runtimeInput,
    operationIdPrefix: 'operation_projection_validation',
    aiResponse: [validOperationFixtures[0]],
  });
  const auditRecord = routing.auditRecords[0];
  const projectionPersistence = new InMemoryOperationProjectionPersistencePort();

  const policyMismatch = await projectionPersistence.saveActiveProjection({
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    effect: 'create_semantic_unit',
    reason: routing.applyResults[0].reason,
    auditRecord: {
      ...auditRecord,
      policy: 'review',
    },
    operation: {
      ...auditRecord.operation,
      type: 'create_memory_candidate',
    },
    createdAt: now + 1,
    updatedAt: now + 1,
  });

  assert.equal(policyMismatch.ok, false);
  assert.deepEqual(policyMismatch.errors, [
    'auditRecord.policy must be silent for active projection persistence',
  ]);
  assert.deepEqual(projectionPersistence.list(), []);
});

test('projection persistence boundary does not import schema internals, provider SDK, or canonical note SQL writes', async () => {
  for (const file of [
    'apps/worker/src/ai-operations/operationProjectionPort.ts',
    'apps/worker/src/ai-operations/operationProjectionPersistenceFlow.ts',
  ]) {
    const source = await readFile(new URL(file, root), 'utf8');

    assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/, file);
    assert.doesNotMatch(source, /classifyOperationPolicy|validateStructureOperation/, file);
    assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i, file);
    assert.doesNotMatch(
      source,
      /\b(insert\s+into|update|delete\s+from|upsert|create|alter)\s+(notes|sections|blocks)\b/i,
      file,
    );
  }
});
