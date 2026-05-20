// Runtime port for source-backed memory candidate review.
// Authority: docs/contracts/memory.md
// Companion: docs/contracts/api-events.md, docs/contracts/backend-runtime.md

import type {
  MemoryItemContract,
  MemoryUserAction,
} from '../../../../contexts/memory/src/contract/memoryContract.ts';
import {
  transitionMemoryStatus,
  validateMemoryItem,
} from '../../../../contexts/memory/src/contract/memoryContract.ts';

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

export class InMemoryMemoryReviewPort implements MemoryReviewPort {
  private readonly memories = new Map<string, MemoryReviewRecord>();

  constructor(initialMemories: readonly MemoryItemContract[] = []) {
    for (const memory of initialMemories) {
      const errors = validateMemoryItem(memory);
      if (!errors.valid) {
        throw new Error(errors.errors.join('; '));
      }
      this.memories.set(memoryKey(memory.workspaceId, memory.userId, memory.id), cloneMemory(memory));
    }
  }

  async acceptMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'remember', 'accepted');
  }

  async rejectMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'different', 'rejected');
  }

  async editMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'edit', 'edited');
  }

  async deleteMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'delete', 'archived');
  }

  async holdMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'hold', 'held');
  }

  listMemories(): MemoryReviewRecord[] {
    return Array.from(this.memories.values(), cloneMemory);
  }

  private reviewMemory(
    input: MemoryReviewInput,
    action: MemoryUserAction,
    decision: MemoryReviewDecision,
  ): MemoryReviewResult {
    const inputErrors = validateMemoryReviewInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const workspaceId = input.workspaceId;
    const userId = input.userId as string;
    const memoryId = input.memoryId as string;
    const current = this.memories.get(memoryKey(workspaceId, userId, memoryId));
    if (current === undefined) {
      return {
        ok: false,
        errors: [`memory ${memoryId} was not found in workspace ${workspaceId} for user ${userId}`],
      };
    }
    if (current.workspaceId !== workspaceId || current.userId !== userId) {
      return {
        ok: false,
        errors: [`memory ${memoryId} does not belong to workspace ${workspaceId} and user ${userId}`],
      };
    }

    const reviewErrors = validateReviewableMemory(current);
    if (reviewErrors.length > 0) {
      return { ok: false, errors: reviewErrors };
    }

    let editedContent: string | undefined;
    if (action === 'edit') {
      const contentUpdate = readMemoryEditContent(input.body);
      if (!contentUpdate.ok) {
        return { ok: false, errors: contentUpdate.errors };
      }
      editedContent = contentUpdate.content;
    }

    const candidate = editedContent === undefined
      ? current
      : { ...current, content: editedContent };
    const transitioned = transitionMemoryStatus(candidate, action, input.now);
    const reviewed: MemoryReviewRecord = {
      ...transitioned,
      reviewedAt: input.now,
      reviewedByUserId: userId,
      reviewDecision: decision,
    };
    this.memories.set(memoryKey(workspaceId, userId, memoryId), cloneMemory(reviewed));

    return {
      ok: true,
      errors: [],
      body: {
        memory: cloneMemory(reviewed),
      },
    };
  }
}

export class TursoMemoryReviewSqlAdapter implements MemoryReviewPort {
  private readonly executor: MemoryReviewSqlExecutor;

  constructor(input: { executor: MemoryReviewSqlExecutor }) {
    this.executor = input.executor;
  }

  async acceptMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'remember', 'accepted');
  }

  async rejectMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'different', 'rejected');
  }

  async editMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'edit', 'edited');
  }

  async deleteMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'delete', 'archived');
  }

  async holdMemory(input: MemoryReviewInput): Promise<MemoryReviewResult> {
    return this.reviewMemory(input, 'hold', 'held');
  }

  private async reviewMemory(
    input: MemoryReviewInput,
    action: MemoryUserAction,
    decision: MemoryReviewDecision,
  ): Promise<MemoryReviewResult> {
    const inputErrors = validateMemoryReviewInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }
    let editedContent: string | undefined;
    if (action === 'edit') {
      const contentUpdate = readMemoryEditContent(input.body);
      if (!contentUpdate.ok) {
        return { ok: false, errors: contentUpdate.errors };
      }
      editedContent = contentUpdate.content;
    }

    try {
      const rows = await this.executor.query(mapMemoryReviewLookupToSql(input));
      const loaded = mapMemoryReviewRows(rows, input);
      if (!loaded.ok) {
        return loaded;
      }

      const reviewErrors = validateReviewableMemory(loaded.memory);
      if (reviewErrors.length > 0) {
        return { ok: false, errors: reviewErrors };
      }

      const candidate = editedContent === undefined
        ? loaded.memory
        : { ...loaded.memory, content: editedContent };
      const transitioned = transitionMemoryStatus(candidate, action, input.now);
      const reviewed: MemoryReviewRecord = {
        ...transitioned,
        reviewedAt: input.now,
        reviewedByUserId: input.userId as string,
        reviewDecision: decision,
      };
      const statement = action === 'edit'
        ? mapMemoryReviewContentUpdateToSql(reviewed)
        : mapMemoryReviewStatusUpdateToSql(reviewed);
      const writeResult = await this.executor.write(statement);
      if (readRowsAffected(writeResult) === 0) {
        return {
          ok: false,
          errors: [`memory ${input.memoryId} was not updated as a reviewable candidate`],
        };
      }

      return {
        ok: true,
        errors: [],
        body: {
          memory: cloneMemory(reviewed),
        },
      };
    } catch (error) {
      return {
        ok: false,
        errors: [toPersistenceErrorMessage('memory review persistence failed', error)],
      };
    }
  }
}

