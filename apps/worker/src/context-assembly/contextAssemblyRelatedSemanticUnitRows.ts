// Related semantic unit row mapping for context assembly.
// Authority: docs/contracts/context-assembly.md

import { hasForbiddenContextDumpField, type ContextAssemblyInput, type TargetScopeKind } from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import {
  readOptionalConfidenceColumn,
  readOptionalFiniteNumberColumn,
  readOptionalNonNegativeFiniteNumberColumn,
  readOptionalRetrievalReasonColumn,
  readOptionalStringColumn,
  readRequiredSourceBlockIds,
  readRequiredStringColumn,
  validateCandidateScope,
} from './contextAssemblyRelatedContextRowReaders.ts';

type RelatedContextInput = NonNullable<ContextAssemblyInput['relatedContext']>;
type RelatedSemanticUnitInput = NonNullable<RelatedContextInput['semanticUnits']>[number];

export function mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits(
  rows: readonly Record<string, unknown>[],
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; semanticUnits: RelatedSemanticUnitInput[] } | { ok: false; errors: string[] } {
  const semanticUnits: RelatedSemanticUnitInput[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const unit = mapRelatedSemanticUnitRow(row, expected);
    if (!unit.ok) {
      errors.push(...unit.errors.map((error) => `related semantic unit rows[${index}].${error}`));
      continue;
    }

    semanticUnits.push(unit.semanticUnit);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, semanticUnits };
}

function mapRelatedSemanticUnitRow(
  row: Record<string, unknown>,
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; semanticUnit: RelatedSemanticUnitInput } | { ok: false; errors: string[] } {
  const errors: string[] = validateCandidateScope(row, expected);
  if (hasForbiddenContextDumpField(row)) {
    errors.push('row must not include full workspace, full note, dump, all notes, or all memory fields');
  }

  const relatedWorkspaceId = readRequiredStringColumn(row, 'related_workspace_id');
  const id = readRequiredStringColumn(row, 'id');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const title = readOptionalStringColumn(row, 'title');
  const summary = readRequiredStringColumn(row, 'summary');
  const sourceBlockId = readOptionalStringColumn(row, 'source_block_id', 'sourceBlockId');
  const sourceBlockIds = readRequiredSourceBlockIds(row, sourceBlockId);
  const sourceStartOffset = readOptionalNonNegativeFiniteNumberColumn(row, 'source_start_offset', 'sourceStartOffset');
  const sourceEndOffset = readOptionalNonNegativeFiniteNumberColumn(row, 'source_end_offset', 'sourceEndOffset');
  const confidence = readOptionalConfidenceColumn(row, 'confidence');
  const relevanceScore = readOptionalFiniteNumberColumn(row, 'relevance_score', 'relevanceScore');
  const retrievalReason = readOptionalRetrievalReasonColumn(row, 'retrieval_reason', 'retrievalReason');

  if (relatedWorkspaceId === undefined) {
    errors.push('related_workspace_id must be a non-empty string');
  } else if (relatedWorkspaceId !== expected.workspaceId) {
    errors.push('related_workspace_id must match requested workspaceId');
  }
  if (id === undefined) errors.push('id must be a non-empty string');
  if (noteId === undefined) {
    errors.push('note_id must be a non-empty string');
  } else if (expected.targetScope === 'note' && noteId === expected.noteId) {
    errors.push('note_id must not match requested noteId for note target scope');
  } else if (expected.targetScope === 'section' && noteId === expected.noteId && sectionId === expected.targetId) {
    errors.push('section_id must not match requested targetId for same-note related units');
  }
  if (sectionId === null) errors.push('section_id must be a non-empty string when provided');
  if (title === null) errors.push('title must be a non-empty string when provided');
  if (summary === undefined) errors.push('summary must be a non-empty string');
  if (sourceBlockId === null) errors.push('source_block_id must be a non-empty string when provided');
  if (sourceBlockIds === undefined) errors.push('source_block_ids must contain at least one source block id');
  if (sourceBlockIds === null) errors.push('source_block_ids must be a JSON array or string array of non-empty strings');
  if (sourceStartOffset === null) errors.push('source_start_offset must be a non-negative finite number when provided');
  if (sourceEndOffset === null) errors.push('source_end_offset must be a non-negative finite number when provided');
  if (sourceStartOffset !== undefined && sourceEndOffset === undefined) {
    errors.push('source_end_offset must be provided when source_start_offset is provided');
  }
  if (sourceEndOffset !== undefined && sourceStartOffset === undefined) {
    errors.push('source_start_offset must be provided when source_end_offset is provided');
  }
  if ((sourceStartOffset !== undefined || sourceEndOffset !== undefined) && sourceBlockId === undefined) {
    errors.push('source_block_id must be provided when source offsets are provided');
  }
  if (
    typeof sourceStartOffset === 'number' &&
    typeof sourceEndOffset === 'number' &&
    sourceEndOffset < sourceStartOffset
  ) {
    errors.push('source_end_offset must be greater than or equal to source_start_offset');
  }
  if (
    typeof sourceBlockId === 'string' &&
    Array.isArray(sourceBlockIds) &&
    !sourceBlockIds.includes(sourceBlockId)
  ) {
    errors.push('source_block_id must be included in source_block_ids');
  }
  if (confidence === null) errors.push('confidence must be a finite number between 0 and 1 when provided');
  if (relevanceScore === null) errors.push('relevance_score must be a finite number when provided');
  if (retrievalReason === null) errors.push('retrieval_reason must be a context assembly related retrieval reason when provided');

  if (
    errors.length > 0 ||
    id === undefined ||
    noteId === undefined ||
    summary === undefined ||
    sourceBlockIds === undefined ||
    sourceBlockIds === null ||
    sectionId === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    semanticUnit: {
      id,
      noteId,
      ...(typeof sectionId === 'string' ? { sectionId } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      summary,
      sourceBlockIds,
      ...(typeof sourceBlockId === 'string' &&
      typeof sourceStartOffset === 'number' &&
      typeof sourceEndOffset === 'number'
        ? {
            sourceSpan: {
              sourceBlockId,
              startOffset: sourceStartOffset,
              endOffset: sourceEndOffset,
            },
          }
        : {}),
      ...(typeof confidence === 'number' ? { confidence } : {}),
      ...(typeof relevanceScore === 'number' ? { relevanceScore } : {}),
      ...(retrievalReason !== undefined && retrievalReason !== null ? { retrievalReason } : {}),
    },
  };
}
