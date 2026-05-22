// SQL row mapping for source-backed memory candidate review.
// Authority: docs/contracts/memory.md

import { validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import {
  readOptionalNonNegativeNumber,
  readOptionalString,
  readRequiredBoolean,
  readRequiredConfidence,
  readRequiredFiniteNumber,
  readRequiredNonEmptyString,
  readRequiredString,
  validateMemoryReviewInput,
} from './memoryReviewHelpers.ts';
import type { MemoryReviewInput, MemoryReviewRecord } from './memoryReviewTypes.ts';

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
