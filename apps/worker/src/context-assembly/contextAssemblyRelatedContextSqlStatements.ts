// SQL statement mapping for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md

import type { TargetScopeKind } from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { userAuthoredBlockOrigin } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import { assertSupportedRelatedContextSqlRequest } from './contextAssemblyRelatedContextRowReaders.ts';
import type { ContextAssemblyRelatedContextSqlStatement } from './contextAssemblyRelatedContextSqlTypes.ts';

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
