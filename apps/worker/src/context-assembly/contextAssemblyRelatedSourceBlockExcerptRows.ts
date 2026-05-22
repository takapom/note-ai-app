// Related source block excerpt row mapping for context assembly.
// Authority: docs/contracts/context-assembly.md

import { hasForbiddenContextDumpField, type ContextAssemblyInput, type TargetScopeKind } from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { userAuthoredBlockOrigin } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import {
  readOptionalStringColumn,
  readRequiredNonNegativeFiniteNumberColumn,
  readRequiredStringColumn,
  readRequiredTextColumn,
  validateCandidateScope,
} from './contextAssemblyRelatedContextRowReaders.ts';

type RelatedContextInput = NonNullable<ContextAssemblyInput['relatedContext']>;
type SourceBlockExcerptInput = NonNullable<RelatedContextInput['sourceBlockExcerpts']>[number];

export function mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts(
  rows: readonly Record<string, unknown>[],
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; sourceBlockExcerpts: SourceBlockExcerptInput[] } | { ok: false; errors: string[] } {
  const sourceBlockExcerpts: SourceBlockExcerptInput[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const excerpt = mapRelatedSourceBlockExcerptRow(row, expected);
    if (!excerpt.ok) {
      errors.push(...excerpt.errors.map((error) => `related source block excerpt rows[${index}].${error}`));
      continue;
    }

    sourceBlockExcerpts.push(excerpt.sourceBlockExcerpt);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, sourceBlockExcerpts };
}

function mapRelatedSourceBlockExcerptRow(
  row: Record<string, unknown>,
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; sourceBlockExcerpt: SourceBlockExcerptInput } | { ok: false; errors: string[] } {
  const errors: string[] = validateCandidateScope(row, expected);
  if (hasForbiddenContextDumpField(row)) {
    errors.push('row must not include full workspace, full note, dump, all notes, or all memory fields');
  }

  const blockWorkspaceId = readRequiredStringColumn(row, 'block_workspace_id', 'workspace_id');
  const id = readRequiredStringColumn(row, 'id');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const blockId = readRequiredStringColumn(row, 'block_id', 'blockId');
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const plainText = readRequiredTextColumn(row, 'plain_text', 'plainText');
  const origin = readRequiredStringColumn(row, 'origin');
  const sourceStartOffset = readRequiredNonNegativeFiniteNumberColumn(row, 'source_start_offset', 'sourceStartOffset');
  const sourceEndOffset = readRequiredNonNegativeFiniteNumberColumn(row, 'source_end_offset', 'sourceEndOffset');

  if (blockWorkspaceId === undefined) {
    errors.push('block_workspace_id must be a non-empty string');
  } else if (blockWorkspaceId !== expected.workspaceId) {
    errors.push('block_workspace_id must match requested workspaceId');
  }
  if (id === undefined) errors.push('id must be a non-empty string');
  if (noteId === undefined) {
    errors.push('note_id must be a non-empty string');
  } else if (expected.targetScope === 'note' && noteId === expected.noteId) {
    errors.push('note_id must not match requested noteId for note target scope');
  } else if (expected.targetScope === 'section' && noteId === expected.noteId && sectionId === expected.targetId) {
    errors.push('section_id must not match requested targetId for same-note excerpts');
  }
  if (blockId === undefined) errors.push('block_id must be a non-empty string');
  if (sectionId === null) errors.push('section_id must be a non-empty string when provided');
  if (plainText === undefined) errors.push('plain_text must be a string');
  if (origin === undefined) {
    errors.push('origin must be user');
  } else if (origin !== userAuthoredBlockOrigin) {
    errors.push('origin must be user');
  }
  if (sourceStartOffset === undefined) errors.push('source_start_offset must be a non-negative finite number');
  if (sourceEndOffset === undefined) errors.push('source_end_offset must be a non-negative finite number');
  if (
    typeof sourceStartOffset === 'number' &&
    typeof sourceEndOffset === 'number' &&
    sourceEndOffset < sourceStartOffset
  ) {
    errors.push('source_end_offset must be greater than or equal to source_start_offset');
  }
  if (
    typeof plainText === 'string' &&
    typeof sourceEndOffset === 'number' &&
    sourceEndOffset > plainText.length
  ) {
    errors.push('source_end_offset must not exceed plain_text length');
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    noteId === undefined ||
    blockId === undefined ||
    plainText === undefined ||
    sourceStartOffset === undefined ||
    sourceEndOffset === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    sourceBlockExcerpt: {
      id,
      noteId,
      blockId,
      text: plainText.slice(sourceStartOffset, sourceEndOffset),
      sourceSpan: {
        sourceBlockId: blockId,
        startOffset: sourceStartOffset,
        endOffset: sourceEndOffset,
      },
    },
  };
}
