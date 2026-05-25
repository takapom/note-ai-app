import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyOperationPolicy,
  forbiddenOperationTypes,
  shouldApplyOperation,
  validateOperationList,
  validateStructureOperation,
} from '../../contexts/ai-operations/src/contract/operationContract.ts';
import {
  forbiddenRewriteOperationFixture,
  validOperationFixtures,
} from '../../contexts/ai-operations/src/contract/operationFixtures.ts';

test('all MVP operation fixtures validate', () => {
  for (const operation of validOperationFixtures) {
    const result = validateStructureOperation(operation);
    assert.equal(result.ok, true, result.errors.join(', '));
  }
});

test('operation policy classification matches contract policy buckets', () => {
  assert.equal(classifyOperationPolicy(validOperationFixtures[0]), 'silent');
  assert.equal(classifyOperationPolicy(validOperationFixtures[2]), 'review');
  assert.equal(classifyOperationPolicy(validOperationFixtures[3]), 'inline');
  assert.equal(classifyOperationPolicy(validOperationFixtures[6]), 'silent');
  assert.equal(classifyOperationPolicy({ type: 'rewrite_user_block' }), 'blocked');
});

test('unknown and forbidden operation types are rejected', () => {
  assert.equal(validateStructureOperation({ type: 'unknown_operation' }).ok, false);

  for (const type of forbiddenOperationTypes) {
    const result = validateStructureOperation({ ...forbiddenRewriteOperationFixture, type });
    assert.equal(result.ok, false);
    assert.equal(result.policy, 'blocked');
  }
});

test('visible and memory-affecting operations require source spans and confidence', () => {
  const missingSource = {
    type: 'insert_assist_block',
    blockType: 'ai_question',
    content: 'Question without source.',
    position: { appendToSectionId: 'section_001' },
    confidence: 0.8,
  };
  assert.deepEqual(validateStructureOperation(missingSource).errors, [
    'sourceSpans must contain at least one source span',
  ]);

  const missingConfidence = {
    type: 'create_memory_candidate',
    targetSectionId: 'section_001',
    memoryType: 'past_decision',
    content: 'Memory without confidence.',
    sourceSpans: [{ blockId: 'block_001' }],
  };
  assert.deepEqual(validateStructureOperation(missingConfidence).errors, [
    'confidence must be a number between 0 and 1',
  ]);

  const missingStaleSource = {
    type: 'mark_stale',
    targetType: 'memory_candidate',
    targetId: 'memory_001',
    reason: 'The source block was substantially changed.',
  };
  assert.deepEqual(validateStructureOperation(missingStaleSource).errors, [
    'sourceSpans must contain at least one source span',
  ]);
});

test('AI response must be a list of operations', () => {
  assert.equal(validateOperationList(validOperationFixtures).ok, true);
  assert.equal(validateOperationList(validOperationFixtures).policy, 'review');
  assert.equal(validateOperationList({ type: 'no_op', reason: 'not a list' }).ok, false);
});

test('source spans and positions reject unstable blank or inverted ranges', () => {
  const invalidSpan = {
    type: 'create_semantic_unit',
    targetSectionId: 'section_001',
    unitType: 'claim',
    content: 'Invalid span claim.',
    summary: 'Invalid span.',
    sourceSpans: [{ blockId: ' ', startOffset: 10, endOffset: 4 }],
    confidence: 0.8,
  };

  assert.deepEqual(validateStructureOperation(invalidSpan).errors, [
    'sourceSpans[0].blockId is required',
    'sourceSpans[0].endOffset must be greater than or equal to startOffset',
  ]);

  const invalidPosition = {
    type: 'insert_assist_block',
    blockType: 'ai_question',
    content: 'Question with blank position.',
    position: { appendToSectionId: ' ' },
    sourceSpans: [{ blockId: 'block_001' }],
    confidence: 0.8,
  };

  assert.deepEqual(validateStructureOperation(invalidPosition).errors, [
    'position requires afterBlockId or appendToSectionId',
  ]);
});

test('low confidence operations are not applied', () => {
  const operation = {
    type: 'create_semantic_unit',
    targetSectionId: 'section_001',
    unitType: 'claim',
    content: 'Low confidence claim.',
    summary: 'Low confidence.',
    sourceSpans: [{ blockId: 'block_001' }],
    confidence: 0.2,
  };

  assert.equal(shouldApplyOperation(operation), false);
  assert.equal(shouldApplyOperation({ ...operation, confidence: 0.9 }), true);
});

test('projection operations require explicit targets and stable relation IDs', () => {
  assert.deepEqual(
    validateStructureOperation({
      type: 'create_semantic_unit',
      unitType: 'claim',
      content: 'Claim without target.',
      summary: 'Missing target.',
      sourceSpans: [{ blockId: 'block_001' }],
      confidence: 0.8,
    }).errors,
    ['targetSectionId must be a non-empty string'],
  );

  assert.deepEqual(
    validateStructureOperation({
      type: 'create_relation',
      fromUnitTempId: 'unit_tmp_001',
      toUnitId: 'unit_existing_001',
      relationType: 'supports',
      reason: 'Temp IDs are not stable route targets.',
      confidence: 0.8,
    }).errors,
    ['fromUnitId must be a non-empty string'],
  );
});
