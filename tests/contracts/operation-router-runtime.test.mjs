import assert from 'node:assert/strict';
import test from 'node:test';

import {
  revertOperationAuditRecord,
  routeOperation,
  routeOperationList,
} from '../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import {
  emptyOperationRouterSnapshotFixture,
  operationRouterSnapshotFixture,
} from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';
import {
  forbiddenRewriteOperationFixture,
  validOperationFixtures,
} from '../../contexts/ai-operations/src/contract/operationFixtures.ts';

const routeOptions = {
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_001',
  now: 1_700_000_000_000,
};

test('valid silent operation routes as accepted proposed apply decision', () => {
  const result = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_silent_001',
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.policy, 'silent');
  assert.equal(result.status, 'proposed');
  assert.equal(result.applyResult.action, 'apply');
  assert.equal(result.auditRecord.operationType, 'create_semantic_unit');
  assert.equal(result.auditRecord.targetType, 'section');
  assert.equal(result.auditRecord.targetId, 'section_001');
  assert.equal(result.auditRecord.status, 'proposed');
  assert.equal(result.auditRecord.sourceSpans[0].sourceBlockId, 'block_001');
});

test('inline assist block routes as inline with target and source validation', () => {
  const result = routeOperation(validOperationFixtures[3], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_inline_001',
  });

  assert.equal(result.ok, true);
  assert.equal(result.policy, 'inline');
  assert.deepEqual(result.applyResult, {
    action: 'propose',
    effect: 'insert_assist_block',
    policy: 'inline',
    reason: 'inline assist block requires UI/runtime insertion boundary',
  });
  assert.equal(result.auditRecord.targetType, 'section');
  assert.equal(result.auditRecord.targetId, 'section_001');
  assert.equal(result.auditRecord.sourceSpans[0].sourceBlockId, 'block_002');
});

test('memory candidate routes as review and keeps source-backed audit record', () => {
  const result = routeOperation(validOperationFixtures[2], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_memory_001',
  });

  assert.equal(result.ok, true);
  assert.equal(result.policy, 'review');
  assert.equal(result.applyResult.action, 'propose');
  assert.equal(result.applyResult.effect, 'create_memory_candidate');
  assert.equal(result.auditRecord.confidence, 0.88);
  assert.equal(result.auditRecord.sourceSpans[0].reason, 'create_memory_candidate');
});

test('unknown and forbidden operations route as blocked rejected records', () => {
  const unknown = routeOperation({ type: 'unknown_operation' }, operationRouterSnapshotFixture, routeOptions);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.policy, 'blocked');
  assert.equal(unknown.status, 'rejected');
  assert.equal(unknown.applyResult.action, 'reject');
  assert.deepEqual(unknown.errors, ['unknown operation type unknown_operation']);

  const forbidden = routeOperation(forbiddenRewriteOperationFixture, operationRouterSnapshotFixture, routeOptions);
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.policy, 'blocked');
  assert.equal(forbidden.auditRecord.operationType, 'rewrite_user_block');
  assert.match(forbidden.errors[0], /forbidden/);
});

test('missing or blank workspaceId rejects without emitting workspace sentinel', () => {
  const missingWorkspace = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    now: routeOptions.now,
  });
  const blankWorkspace = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    ...routeOptions,
    workspaceId: '   ',
  });

  for (const result of [missingWorkspace, blankWorkspace]) {
    assert.equal(result.ok, false);
    assert.equal(result.accepted, false);
    assert.equal(result.policy, 'blocked');
    assert.equal(result.status, 'rejected');
    assert.deepEqual(result.errors, ['workspaceId must be a non-empty string']);
    assert.equal(result.applyResult.action, 'reject');
    assert.equal(result.auditRecord, undefined);
  }

  const listResult = routeOperationList([validOperationFixtures[0]], operationRouterSnapshotFixture, {
    now: routeOptions.now,
  });
  assert.equal(listResult.ok, false);
  assert.deepEqual(listResult.auditRecords, []);
});

