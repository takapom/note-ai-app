// SQL adapter for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md
// Companion: docs/contracts/repository-topology.md, docs/contracts/cloudflare-agents-turso.md

import {
  hasForbiddenContextDumpField,
  relatedContextRetrievalOrder,
  type ContextAssemblyInput,
  type RelatedContextRetrievalReason,
  type TargetScopeKind,
} from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { userAuthoredBlockOrigin } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import type {
  ContextAssemblyRelatedContextRetrievalPort,
  ContextAssemblyRuntimeRequest,
} from './contextAssemblyRuntimeFlow.ts';

type RelatedContextInput = NonNullable<ContextAssemblyInput['relatedContext']>;
type RelatedSemanticUnitInput = NonNullable<RelatedContextInput['semanticUnits']>[number];
type RelatedNoteInput = NonNullable<RelatedContextInput['notes']>[number];
type SourceBlockExcerptInput = NonNullable<RelatedContextInput['sourceBlockExcerpts']>[number];

export interface ContextAssemblyRelatedContextSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ContextAssemblyRelatedContextSqlExecutor {
  query(statement: ContextAssemblyRelatedContextSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export class TursoContextAssemblyRelatedContextSqlAdapter
  implements ContextAssemblyRelatedContextRetrievalPort
{
  private readonly executor: ContextAssemblyRelatedContextSqlExecutor;

  constructor(input: { executor: ContextAssemblyRelatedContextSqlExecutor }) {
    this.executor = input.executor;
  }

  async loadRelatedContext(
    input: ContextAssemblyRuntimeRequest,
  ): Promise<ContextAssemblyInput['relatedContext']> {
    const requestResult = validateSupportedRelatedContextRequest(input);
    if (!requestResult.ok) {
      throw new Error(requestResult.errors.join('; '));
    }

    const semanticUnitRows = await this.executor.query(mapRelatedSemanticUnitsLookupToSql(input));
    const semanticUnitsResult = mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits(semanticUnitRows, input);
    if (!semanticUnitsResult.ok) {
      throw new Error(semanticUnitsResult.errors.join('; '));
    }

    const noteRows = await this.executor.query(mapRelatedNotesLookupToSql(input));
    const notesResult = mapRelatedNoteRowsToRelatedContextNotes(noteRows, input);
    if (!notesResult.ok) {
      throw new Error(notesResult.errors.join('; '));
    }

    const excerptRows = await this.executor.query(mapRelatedSourceBlockExcerptsLookupToSql(input));
    const excerptsResult = mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts(
      excerptRows,
      input,
    );
    if (!excerptsResult.ok) {
      throw new Error(excerptsResult.errors.join('; '));
    }

    return {
      semanticUnits: semanticUnitsResult.semanticUnits,
      notes: notesResult.notes,
      sourceBlockExcerpts: excerptsResult.sourceBlockExcerpts,
    };
  }
}

export function mapRelatedSemanticUnitsLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyRelatedContextSqlStatement {
  assertSupportedRelatedContextSqlRequest(input);

  const select = [
    'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.retrieval_reason, semantic_unit_related_candidates.relevance_score, semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, notes.workspace_id as related_workspace_id',
    'from semantic_unit_related_candidates',
    'inner join semantic_units on semantic_units.id = semantic_unit_related_candidates.related_semantic_unit_id',
    'inner join notes on notes.id = semantic_units.note_id',
  ];

  if (input.targetScope === 'section') {
    return {
      sql: [
        ...select,
        'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and semantic_unit_related_candidates.source_target_id = ? and notes.workspace_id = ? and not (semantic_units.note_id = ? and semantic_units.section_id = ?)',
        'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_units.id asc',
      ].join(' '),
      args: [input.workspaceId, input.noteId, 'section', input.targetId, input.workspaceId, input.noteId, input.targetId],
    };
  }

  return {
    sql: [
      ...select,
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and notes.workspace_id = ? and semantic_units.note_id <> ?',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_units.id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId, 'note', input.workspaceId, input.noteId],
  };
}

export function mapRelatedNotesLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyRelatedContextSqlStatement {
  assertSupportedRelatedContextSqlRequest(input);

  const select = [
    'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.semantic_unit_ids, semantic_unit_related_candidates.source_block_excerpt_ids, semantic_unit_related_candidates.retrieval_reason, semantic_unit_related_candidates.relevance_score, notes.id, notes.workspace_id as note_workspace_id, notes.title, notes.description_effective',
    'from semantic_unit_related_candidates',
    'inner join notes on notes.id = semantic_unit_related_candidates.related_note_id',
  ];

  if (input.targetScope === 'section') {
    return {
      sql: [
        ...select,
        'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and semantic_unit_related_candidates.source_target_id = ? and notes.workspace_id = ? and notes.id <> ?',
        'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, notes.id asc',
      ].join(' '),
      args: [input.workspaceId, input.noteId, 'section', input.targetId, input.workspaceId, input.noteId],
    };
  }

  return {
    sql: [
      ...select,
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and notes.workspace_id = ? and notes.id <> ?',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, notes.id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId, 'note', input.workspaceId, input.noteId],
  };
}

export function mapRelatedSourceBlockExcerptsLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyRelatedContextSqlStatement {
  assertSupportedRelatedContextSqlRequest(input);

  const select = [
    'select semantic_unit_related_candidates.workspace_id as candidate_workspace_id, semantic_unit_related_candidates.source_note_id, semantic_unit_related_candidates.source_scope, semantic_unit_related_candidates.source_target_id, semantic_unit_related_candidates.source_block_excerpt_id as id, blocks.note_id, blocks.id as block_id, blocks.section_id, blocks.plain_text, blocks.origin, semantic_unit_related_candidates.source_start_offset, semantic_unit_related_candidates.source_end_offset, notes.workspace_id as block_workspace_id',
    'from semantic_unit_related_candidates',
    'inner join blocks on blocks.id = semantic_unit_related_candidates.source_block_id',
    'inner join notes on notes.id = blocks.note_id',
  ];

  if (input.targetScope === 'section') {
    return {
      sql: [
        ...select,
        'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and semantic_unit_related_candidates.source_target_id = ? and notes.workspace_id = ? and semantic_unit_related_candidates.source_block_excerpt_id is not null and semantic_unit_related_candidates.source_block_id is not null and blocks.origin = ? and not (blocks.note_id = ? and blocks.section_id = ?)',
        'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_unit_related_candidates.source_block_excerpt_id asc',
      ].join(' '),
      args: [
        input.workspaceId,
        input.noteId,
        'section',
        input.targetId,
        input.workspaceId,
        userAuthoredBlockOrigin,
        input.noteId,
        input.targetId,
      ],
    };
  }

  return {
    sql: [
      ...select,
      'where semantic_unit_related_candidates.workspace_id = ? and semantic_unit_related_candidates.source_note_id = ? and semantic_unit_related_candidates.source_scope = ? and notes.workspace_id = ? and semantic_unit_related_candidates.source_block_excerpt_id is not null and semantic_unit_related_candidates.source_block_id is not null and blocks.origin = ? and blocks.note_id <> ?',
      'order by semantic_unit_related_candidates.retrieval_rank asc, semantic_unit_related_candidates.relevance_score desc, semantic_unit_related_candidates.source_block_excerpt_id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId, 'note', input.workspaceId, userAuthoredBlockOrigin, input.noteId],
  };
}

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

function mapRelatedNoteRow(
  row: Record<string, unknown>,
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; note: RelatedNoteInput } | { ok: false; errors: string[] } {
  const errors: string[] = validateCandidateScope(row, expected);
  if (hasForbiddenContextDumpField(row)) {
    errors.push('row must not include full workspace, full note, dump, all notes, or all memory fields');
  }

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

function validateCandidateScope(
  row: Record<string, unknown>,
  expected: { workspaceId: string; noteId: string; targetScope: TargetScopeKind; targetId?: string },
): string[] {
  const errors: string[] = [];
  const candidateWorkspaceId = readRequiredStringColumn(row, 'candidate_workspace_id', 'workspace_id');
  const sourceNoteId = readRequiredStringColumn(row, 'source_note_id', 'sourceNoteId');
  const sourceScope = readRequiredStringColumn(row, 'source_scope', 'sourceScope');
  const sourceTargetId = readOptionalStringColumn(row, 'source_target_id', 'sourceTargetId');

  if (candidateWorkspaceId === undefined) {
    errors.push('candidate_workspace_id must be a non-empty string');
  } else if (candidateWorkspaceId !== expected.workspaceId) {
    errors.push('candidate_workspace_id must match requested workspaceId');
  }
  if (sourceNoteId === undefined) {
    errors.push('source_note_id must be a non-empty string');
  } else if (sourceNoteId !== expected.noteId) {
    errors.push('source_note_id must match requested noteId');
  }
  if (sourceScope === undefined) {
    errors.push('source_scope must be section or note');
  } else if (sourceScope !== expected.targetScope) {
    errors.push('source_scope must match requested targetScope');
  }
  if (sourceTargetId === null) {
    errors.push('source_target_id must be a non-empty string when provided');
  } else if (expected.targetScope === 'section') {
    if (sourceTargetId === undefined) {
      errors.push('source_target_id must be provided for section target scope');
    } else if (sourceTargetId !== expected.targetId) {
      errors.push('source_target_id must match requested targetId');
    }
  } else if (sourceTargetId !== undefined) {
    errors.push('source_target_id must be absent for note target scope');
  }

  return errors;
}

function validateSupportedRelatedContextRequest(
  input: ContextAssemblyRuntimeRequest,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (input.targetScope === 'chunk') {
    errors.push('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  } else if (input.targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    errors.push('targetId must be provided for section target scope');
  } else if (input.targetScope !== 'section' && input.targetScope !== 'note') {
    errors.push('targetScope must be section or note');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

function assertSupportedRelatedContextSqlRequest(input: {
  targetScope: TargetScopeKind;
  targetId?: string;
}): void {
  if (input.targetScope === 'chunk') {
    throw new Error('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  }
  if (input.targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    throw new Error('targetId must be provided for section target scope');
  }
}

function readRequiredSourceBlockIds(
  row: Record<string, unknown>,
  sourceBlockId: string | undefined | null,
): string[] | undefined | null {
  const sourceBlockIds = readStringArrayColumn(row, 'source_block_ids', 'sourceBlockIds');
  if (sourceBlockIds !== undefined) {
    return sourceBlockIds;
  }

  return typeof sourceBlockId === 'string' ? [sourceBlockId] : undefined;
}

function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return isTrimmedNonEmptyString(value) ? value : undefined;
}

function readOptionalStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredStringColumn(row, primaryColumn, fallbackColumn) ?? null;
}

function readRequiredTextColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'string' ? value : undefined;
}

function readRequiredNonNegativeFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readOptionalNonNegativeFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredNonNegativeFiniteNumberColumn(row, primaryColumn, fallbackColumn) ?? null;
}

function readOptionalFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalConfidenceColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = readOptionalFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined || value === null) {
    return value;
  }

  return value >= 0 && value <= 1 ? value : null;
}

function readStringArrayColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string[] | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.every(isTrimmedNonEmptyString) ? [...value] : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isTrimmedNonEmptyString) ? [...parsed] : null;
  } catch {
    return null;
  }
}

function readOptionalRetrievalReasonColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): RelatedContextRetrievalReason | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' && (relatedContextRetrievalOrder as readonly string[]).includes(value)
    ? (value as RelatedContextRetrievalReason)
    : null;
}


function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}
