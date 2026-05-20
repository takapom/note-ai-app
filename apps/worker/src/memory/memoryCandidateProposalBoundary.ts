// Runtime boundary for accepted memory candidate operation proposals.
// Authority: docs/contracts/memory.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/repository-topology.md

import type { MemoryItemContract } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import { memoryTypes, validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
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

interface CreateMemoryCandidateSourceSpan {
  blockId: string;
  startOffset?: number;
  endOffset?: number;
}

interface CreateMemoryCandidateOperation {
  type: 'create_memory_candidate';
  targetSectionId: string;
  memoryType: MemoryItemContract['type'];
  content: string;
  sourceSpans: CreateMemoryCandidateSourceSpan[];
  confidence: number;
}

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

export async function runMemoryCandidateProposalBoundary(
  input: MemoryCandidateProposalBoundaryInput,
): Promise<MemoryCandidateProposalBoundaryResult> {
  const prepared = prepareMemoryCandidateWriteIntent(input);
  if (!prepared.ok) {
    return { ok: false, errors: prepared.errors };
  }
  if (prepared.writeIntent === undefined) {
    return { ok: true, errors: [] };
  }

  const persisted = await input.memoryCandidatePersistence.saveMemoryCandidate(prepared.writeIntent);
  return {
    ok: persisted.ok,
    errors: persisted.errors,
    ...(persisted.memory === undefined ? {} : { memory: persisted.memory }),
    ...(persisted.ok ? { writeIntent: cloneWriteIntent(prepared.writeIntent) } : {}),
  };
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

export function prepareMemoryCandidateWriteIntent(
  input: MemoryCandidateProposalBoundaryInput,
): { ok: true; writeIntent?: MemoryCandidateWriteIntent } | { ok: false; errors: string[] } {
  const inputErrors = validateBoundaryInput(input);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }

  if (input.approvalInput === undefined) {
    return { ok: true };
  }

  const intentErrors = validateMemoryCandidateApprovalInputScope(input);
  if (intentErrors.length > 0) {
    return { ok: false, errors: intentErrors };
  }

  if (input.approvalInput.auditRecord.operationType !== 'create_memory_candidate') {
    return { ok: true };
  }

  const operation = input.approvalInput.auditRecord.operation;
  const operationErrors = validateCreateMemoryCandidateOperation(operation);
  if (operationErrors.length > 0 || !isCreateMemoryCandidateOperation(operation)) {
    return {
      ok: false,
      errors: operationErrors.length > 0
        ? operationErrors.map((error) => `approvalInput.auditRecord.operation: ${error}`)
        : ['approvalInput.auditRecord.operation must be create_memory_candidate'],
    };
  }

  const memory = mapCreateMemoryCandidateOperationToMemory({
    workspaceId: input.workspaceId,
    userId: input.userId,
    operationId: input.approvalInput.operationId,
    operation,
    now: input.now,
    ...(input.approvalInput.auditRecord.noteId === undefined
      ? {}
      : { noteId: input.approvalInput.auditRecord.noteId }),
  });
  const memoryValidation = validateMemoryItem(memory);
  if (!memoryValidation.valid) {
    return {
      ok: false,
      errors: memoryValidation.errors.map((error) => `memory candidate: ${error}`),
    };
  }

  const writeIntent = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    sourceOperationId: input.approvalInput.operationId,
    memory,
  };
  const writeIntentErrors = validateMemoryCandidateWriteIntent(writeIntent);
  if (writeIntentErrors.length > 0) {
    return {
      ok: false,
      errors: writeIntentErrors.map((error) => `memory candidate: ${error}`),
    };
  }

  return { ok: true, writeIntent };
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

function validateBoundaryInput(input: unknown): string[] {
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

function validateMemoryCandidateApprovalInputScope(input: MemoryCandidateProposalBoundaryInput): string[] {
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

function mapCreateMemoryCandidateOperationToMemory(input: {
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

function mapFirstCompleteSourceSpan(
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

function isCreateMemoryCandidateOperation(
  operation: unknown,
): operation is CreateMemoryCandidateOperation {
  return isRecord(operation) && operation.type === 'create_memory_candidate';
}

function validateCreateMemoryCandidateOperation(operation: unknown): string[] {
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

function validateCreateMemoryCandidateSourceSpans(value: unknown, errors: string[]): void {
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

function memoryKey(workspaceId: string, userId: string, memoryId: string): string {
  return `${workspaceId}\u0000${userId}\u0000${memoryId}`;
}

function cloneWriteIntent(writeIntent: MemoryCandidateWriteIntent): MemoryCandidateWriteIntent {
  return {
    workspaceId: writeIntent.workspaceId,
    userId: writeIntent.userId,
    sourceOperationId: writeIntent.sourceOperationId,
    memory: cloneMemory(writeIntent.memory),
  };
}

function cloneMemory(memory: MemoryItemContract): MemoryItemContract {
  return {
    ...memory,
    ...(memory.sourceSpan === undefined ? {} : { sourceSpan: { ...memory.sourceSpan } }),
  };
}

function isStableRuntimeId(value: unknown): value is string {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPersistenceErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}
