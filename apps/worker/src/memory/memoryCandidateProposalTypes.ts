// Runtime types for accepted memory candidate operation proposals.
// Authority: docs/contracts/memory.md

import type { MemoryItemContract } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import type { MemoryCandidateApprovalInput } from './memoryCandidateApprovalInput.ts';

export interface MemoryCandidateProposalBoundaryInput {
  memoryCandidatePersistence: MemoryCandidatePersistencePort;
  workspaceId: string;
  userId: string;
  approvalInput?: MemoryCandidateApprovalInput;
  now: number;
}

export interface MemoryCandidateWriteIntent {
  workspaceId: string;
  userId: string;
  sourceOperationId: string;
  memory: MemoryItemContract;
}

export interface MemoryCandidatePersistenceResult {
  ok: boolean;
  errors: string[];
  memory?: MemoryItemContract;
}

export interface MemoryCandidateProposalBoundaryResult extends MemoryCandidatePersistenceResult {
  writeIntent?: MemoryCandidateWriteIntent;
}

export interface MemoryCandidatePersistencePort {
  saveMemoryCandidate(writeIntent: MemoryCandidateWriteIntent): Promise<MemoryCandidatePersistenceResult>;
}

export interface MemoryCandidateSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface MemoryCandidateSqlExecutor {
  write(statement: MemoryCandidateSqlStatement): Promise<unknown>;
}

export interface CreateMemoryCandidateSourceSpan {
  blockId: string;
  startOffset?: number;
  endOffset?: number;
}

export interface CreateMemoryCandidateOperation {
  type: 'create_memory_candidate';
  targetSectionId: string;
  memoryType: MemoryItemContract['type'];
  content: string;
  sourceSpans: CreateMemoryCandidateSourceSpan[];
  confidence: number;
}