export function validateMemoryReviewInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['memory review input must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.userId)) {
    errors.push('userId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.memoryId)) {
    errors.push('memoryId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

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

export function mapMemoryReviewRows(
  rows: readonly Record<string, unknown>[],
  input: MemoryReviewInput,
): { ok: true; memory: MemoryReviewRecord } | { ok: false; errors: string[] } {
  const inputErrors = validateMemoryReviewInput(input);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }
  if (rows.length === 0) {
    return {
      ok: false,
      errors: [`memory ${input.memoryId} was not found in workspace ${input.workspaceId} for user ${input.userId}`],
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      errors: [`memory ${input.memoryId} matched multiple rows`],
    };
  }

  const row = rows[0];
  const memory = mapMemoryReviewRow(row);
  if (!memory.ok) {
    return memory;
  }

  const errors: string[] = [];
  if (memory.memory.workspaceId !== input.workspaceId) {
    errors.push('memory row workspaceId must match requested workspaceId');
  }
  if (memory.memory.userId !== input.userId) {
    errors.push('memory row userId must match requested userId');
  }
  if (memory.memory.id !== input.memoryId) {
    errors.push('memory row id must match requested memoryId');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return memory;
}

function mapMemoryReviewRow(
  row: Record<string, unknown>,
): { ok: true; memory: MemoryReviewRecord } | { ok: false; errors: string[] } {
  const id = readRequiredString(row.id);
  const workspaceId = readRequiredString(row.workspace_id ?? row.workspaceId);
  const userId = readRequiredString(row.user_id ?? row.userId);
  const type = readRequiredNonEmptyString(row.type);
  const content = readRequiredNonEmptyString(row.content);
  const status = readRequiredNonEmptyString(row.status);
  const pinned = readRequiredBoolean(row.pinned);
  const sourceUnitId = readOptionalString(row.source_unit_id ?? row.sourceUnitId);
  const sourceNoteId = readOptionalString(row.source_note_id ?? row.sourceNoteId);
  const sourceBlockId = readOptionalString(row.source_block_id ?? row.sourceBlockId);
  const sourceStartOffset = readOptionalNonNegativeNumber(row.source_start_offset ?? row.sourceStartOffset);
  const sourceEndOffset = readOptionalNonNegativeNumber(row.source_end_offset ?? row.sourceEndOffset);
  const confidence = readRequiredConfidence(row.confidence);
  const createdAt = readRequiredFiniteNumber(row.created_at ?? row.createdAt);
  const updatedAt = readRequiredFiniteNumber(row.updated_at ?? row.updatedAt);

  const errors: string[] = [];
  if (id === undefined) errors.push('id must be a non-empty string');
  if (workspaceId === undefined) errors.push('workspace_id must be a non-empty string');
  if (userId === undefined) errors.push('user_id must be a non-empty string');
  if (type === undefined) errors.push('type must be a memory type');
  if (content === undefined) errors.push('content must be a non-empty string');
  if (status === undefined) errors.push('status must be a memory status');
  if (pinned === undefined) errors.push('pinned must be a boolean');
  if (sourceUnitId === null) errors.push('source_unit_id must be a non-empty string when provided');
  if (sourceNoteId === null) errors.push('source_note_id must be a non-empty string when provided');
  if (sourceBlockId === null) errors.push('source_block_id must be a non-empty string when provided');
  if (sourceStartOffset === null) errors.push('source_start_offset must be a non-negative finite number when provided');
  if (sourceEndOffset === null) errors.push('source_end_offset must be a non-negative finite number when provided');
  if (confidence === undefined) errors.push('confidence must be a number between 0 and 1');
  if (createdAt === undefined) errors.push('created_at must be a finite timestamp');
  if (updatedAt === undefined) errors.push('updated_at must be a finite timestamp');

  const spanTouched =
    sourceBlockId !== undefined || sourceStartOffset !== undefined || sourceEndOffset !== undefined;
  if (spanTouched) {
    if (sourceBlockId === undefined) errors.push('source_block_id must be provided when source offsets are provided');
    if (sourceStartOffset === undefined) errors.push('source_start_offset must be provided when source_block_id or source_end_offset is provided');
    if (sourceEndOffset === undefined) errors.push('source_end_offset must be provided when source_block_id or source_start_offset is provided');
  }
  if (
    typeof sourceStartOffset === 'number' &&
    typeof sourceEndOffset === 'number' &&
    sourceEndOffset < sourceStartOffset
  ) {
    errors.push('source_end_offset must be greater than or equal to source_start_offset');
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    workspaceId === undefined ||
    userId === undefined ||
    type === undefined ||
    content === undefined ||
    status === undefined ||
    pinned === undefined ||
    confidence === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    sourceUnitId === null ||
    sourceNoteId === null ||
    sourceBlockId === null ||
    sourceStartOffset === null ||
    sourceEndOffset === null
  ) {
    return { ok: false, errors };
  }

  const sourceSpan =
    sourceBlockId === undefined && sourceStartOffset === undefined && sourceEndOffset === undefined
      ? undefined
      : {
        sourceBlockId: sourceBlockId as string,
        startOffset: sourceStartOffset as number,
        endOffset: sourceEndOffset as number,
      };

  const memory = {
    id,
    workspaceId,
    userId,
    type,
    content,
    ...(sourceUnitId === undefined ? {} : { sourceUnitId }),
    ...(sourceNoteId === undefined ? {} : { sourceNoteId }),
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
    confidence,
    status,
    pinned,
    createdAt,
    updatedAt,
  } as MemoryReviewRecord;
  const validation = validateMemoryItem(memory);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true, memory };
}

function validateReviewableMemory(memory: MemoryItemContract): string[] {
  const validation = validateMemoryItem(memory);
  if (!validation.valid) {
    return validation.errors;
  }
  if (memory.status !== 'candidate' && memory.status !== 'pending') {
    return [`memory ${memory.id} must be candidate or pending for review`];
  }
  return [];
}

function readMemoryEditContent(
  body: unknown,
): { ok: true; content: string } | { ok: false; errors: string[] } {
  if (!isRecord(body)) {
    return { ok: false, errors: ['body.content must be a non-empty string'] };
  }
  if (!isNonEmptyString(body.content)) {
    return { ok: false, errors: ['body.content must be a non-empty string'] };
  }
  if (body.content !== body.content.trim()) {
    return { ok: false, errors: ['body.content must not include leading or trailing whitespace'] };
  }
  return { ok: true, content: body.content };
}

function isStatusOnlyMemoryReviewDecision(
  value: unknown,
): value is Exclude<MemoryReviewDecision, 'edited'> {
  return value === 'accepted' ||
    value === 'rejected' ||
    value === 'archived' ||
    value === 'held';
}

function memoryKey(workspaceId: string, userId: string, memoryId: string): string {
  return `${workspaceId}\u0000${userId}\u0000${memoryId}`;
}

function cloneMemory<T extends MemoryReviewRecord | MemoryItemContract>(memory: T): T {
  return {
    ...memory,
    ...(memory.sourceSpan === undefined ? {} : { sourceSpan: { ...memory.sourceSpan } }),
  };
}

function readRowsAffected(result: MemoryReviewSqlWriteResult | void): number | undefined {
  if (result === undefined) {
    return undefined;
  }
  if (typeof result.rowsAffected === 'number') {
    return result.rowsAffected;
  }
  if (typeof result.changes === 'number') {
    return result.changes;
  }
  return undefined;
}

function readRequiredString(value: unknown): string | undefined {
  return isStableRuntimeId(value) ? value : undefined;
}

function readRequiredNonEmptyString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  return isNonEmptyString(value) ? value : null;
}

function readRequiredBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  return undefined;
}

function readRequiredConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

function readRequiredFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalNonNegativeNumber(value: unknown): number | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPersistenceErrorMessage(prefix: string, error: unknown): string {
  return error instanceof Error ? `${prefix}: ${error.message}` : prefix;
}
