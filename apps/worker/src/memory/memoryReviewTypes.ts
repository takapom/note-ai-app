// Runtime types for source-backed memory candidate review.
// Authority: docs/contracts/memory.md

import type { MemoryItemContract } from '../../../../contexts/memory/src/contract/memoryContract.ts';

export type MemoryReviewDecision = 'accepted' | 'rejected' | 'edited' | 'archived' | 'held';

export interface MemoryReviewInput {
  workspaceId: string;
  userId?: string;
  memoryId?: string;
  now: number;
  body?: unknown;
}

export interface MemoryReviewRecord extends MemoryItemContract {
  reviewedAt?: number;
  reviewedByUserId?: string;
  reviewDecision?: MemoryReviewDecision;
}

export interface MemoryReviewResult {
  ok: boolean;
  errors: string[];
  body?: {
    memory: MemoryReviewRecord;
  };
}

export interface MemoryReviewPort {
  acceptMemory(input: MemoryReviewInput): Promise<MemoryReviewResult>;
  rejectMemory(input: MemoryReviewInput): Promise<MemoryReviewResult>;
  editMemory(input: MemoryReviewInput): Promise<MemoryReviewResult>;
  deleteMemory(input: MemoryReviewInput): Promise<MemoryReviewResult>;
  holdMemory(input: MemoryReviewInput): Promise<MemoryReviewResult>;
}

export interface MemoryReviewSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface MemoryReviewSqlWriteResult {
  rowsAffected?: number;
  changes?: number;
}

export interface MemoryReviewSqlExecutor {
  query(statement: MemoryReviewSqlStatement): Promise<readonly Record<string, unknown>[]>;
  write(statement: MemoryReviewSqlStatement): Promise<MemoryReviewSqlWriteResult | void>;
}
