import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOperationIds,
  routeGeneratedOperations,
} from '../../apps/worker/src/ai-operations/operationRoutingAdapter.ts';
import {
  forbiddenRewriteOperationFixture,
  validOperationFixtures,
} from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

const runtimeInput = {
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  operationIdPrefix: 'operation_batch_001',
  snapshot: operationRouterSnapshotFixture,
  now: 1_700_000_000_000,
  generatedBy: 'worker_runtime',
};

test('worker adapter generates stable operation ids before routing through Operation Router', () => {
  const result = routeGeneratedOperations({
    ...runtimeInput,
    aiResponse: [validOperationFixtures[0], validOperationFixtures[2], validOperationFixtures[5]],
  });

  assert.equal(result.ok, true);
  assert.equal(result.routedThroughOperationRouter, true);
  assert.deepEqual(result.directApplyResults, []);
  assert.deepEqual(result.operationIds, [
    'operation_batch_001_0',
    'operation_batch_001_1',
    'operation_batch_001_2',
  ]);
  assert.deepEqual(
    result.auditRecords.map((record) => record.id),
    result.operationIds,
  );
  assert.deepEqual(
    result.auditRecords.flatMap((record) => record.sourceSpans.map((span) => span.targetId)),
    ['operation_batch_001_0', 'operation_batch_001_1'],
  );
});

test('worker adapter creates one distinct operation id per operation', () => {
  const ids = createOperationIds('operation_batch_002', 4);

  assert.deepEqual(ids, [
    'operation_batch_002_0',
    'operation_batch_002_1',
    'operation_batch_002_2',
    'operation_batch_002_3',
  ]);
  assert.equal(new Set(ids).size, ids.length);

  assert.deepEqual(createOperationIds('operation_batch_003', 2, 4), [
    'operation_batch_003_4',
    'operation_batch_003_5',
  ]);
});

test('worker adapter leaves invalid AI response rejection to Operation Router', () => {
  const result = routeGeneratedOperations({
    ...runtimeInput,
    aiResponse: { type: 'create_semantic_unit' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.routedThroughOperationRouter, true);
  assert.deepEqual(result.errors, ['AI response must be an operation list']);
  assert.deepEqual(result.operationIds, []);
  assert.deepEqual(result.auditRecords, []);
  assert.deepEqual(result.directApplyResults, []);
});

test('worker adapter routes unsafe operation lists through Operation Router rejection', () => {
  const result = routeGeneratedOperations({
    ...runtimeInput,
    operationIdPrefix: 'operation_batch_unsafe',
    aiResponse: [validOperationFixtures[0], forbiddenRewriteOperationFixture],
  });

  assert.equal(result.ok, false);
  assert.equal(result.routedThroughOperationRouter, true);
  assert.deepEqual(result.operationIds, ['operation_batch_unsafe_0', 'operation_batch_unsafe_1']);
  assert.deepEqual(result.errors, ['operations[1]: operation type rewrite_user_block is forbidden in MVP']);
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.deepEqual(result.directApplyResults, []);
});

test('worker adapter rejects invalid runtime ids without sentinel operation ids', () => {
  const result = routeGeneratedOperations({
    ...runtimeInput,
    workspaceId: 'workspace_unset',
    operationIdPrefix: 'operation_placeholder',
    aiResponse: [validOperationFixtures[0]],
  });

  assert.equal(result.ok, false);
  assert.equal(result.policy, 'blocked');
  assert.equal(result.routedThroughOperationRouter, false);
  assert.deepEqual(result.operationIds, []);
  assert.deepEqual(result.auditRecords, []);
  assert.ok(result.errors.includes('workspaceId must be a stable non-sentinel runtime id'));
  assert.ok(result.errors.includes('operationIdPrefix must be a stable non-sentinel runtime id'));
});
