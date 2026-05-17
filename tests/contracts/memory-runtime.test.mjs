import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isContextEligibleMemory,
  transitionMemoryStatus,
  validateMemoryItem,
} from '../../contexts/memory/src/contract/memoryContract.ts';

const validMemory = {
  id: 'memory_001',
  workspaceId: 'workspace_001',
  userId: 'user_001',
  type: 'past_decision',
  content: 'The MVP keeps AI assistance inside the unified note surface.',
  sourceNoteId: 'note_001',
  confidence: 0.9,
  status: 'candidate',
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
};

test('memory items require source-backed provenance and valid primitives', () => {
  assert.equal(validateMemoryItem(validMemory).valid, true);

  assert.deepEqual(
    validateMemoryItem({
      ...validMemory,
      sourceNoteId: undefined,
    }).errors,
    ['memory item must include source provenance'],
  );

  assert.deepEqual(
    validateMemoryItem({
      ...validMemory,
      sourceNoteId: undefined,
      sourceSpan: { sourceBlockId: 'block_001', startOffset: 10, endOffset: 2 },
    }).errors,
    ['memory item must include source provenance', 'sourceSpan must be valid'],
  );
});

test('only active or pinned source-backed memory is context eligible', () => {
  assert.equal(isContextEligibleMemory({ ...validMemory, status: 'active' }), true);
  assert.equal(isContextEligibleMemory({ ...validMemory, status: 'pinned', pinned: true }), true);
  assert.equal(isContextEligibleMemory({ ...validMemory, status: 'rejected' }), false);
  assert.equal(isContextEligibleMemory({ ...validMemory, status: 'active', sourceNoteId: undefined }), false);
});

test('memory user actions own lifecycle transitions', () => {
  assert.equal(transitionMemoryStatus(validMemory, 'remember', 2).status, 'active');
  assert.equal(transitionMemoryStatus({ ...validMemory, pinned: true }, 'remember', 2).status, 'pinned');
  assert.equal(transitionMemoryStatus(validMemory, 'hold', 2).status, 'pending');
  assert.equal(transitionMemoryStatus(validMemory, 'different', 2).status, 'rejected');
  assert.equal(transitionMemoryStatus(validMemory, 'delete', 2).status, 'archived');
});
