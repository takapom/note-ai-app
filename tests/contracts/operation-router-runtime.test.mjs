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
  operationId: 'operation_runtime_base',
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
  const unknown = routeOperation({ type: ' unknown_operation ' }, operationRouterSnapshotFixture, routeOptions);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.policy, 'blocked');
  assert.equal(unknown.status, 'rejected');
  assert.equal(unknown.applyResult.action, 'reject');
  assert.deepEqual(unknown.errors, ['unknown operation type  unknown_operation ']);
  assert.equal(unknown.auditRecord.operationType, 'unknown_operation');
  assert.deepEqual(unknown.auditRecord.errors, ['unknown operation type  unknown_operation']);

  const forbidden = routeOperation(forbiddenRewriteOperationFixture, operationRouterSnapshotFixture, routeOptions);
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.policy, 'blocked');
  assert.equal(forbidden.auditRecord.operationType, 'rewrite_user_block');
  assert.match(forbidden.errors[0], /forbidden/);
});

test('missing or blank workspaceId rejects without emitting workspace sentinel', () => {
  const missingWorkspace = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    operationId: 'operation_missing_workspace',
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
    operationIds: ['operation_list_missing_workspace'],
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
  assert.deepEqual(blankOperationId.errors, ['operationId must be a non-empty string']);
  assert.equal(blankOperationId.auditRecord, undefined);

  const nonFiniteNow = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    operationId: 'operation_invalid_now',
    now: Number.NaN,
  });
  assert.equal(nonFiniteNow.ok, false);
  assert.deepEqual(nonFiniteNow.errors, ['now must be a finite number when provided']);
  assert.equal(Number.isFinite(nonFiniteNow.auditRecord.createdAt), true);
  assert.equal(Number.isFinite(nonFiniteNow.auditRecord.updatedAt), true);

  const blankOptionalIds = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: ' workspace_001 ',
    operationId: ' operation_blank_optional_ids ',
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
    operationId: 'operation_invalid_sequence',
    now: 1,
    sequence: Number.NaN,
  });
  assert.equal(invalidSequence.ok, false);
  assert.deepEqual(invalidSequence.errors, ['sequence must be a finite non-negative integer when provided']);
  assert.equal(invalidSequence.auditRecord.id, 'operation_invalid_sequence');
  assert.equal(invalidSequence.auditRecord.id.includes('NaN'), false);

  const invalidListSequence = routeOperationList([validOperationFixtures[0]], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    operationIds: ['operation_invalid_list_sequence'],
    now: 1,
    sequence: Number.NaN,
  });
  assert.equal(invalidListSequence.ok, false);
  assert.deepEqual(invalidListSequence.errors, [
    'sequence must be a finite non-negative integer when provided',
  ]);
  assert.deepEqual(invalidListSequence.auditRecords, []);

  const lowConfidenceWithInvalidThreshold = routeOperation(
    {
      ...validOperationFixtures[0],
      confidence: 0.1,
    },
    operationRouterSnapshotFixture,
    {
      workspaceId: routeOptions.workspaceId,
      operationId: 'operation_invalid_threshold',
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
    operationId: 'operation_negative_threshold',
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
    {
      ...routeOptions,
      operationIds: [
        'operation_list_001',
        'operation_list_002',
        'operation_list_003',
        'operation_list_004',
      ],
    },
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
    {
      ...routeOptions,
      operationIds: ['operation_unsafe_001', 'operation_unsafe_002'],
    },
  );

  assert.equal(unsafeList.ok, false);
  assert.equal(unsafeList.policy, 'blocked');
  assert.equal(unsafeList.acceptedCount, 1);
  assert.equal(unsafeList.rejectedCount, 1);
  assert.deepEqual(unsafeList.errors, ['operations[1]: operation type rewrite_user_block is forbidden in MVP']);
});

test('operation list routing requires unique caller supplied operation ids', () => {
  const missingIds = routeOperationList([validOperationFixtures[0]], operationRouterSnapshotFixture, routeOptions);
  assert.equal(missingIds.ok, false);
  assert.deepEqual(missingIds.errors, ['operationIds must be an array for operation list routing']);

  const duplicateIds = routeOperationList(
    [validOperationFixtures[0], validOperationFixtures[2]],
    operationRouterSnapshotFixture,
    {
      ...routeOptions,
      operationIds: ['operation_dup', ' operation_dup '],
    },
  );
  assert.equal(duplicateIds.ok, false);
  assert.deepEqual(duplicateIds.errors, ['operationIds[1] duplicates another operation id']);

  const invalidSequence = routeOperationList(
    [validOperationFixtures[0], validOperationFixtures[2]],
    operationRouterSnapshotFixture,
    {
      ...routeOptions,
      operationIds: ['operation_seq_001', 'operation_seq_002'],
      sequence: -1,
    },
  );
  assert.equal(invalidSequence.ok, false);
  assert.deepEqual(invalidSequence.auditRecords, []);
  assert.deepEqual(invalidSequence.errors, ['sequence must be a finite non-negative integer when provided']);
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
  assert.equal(rejected.auditRecord, undefined);
});

