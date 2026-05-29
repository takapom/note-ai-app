// Related note row mapping for context assembly.
// Authority: docs/contracts/context-assembly.md

import { type ContextAssemblyInput, type TargetScopeKind } from '../../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import {
  readOptionalFiniteNumberColumn,
  readOptionalRetrievalReasonColumn,
  readRequiredStringColumn,
  readStringArrayColumn,
  validateNoForbiddenContextDumpFields,
  validateRelatedContextCandidateScope,
} from '../sql/contextAssemblySqlRowReaders.ts';

type RelatedContextInput = NonNullable<ContextAssemblyInput['relatedContext']>;
type RelatedNoteInput = NonNullable<RelatedContextInput['notes']>[number];

export function mapRelatedNoteRowsToRelatedContextNotes(
  rows: readonly Record<string, unknown>[],
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; notes: RelatedNoteInput[] } | { ok: false; errors: string[] } {
  const notes: RelatedNoteInput[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const note = mapRelatedNoteRow(row, expected);
    if (!note.ok) {
      errors.push(...note.errors.map((error) => `related note rows[${index}].${error}`));
      continue;
    }

    notes.push(note.note);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, notes };
}

function mapRelatedNoteRow(
  row: Record<string, unknown>,
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; note: RelatedNoteInput } | { ok: false; errors: string[] } {
  const errors: string[] = [
    ...validateRelatedContextCandidateScope(row, expected),
    ...validateNoForbiddenContextDumpFields(row),
  ];

  const id = readRequiredStringColumn(row, 'id');
  const noteWorkspaceId = readRequiredStringColumn(row, 'note_workspace_id', 'workspace_id');
  const title = readRequiredStringColumn(row, 'title');
  const descriptionEffective = readRequiredStringColumn(row, 'description_effective', 'descriptionEffective');
  const semanticUnitIds = readStringArrayColumn(row, 'semantic_unit_ids', 'semanticUnitIds');
  const sourceBlockExcerptIds = readStringArrayColumn(row, 'source_block_excerpt_ids', 'sourceBlockExcerptIds');
  const relevanceScore = readOptionalFiniteNumberColumn(row, 'relevance_score', 'relevanceScore');
  const retrievalReason = readOptionalRetrievalReasonColumn(row, 'retrieval_reason', 'retrievalReason');

  if (id === undefined) {
    errors.push('id must be a non-empty string');
  } else if (id === expected.noteId) {
    errors.push('id must not match requested noteId');
  }
  if (noteWorkspaceId === undefined) {
    errors.push('note_workspace_id must be a non-empty string');
  } else if (noteWorkspaceId !== expected.workspaceId) {
    errors.push('note_workspace_id must match requested workspaceId');
  }
  if (title === undefined) errors.push('title must be a non-empty string');
  if (descriptionEffective === undefined) errors.push('description_effective must be a non-empty string');
  if (semanticUnitIds === undefined || (semanticUnitIds !== null && semanticUnitIds.length === 0)) {
    errors.push('semantic_unit_ids must contain at least one semantic unit id');
  }
  if (semanticUnitIds === null) {
    errors.push('semantic_unit_ids must be a JSON array or string array of non-empty strings');
  }
  if (sourceBlockExcerptIds === undefined || (sourceBlockExcerptIds !== null && sourceBlockExcerptIds.length === 0)) {
    errors.push('source_block_excerpt_ids must contain at least one source block excerpt id');
  }
  if (sourceBlockExcerptIds === null) {
    errors.push('source_block_excerpt_ids must be a JSON array or string array of non-empty strings');
  }
  if (relevanceScore === null) errors.push('relevance_score must be a finite number when provided');
  if (retrievalReason === null) errors.push('retrieval_reason must be a context assembly related retrieval reason when provided');

  if (
    errors.length > 0 ||
    id === undefined ||
    title === undefined ||
    descriptionEffective === undefined ||
    semanticUnitIds === undefined ||
    semanticUnitIds === null ||
    semanticUnitIds.length === 0 ||
    sourceBlockExcerptIds === undefined ||
    sourceBlockExcerptIds === null ||
    sourceBlockExcerptIds.length === 0
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    note: {
      id,
      title,
      descriptionEffective,
      semanticUnitIds,
      sourceBlockExcerptIds,
      ...(typeof relevanceScore === 'number' ? { relevanceScore } : {}),
      ...(retrievalReason !== undefined && retrievalReason !== null ? { retrievalReason } : {}),
    },
  };
}