test('invalid route option primitives reject without leaking invalid audit fields', () => {
  const blankOperationId = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    operationId: '   ',
    now: 1,
  });
  assert.equal(blankOperationId.ok, false);
  assert.deepEqual(blankOperationId.errors, ['operationId must be a non-empty string when provided']);
  assert.equal(blankOperationId.auditRecord.id, 'operation_1_0');

  const nonFiniteNow = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    now: Number.NaN,
  });
  assert.equal(nonFiniteNow.ok, false);
  assert.deepEqual(nonFiniteNow.errors, ['now must be a finite number when provided']);
  assert.equal(Number.isFinite(nonFiniteNow.auditRecord.createdAt), true);
  assert.equal(Number.isFinite(nonFiniteNow.auditRecord.updatedAt), true);

  const blankOptionalIds = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: ' workspace_001 ',
    noteId: '   ',
    structureJobId: '   ',
    generatedBy: '   ',
    now: 1,
  });
  assert.equal(blankOptionalIds.ok, false);
  assert.deepEqual(blankOptionalIds.errors, [
    'noteId must be a non-empty string when provided',
    'structureJobId must be a non-empty string when provided',
    'generatedBy must be a non-empty string when provided',
  ]);
  assert.equal(blankOptionalIds.auditRecord.workspaceId, 'workspace_001');
  assert.equal(blankOptionalIds.auditRecord.noteId, undefined);
  assert.equal(blankOptionalIds.auditRecord.structureJobId, undefined);
  assert.equal(blankOptionalIds.auditRecord.generatedBy, 'ai');

  const invalidSequence = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    now: 1,
    sequence: Number.NaN,
  });
  assert.equal(invalidSequence.ok, false);
  assert.deepEqual(invalidSequence.errors, ['sequence must be a finite non-negative integer when provided']);
  assert.equal(invalidSequence.auditRecord.id, 'operation_1_0');
  assert.equal(invalidSequence.auditRecord.id.includes('NaN'), false);

  const invalidListSequence = routeOperationList([validOperationFixtures[0]], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    now: 1,
    sequence: Number.NaN,
  });
  assert.equal(invalidListSequence.ok, false);
  assert.deepEqual(invalidListSequence.errors, [
    'operations[0]: sequence must be a finite non-negative integer when provided',
  ]);
  assert.equal(invalidListSequence.auditRecords[0].id, 'operation_1_0');

  const lowConfidenceWithInvalidThreshold = routeOperation(
    {
      ...validOperationFixtures[0],
      confidence: 0.1,
    },
    operationRouterSnapshotFixture,
    {
      workspaceId: routeOptions.workspaceId,
      now: 1,
      confidenceThreshold: Number.NaN,
    },
  );
  assert.equal(lowConfidenceWithInvalidThreshold.ok, false);
  assert.deepEqual(lowConfidenceWithInvalidThreshold.errors, [
    'confidenceThreshold must be a finite number between 0 and 1 when provided',
  ]);
  assert.equal(lowConfidenceWithInvalidThreshold.applyResult.action, 'reject');

  const negativeConfidenceThreshold = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    now: 1,
    confidenceThreshold: -1,
  });
  assert.equal(negativeConfidenceThreshold.ok, false);
  assert.deepEqual(negativeConfidenceThreshold.errors, [
    'confidenceThreshold must be a finite number between 0 and 1 when provided',
  ]);
  assert.equal(negativeConfidenceThreshold.applyResult.action, 'reject');
});

test('valid string route options are trimmed in audit records', () => {
  const result = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: ' workspace_001 ',
    operationId: ' operation_trimmed_001 ',
    noteId: ' note_001 ',
    structureJobId: ' structure_job_001 ',
    generatedBy: ' ai-router ',
    now: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.auditRecord.id, 'operation_trimmed_001');
  assert.equal(result.auditRecord.workspaceId, 'workspace_001');
  assert.equal(result.auditRecord.noteId, 'note_001');
  assert.equal(result.auditRecord.structureJobId, 'structure_job_001');
  assert.equal(result.auditRecord.generatedBy, 'ai-router');
});

test('missing source spans are rejected before routing can apply', () => {
  const result = routeOperation(
    {
      type: 'insert_assist_block',
      blockType: 'ai_question',
      content: 'Question without source.',
      position: { appendToSectionId: 'section_001' },
      confidence: 0.8,
    },
    operationRouterSnapshotFixture,
    routeOptions,
  );

  assert.equal(result.ok, false);
  assert.equal(result.policy, 'blocked');
  assert.deepEqual(result.errors, ['sourceSpans must contain at least one source span']);
  assert.equal(result.applyResult.action, 'reject');
  assert.equal(result.auditRecord.workspaceId, routeOptions.workspaceId);
  assert.equal(result.auditRecord.status, 'rejected');
});

