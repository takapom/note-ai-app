// Validation and mapping helpers for memory candidate proposal persistence.
// Authority: docs/contracts/memory.md

import type { MemoryItemContract } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { memoryTypes } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import type {
  CreateMemoryCandidateOperation,
  CreateMemoryCandidateSourceSpan,
  MemoryCandidateProposalBoundaryInput,
  MemoryCandidateWriteIntent,
} from './memoryCandidateProposalTypes.ts';

export function validateBoundaryInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['memory candidate proposal boundary input must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.userId)) {
    errors.push('userId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }
  if (!isRecord(input.memoryCandidatePersistence) ||
    typeof input.memoryCandidatePersistence.saveMemoryCandidate !== 'function') {
    errors.push('memoryCandidatePersistence must implement saveMemoryCandidate');
  }

  return errors;
}

export function validateMemoryCandidateApprovalInputScope(input: MemoryCandidateProposalBoundaryInput): string[] {
  const intent = input.approvalInput;
  if (intent === undefined) {
    return [];
  }

  const errors: string[] = [];
  if (intent.type !== 'memory_candidate_from_accepted_operation') {
    errors.push('approvalInput.type must be memory_candidate_from_accepted_operation');
  }
  if (!isStableRuntimeId(intent.workspaceId)) {
    errors.push('approvalInput.workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(intent.operationId)) {
    errors.push('approvalInput.operationId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(intent.acceptedAt)) {
    errors.push('approvalInput.acceptedAt must be a finite number');
  }
  if (intent.workspaceId !== input.workspaceId) {
    errors.push('approvalInput.workspaceId must match workspaceId');
  }
  if (!isRecord(intent.auditRecord)) {
    errors.push('approvalInput.auditRecord must be an object');
    return errors;
  }
  if (intent.auditRecord.id !== intent.operationId) {
    errors.push('approvalInput.auditRecord.id must match approvalInput.operationId');
  }
  if (intent.auditRecord.workspaceId !== input.workspaceId) {
    errors.push('approvalInput.auditRecord.workspaceId must match workspaceId');
  }
  if (intent.auditRecord.status !== 'proposed') {
    errors.push('approvalInput.auditRecord.status must be proposed');
  }
  if (intent.auditRecord.policy !== 'review' && intent.auditRecord.operationType === 'create_memory_candidate') {
    errors.push('approvalInput.auditRecord.policy must be review for create_memory_candidate');
  }
  if (intent.auditRecord.noteId !== undefined && !isStableRuntimeId(intent.auditRecord.noteId)) {
    errors.push('approvalInput.auditRecord.noteId must be a stable non-sentinel runtime id when provided');
  }

  return errors;
}

export function mapCreateMemoryCandidateOperationToMemory(input: {
  workspaceId: string;
  userId: string;
  operationId: string;
  noteId?: string;
  operation: CreateMemoryCandidateOperation;
  now: number;
}): MemoryItemContract {
  const sourceSpan = mapFirstCompleteSourceSpan(input.operation);

  return {
    id: `memory_${input.operationId}`,
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: input.operation.memoryType,
    content: input.operation.content,
    ...(input.noteId === undefined ? {} : { sourceNoteId: input.noteId }),
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
    confidence: input.operation.confidence,
    status: 'candidate',
    pinned: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function mapFirstCompleteSourceSpan(
  operation: CreateMemoryCandidateOperation,
): MemoryItemContract['sourceSpan'] {
  const [first] = operation.sourceSpans;
  if (first === undefined || first.startOffset === undefined || first.endOffset === undefined) {
    return undefined;
  }

  return {
    sourceBlockId: first.blockId,
    startOffset: first.startOffset,
    endOffset: first.endOffset,
  };
}

export function isCreateMemoryCandidateOperation(
  operation: unknown,
): operation is CreateMemoryCandidateOperation {
  return isRecord(operation) && operation.type === 'create_memory_candidate';
}

export function validateCreateMemoryCandidateOperation(operation: unknown): string[] {
  if (!isRecord(operation)) {
    return ['operation must be an object'];
  }

  const errors: string[] = [];
  if (operation.type !== 'create_memory_candidate') {
    errors.push('operation must be create_memory_candidate');
  }
  if (!isNonEmptyString(operation.targetSectionId)) {
    errors.push('targetSectionId must be a non-empty string');
  }
  if (typeof operation.memoryType !== 'string' || !(memoryTypes as readonly string[]).includes(operation.memoryType)) {
    errors.push(`memoryType must be one of ${memoryTypes.join(', ')}`);
  }
  if (!isNonEmptyString(operation.content)) {
    errors.push('content must be a non-empty string');
  }
  validateCreateMemoryCandidateSourceSpans(operation.sourceSpans, errors);
  if (typeof operation.confidence !== 'number' ||
    !Number.isFinite(operation.confidence) ||
    operation.confidence < 0 ||
    operation.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  return errors;
}

export function validateCreateMemoryCandidateSourceSpans(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('sourceSpans must contain at least one source span');
    return;
  }

  for (const [index, span] of value.entries()) {
    if (!isRecord(span) || !isNonEmptyString(span.blockId)) {
      errors.push(`sourceSpans[${index}].blockId is required`);
    }
    if (isRecord(span) && span.startOffset !== undefined && !isNonNegativeFiniteNumber(span.startOffset)) {
      errors.push(`sourceSpans[${index}].startOffset must be non-negative`);
    }
    if (isRecord(span) && span.endOffset !== undefined && !isNonNegativeFiniteNumber(span.endOffset)) {
      errors.push(`sourceSpans[${index}].endOffset must be non-negative`);
    }
    if (
      isRecord(span) &&
      isNonNegativeFiniteNumber(span.startOffset) &&
      isNonNegativeFiniteNumber(span.endOffset) &&
      span.endOffset < span.startOffset
    ) {
      errors.push(`sourceSpans[${index}].endOffset must be greater than or equal to startOffset`);
    }
  }
}

export function memoryKey(workspaceId: string, userId: string, memoryId: string): string {
  return `${workspaceId}\u0000${userId}\u0000${memoryId}`;
}

export function cloneWriteIntent(writeIntent: MemoryCandidateWriteIntent): MemoryCandidateWriteIntent {
  return {
    workspaceId: writeIntent.workspaceId,
    userId: writeIntent.userId,
    sourceOperationId: writeIntent.sourceOperationId,
    memory: cloneMemory(writeIntent.memory),
  };
}

export function cloneMemory(memory: MemoryItemContract): MemoryItemContract {
  return {
    ...memory,
    ...(memory.sourceSpan === undefined ? {} : { sourceSpan: { ...memory.sourceSpan } }),
  };
}

export function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toPersistenceErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}
