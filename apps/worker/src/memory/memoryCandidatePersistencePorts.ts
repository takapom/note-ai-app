// Persistence ports for accepted memory candidate operation proposals.
// Authority: docs/contracts/memory.md

import type { MemoryItemContract } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { cloneMemory, isRecord, isStableRuntimeId, memoryKey, toPersistenceErrorMessage } from './memoryCandidateProposalHelpers.ts';
import type {
  MemoryCandidatePersistencePort,
  MemoryCandidatePersistenceResult,
  MemoryCandidateSqlExecutor,
  MemoryCandidateSqlStatement,
  MemoryCandidateWriteIntent,
} from './memoryCandidateProposalTypes.ts';

export class InMemoryMemoryCandidatePersistencePort implements MemoryCandidatePersistencePort {
  private readonly memories = new Map<string, MemoryItemContract>();

  async saveMemoryCandidate(writeIntent: MemoryCandidateWriteIntent): Promise<MemoryCandidatePersistenceResult> {
    const errors = validateMemoryCandidateWriteIntent(writeIntent);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const key = memoryKey(writeIntent.memory.workspaceId, writeIntent.memory.userId, writeIntent.memory.id);
    if (this.memories.has(key)) {
      return {
        ok: false,
        errors: [`memory ${writeIntent.memory.id} already exists in workspace ${writeIntent.workspaceId} for user ${writeIntent.userId}`],
      };
    }

    const memory = cloneMemory(writeIntent.memory);
    this.memories.set(key, memory);
    return { ok: true, errors: [], memory: cloneMemory(memory) };
  }

  listMemories(): MemoryItemContract[] {
    return Array.from(this.memories.values(), cloneMemory);
  }
}

export class TursoMemoryCandidatePersistenceAdapter implements MemoryCandidatePersistencePort {
  private readonly executor: MemoryCandidateSqlExecutor;

  constructor(input: { executor: MemoryCandidateSqlExecutor }) {
    this.executor = input.executor;
  }

  async saveMemoryCandidate(writeIntent: MemoryCandidateWriteIntent): Promise<MemoryCandidatePersistenceResult> {
    const errors = validateMemoryCandidateWriteIntent(writeIntent);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      await this.executor.write(mapMemoryCandidateWriteIntentToSql(writeIntent));
      return { ok: true, errors: [], memory: cloneMemory(writeIntent.memory) };
    } catch (error) {
      return {
        ok: false,
        errors: [toPersistenceErrorMessage('memory candidate save failed', error)],
      };
    }
  }
}

export function mapMemoryCandidateWriteIntentToSql(
  writeIntent: MemoryCandidateWriteIntent,
): MemoryCandidateSqlStatement {
  const errors = validateMemoryCandidateWriteIntent(writeIntent);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  const memory = writeIntent.memory;
  return {
    sql: [
      'insert into memory_items',
      '(id, workspace_id, user_id, type, content, status, pinned, source_unit_id, source_note_id, source_block_id, source_start_offset, source_end_offset, confidence, created_at, updated_at)',
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      memory.id,
      memory.workspaceId,
      memory.userId,
      memory.type,
      memory.content,
      memory.status,
      memory.pinned,
      memory.sourceUnitId ?? null,
      memory.sourceNoteId ?? null,
      memory.sourceSpan?.sourceBlockId ?? null,
      memory.sourceSpan?.startOffset ?? null,
      memory.sourceSpan?.endOffset ?? null,
      memory.confidence,
      memory.createdAt,
      memory.updatedAt,
    ],
  };
}

export function validateMemoryCandidateWriteIntent(writeIntent: unknown): string[] {
  if (!isRecord(writeIntent)) {
    return ['memory candidate write intent must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(writeIntent.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(writeIntent.userId)) {
    errors.push('userId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(writeIntent.sourceOperationId)) {
    errors.push('sourceOperationId must be a stable non-sentinel runtime id');
  }

  const memoryValidation = validateMemoryItem(writeIntent.memory);
  if (!memoryValidation.valid) {
    errors.push(...memoryValidation.errors.map((error) => `memory: ${error}`));
  } else {
    const memory = writeIntent.memory as MemoryItemContract;
    if (memory.workspaceId !== writeIntent.workspaceId) {
      errors.push('memory.workspaceId must match workspaceId');
    }
    if (memory.userId !== writeIntent.userId) {
      errors.push('memory.userId must match userId');
    }
    if (memory.id !== `memory_${writeIntent.sourceOperationId}`) {
      errors.push('memory.id must be derived from sourceOperationId');
    }
    if (memory.status !== 'candidate' && memory.status !== 'pending') {
      errors.push('memory.status must be candidate or pending');
    }
    if (memory.sourceUnitId !== undefined && !isStableRuntimeId(memory.sourceUnitId)) {
      errors.push('memory.sourceUnitId must be a stable non-sentinel runtime id when provided');
    }
    if (memory.sourceNoteId !== undefined && !isStableRuntimeId(memory.sourceNoteId)) {
      errors.push('memory.sourceNoteId must be a stable non-sentinel runtime id when provided');
    }
    if (memory.sourceSpan !== undefined && !isStableRuntimeId(memory.sourceSpan.sourceBlockId)) {
      errors.push('memory.sourceSpan.sourceBlockId must be a stable non-sentinel runtime id when provided');
    }
  }

  return errors;
}