test('missing source or target IDs reject otherwise valid operations', () => {
  const missingTarget = routeOperation(
    {
      type: 'insert_assist_block',
      blockType: 'ai_question',
      content: 'Question with missing section.',
      position: { appendToSectionId: 'section_missing' },
      sourceSpans: [{ blockId: 'block_002' }],
      confidence: 0.8,
    },
    operationRouterSnapshotFixture,
    routeOptions,
  );

  assert.equal(missingTarget.ok, false);
  assert.deepEqual(missingTarget.errors, ['position.appendToSectionId section_missing does not exist']);

  const missingSource = routeOperation(validOperationFixtures[0], emptyOperationRouterSnapshotFixture, routeOptions);
  assert.equal(missingSource.ok, false);
  assert.deepEqual(missingSource.errors, [
    'sourceSpans[0].blockId block_001 does not exist',
    'targetSectionId section_001 does not exist',
  ]);
});

test('source spans must reference user-authored blocks', () => {
  const result = routeOperation(
    {
      ...validOperationFixtures[0],
      sourceSpans: [{ blockId: 'assist_block_001' }],
    },
    operationRouterSnapshotFixture,
    routeOptions,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'sourceSpans[0].blockId assist_block_001 must reference a user-authored block',
  ]);
});

test('low confidence operation is not applied', () => {
  const result = routeOperation(
    {
      ...validOperationFixtures[0],
      confidence: 0.2,
    },
    operationRouterSnapshotFixture,
    routeOptions,
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.errors, ['confidence 0.2 is below threshold 0.5']);
  assert.deepEqual(result.applyResult, {
    action: 'no_apply',
    effect: 'create_semantic_unit',
    reason: 'operation confidence is below threshold',
  });
});

test('no_op is accepted without apply side effects', () => {
  const result = routeOperation(validOperationFixtures[5], operationRouterSnapshotFixture, routeOptions);

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.policy, 'silent');
  assert.equal(result.status, 'proposed');
  assert.deepEqual(result.applyResult, {
    action: 'no_apply',
    effect: 'no_op',
    reason: 'No stable structure can be inferred from the target section.',
  });
  assert.deepEqual(result.auditRecord.sourceSpans, []);
});

test('operation lists combine policy and reject unsafe members', () => {
  const validList = routeOperationList(
    [validOperationFixtures[0], validOperationFixtures[3], validOperationFixtures[2], validOperationFixtures[5]],
    operationRouterSnapshotFixture,
    routeOptions,
  );

  assert.equal(validList.ok, true);
  assert.equal(validList.policy, 'review');
  assert.equal(validList.acceptedCount, 4);
  assert.equal(validList.rejectedCount, 0);
  assert.deepEqual(
    validList.applyResults.map((result) => result.action),
    ['apply', 'propose', 'propose', 'no_apply'],
  );

  const unsafeList = routeOperationList(
    [validOperationFixtures[0], forbiddenRewriteOperationFixture],
    operationRouterSnapshotFixture,
    routeOptions,
  );

  assert.equal(unsafeList.ok, false);
  assert.equal(unsafeList.policy, 'blocked');
  assert.equal(unsafeList.acceptedCount, 1);
  assert.equal(unsafeList.rejectedCount, 1);
  assert.deepEqual(unsafeList.errors, ['operations[1]: operation type rewrite_user_block is forbidden in MVP']);
});

test('operation audit records can be reverted through router status transition', () => {
  const routed = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_revert_001',
  });
  const appliedRecord = {
    ...routed.auditRecord,
    status: 'applied',
  };
  const reverted = revertOperationAuditRecord(appliedRecord, routeOptions.now + 1);

  assert.equal(reverted.ok, true);
  assert.equal(reverted.status, 'reverted');
  assert.equal(reverted.auditRecord.status, 'reverted');
  assert.equal(reverted.auditRecord.updatedAt, routeOptions.now + 1);

  const rejected = revertOperationAuditRecord({
    ...appliedRecord,
    status: 'rejected',
  }, routeOptions.now + 2);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 'failed');
  assert.deepEqual(rejected.errors, ['operation status rejected cannot be reverted']);
});