test('operation revert rejects invalid audit record primitives', () => {
  const routed = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_revert_invalid_001',
  });
  const result = revertOperationAuditRecord({
    ...routed.auditRecord,
    id: ' operation_revert_invalid_001 ',
    workspaceId: ' workspace_001 ',
    operationType: ' create_semantic_unit ',
    policy: 'unsafe_policy',
    noteId: '',
    structureJobId: '',
    targetType: 'unsafe_target',
    targetId: '',
    generatedBy: ' ai ',
    errors: [1, ' ', ' padded '],
    createdAt: Number.NaN,
    sourceSpans: [
      {
        ...routed.auditRecord.sourceSpans[0],
        targetType: 'block',
        targetId: ' operation_revert_invalid_001 ',
        sourceBlockId: ' block_001 ',
        reason: ' create_semantic_unit ',
        startOffset: 4,
        endOffset: 1,
      },
    ],
    status: 'applied',
  }, routeOptions.now + 1);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.ok(result.errors.includes('auditRecord.id must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.workspaceId must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.operationType must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.policy must be one of silent, inline, review, blocked'));
  assert.ok(result.errors.includes('auditRecord.noteId must be a non-empty string when provided'));
  assert.ok(result.errors.includes('auditRecord.structureJobId must be a non-empty string when provided'));
  assert.ok(result.errors.includes('auditRecord.targetType must be one of block, section, semantic_unit, memory_candidate, assist_block'));
  assert.ok(result.errors.includes('auditRecord.targetId must be a non-empty string when provided'));
  assert.ok(result.errors.includes('auditRecord.generatedBy must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.errors[0] must be a non-empty string'));
  assert.ok(result.errors.includes('auditRecord.errors[1] must be a non-empty string'));
  assert.ok(result.errors.includes('auditRecord.errors[2] must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.createdAt must be a finite number'));
  assert.ok(result.errors.includes('auditRecord.sourceSpans[0].targetType must be operation'));
  assert.ok(result.errors.includes('auditRecord.sourceSpans[0].targetId must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.sourceSpans[0].sourceBlockId must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.sourceSpans[0].reason must be trimmed'));
  assert.ok(result.errors.includes('auditRecord.sourceSpans[0].endOffset must be greater than or equal to startOffset'));
  assert.equal(result.auditRecord, undefined);

  const malformed = revertOperationAuditRecord({
    ...routed.auditRecord,
    errors: undefined,
    sourceSpans: [null],
    status: 'applied',
  }, routeOptions.now + 1);

  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, 'failed');
  assert.ok(malformed.errors.includes('auditRecord.errors must be an array'));
  assert.ok(malformed.errors.includes('auditRecord.sourceSpans[0] must be an object'));
  assert.equal(malformed.auditRecord, undefined);

  const nonObject = revertOperationAuditRecord(null, routeOptions.now + 1);
  assert.equal(nonObject.ok, false);
  assert.deepEqual(nonObject.errors, [
    'auditRecord must be an object',
    'operation status undefined cannot be reverted',
  ]);
  assert.equal(nonObject.auditRecord, undefined);

  const partialTarget = revertOperationAuditRecord({
    ...routed.auditRecord,
    targetType: 'section',
    targetId: undefined,
    status: 'applied',
  }, routeOptions.now + 1);

  assert.equal(partialTarget.ok, false);
  assert.ok(partialTarget.errors.includes('auditRecord targetType and targetId must be provided together'));

  const untrimmedTarget = revertOperationAuditRecord({
    ...routed.auditRecord,
    targetId: ' section_001 ',
    status: 'applied',
  }, routeOptions.now + 1);

  assert.equal(untrimmedTarget.ok, false);
  assert.ok(untrimmedTarget.errors.includes('auditRecord.targetId must be trimmed when provided'));

  const missingOperation = revertOperationAuditRecord({
    ...routed.auditRecord,
    operation: undefined,
    status: 'applied',
  }, routeOptions.now + 1);
  assert.equal(missingOperation.ok, false);
  assert.ok(missingOperation.errors.includes('auditRecord.operation is required'));

  const mismatchedSpanTarget = revertOperationAuditRecord({
    ...routed.auditRecord,
    sourceSpans: [
      {
        ...routed.auditRecord.sourceSpans[0],
        targetId: 'operation_other',
      },
    ],
    status: 'applied',
  }, routeOptions.now + 1);
  assert.equal(mismatchedSpanTarget.ok, false);
  assert.ok(mismatchedSpanTarget.errors.includes('auditRecord.sourceSpans[0].targetId must match auditRecord.id'));

  const invalidOperation = revertOperationAuditRecord({
    ...routed.auditRecord,
    operation: { type: 'rewrite_user_block' },
    status: 'applied',
  }, routeOptions.now + 1);
  assert.equal(invalidOperation.ok, false);
  assert.ok(invalidOperation.errors.includes('auditRecord.operation: operation type rewrite_user_block is forbidden in MVP'));

  const mismatchedOperationType = revertOperationAuditRecord({
    ...routed.auditRecord,
    operationType: 'create_memory_candidate',
    status: 'applied',
  }, routeOptions.now + 1);
  assert.equal(mismatchedOperationType.ok, false);
  assert.ok(mismatchedOperationType.errors.includes('auditRecord.operationType must match auditRecord.operation.type'));

  const mismatchedPolicy = revertOperationAuditRecord({
    ...routed.auditRecord,
    policy: 'review',
    status: 'applied',
  }, routeOptions.now + 1);
  assert.equal(mismatchedPolicy.ok, false);
  assert.ok(mismatchedPolicy.errors.includes('auditRecord.policy must match auditRecord.operation policy'));
});

test('caller supplied operation audit IDs remain stable and distinct', () => {
  const first = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_runtime_001',
  });
  const second = routeOperation(validOperationFixtures[2], operationRouterSnapshotFixture, {
    ...routeOptions,
    operationId: 'operation_runtime_002',
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.auditRecord.id, second.auditRecord.id);
  assert.equal(first.auditRecord.id, 'operation_runtime_001');
  assert.equal(second.auditRecord.id, 'operation_runtime_002');
});

test('operationId is required for auditable routes', () => {
  const result = routeOperation(validOperationFixtures[0], operationRouterSnapshotFixture, {
    workspaceId: routeOptions.workspaceId,
    now: routeOptions.now,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['operationId must be a non-empty string']);
  assert.equal(result.auditRecord, undefined);
});
