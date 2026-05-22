// SQL statement mapping for source-backed memory candidate review.
// Authority: docs/contracts/memory.md

import { validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { isStableRuntimeId, isStatusOnlyMemoryReviewDecision, validateMemoryReviewInput } from './memoryReviewHelpers.ts';
import type { MemoryReviewInput, MemoryReviewRecord, MemoryReviewSqlStatement } from './memoryReviewTypes.ts';

export function mapMemoryReviewLookupToSql(input: MemoryReviewInput): MemoryReviewSqlStatement {
  const errors = validateMemoryReviewInput(input);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    sql: [
      'select id, workspace_id, user_id, type, content, status, pinned, source_unit_id, source_note_id, source_block_id, source_start_offset, source_end_offset, confidence, created_at, updated_at',
      'from memory_items',
      'where workspace_id = ? and user_id = ? and id = ?',
      'limit 2',
    ].join(' '),
    args: [
      input.workspaceId,
      input.userId as string,
      input.memoryId as string,
    ],
  };
}

export function mapMemoryReviewStatusUpdateToSql(memory: MemoryReviewRecord): MemoryReviewSqlStatement {
  const errors = validateMemoryItem(memory);
  if (!errors.valid) {
    throw new Error(errors.errors.join('; '));
  }
  if (!isStableRuntimeId(memory.reviewedByUserId)) {
    throw new Error('reviewedByUserId must be a stable non-sentinel runtime id');
  }
  if (!isStatusOnlyMemoryReviewDecision(memory.reviewDecision)) {
    throw new Error('reviewDecision must be accepted, rejected, archived, or held');
  }
  if (!Number.isFinite(memory.reviewedAt)) {
    throw new Error('reviewedAt must be a finite number');
  }

  return {
    sql: [
      'update memory_items',
      'set status = ?, pinned = ?, reviewed_at = ?, reviewed_by_user_id = ?, review_decision = ?, updated_at = ?',
      'where workspace_id = ? and user_id = ? and id = ? and status in (?, ?)',
    ].join(' '),
    args: [
      memory.status,
      memory.pinned,
      memory.reviewedAt,
      memory.reviewedByUserId,
      memory.reviewDecision,
      memory.updatedAt,
      memory.workspaceId,
      memory.userId,
      memory.id,
      'candidate',
      'pending',
    ],
  };
}

export function mapMemoryReviewContentUpdateToSql(memory: MemoryReviewRecord): MemoryReviewSqlStatement {
  const errors = validateMemoryItem(memory);
  if (!errors.valid) {
    throw new Error(errors.errors.join('; '));
  }
  if (!isStableRuntimeId(memory.reviewedByUserId)) {
    throw new Error('reviewedByUserId must be a stable non-sentinel runtime id');
  }
  if (memory.reviewDecision !== 'edited') {
    throw new Error('reviewDecision must be edited');
  }
  if (!Number.isFinite(memory.reviewedAt)) {
    throw new Error('reviewedAt must be a finite number');
  }

  return {
    sql: [
      'update memory_items',
      'set content = ?, status = ?, pinned = ?, reviewed_at = ?, reviewed_by_user_id = ?, review_decision = ?, updated_at = ?',
      'where workspace_id = ? and user_id = ? and id = ? and status in (?, ?)',
    ].join(' '),
    args: [
      memory.content,
      memory.status,
      memory.pinned,
      memory.reviewedAt,
      memory.reviewedByUserId,
      memory.reviewDecision,
      memory.updatedAt,
      memory.workspaceId,
      memory.userId,
      memory.id,
      'candidate',
      'pending',
    ],
  };
}
