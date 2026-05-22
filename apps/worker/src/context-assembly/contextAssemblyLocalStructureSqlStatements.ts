// SQL statement mapping for context assembly local structure projections.
// Authority: docs/contracts/context-assembly.md

import type { TargetScopeKind } from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { ContextAssemblyLocalStructureSqlStatement } from './contextAssemblyLocalStructureSqlTypes.ts';

export function mapLocalSemanticUnitsLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyLocalStructureSqlStatement {
  assertSupportedLocalStructureSqlRequest(input);

  if (input.targetScope === 'section') {
    return {
      sql: [
        'select semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, semantic_units.relevance_score, semantic_units.updated_at, semantic_units.position',
        'from semantic_units',
        'inner join notes on notes.id = semantic_units.note_id',
        'where notes.workspace_id = ? and semantic_units.note_id = ? and semantic_units.section_id = ?',
        'order by semantic_units.position asc, semantic_units.updated_at desc, semantic_units.id asc',
      ].join(' '),
      args: [input.workspaceId, input.noteId, input.targetId],
    };
  }

  return {
    sql: [
      'select semantic_units.id, semantic_units.note_id, semantic_units.section_id, semantic_units.title, semantic_units.summary, semantic_units.source_block_ids, semantic_units.source_block_id, semantic_units.source_start_offset, semantic_units.source_end_offset, semantic_units.confidence, semantic_units.relevance_score, semantic_units.updated_at, semantic_units.position',
      'from semantic_units',
      'inner join notes on notes.id = semantic_units.note_id',
      'where notes.workspace_id = ? and semantic_units.note_id = ?',
      'order by semantic_units.position asc, semantic_units.updated_at desc, semantic_units.id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

export function mapLocalSectionSummariesLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyLocalStructureSqlStatement {
  assertSupportedLocalStructureSqlRequest(input);

  if (input.targetScope === 'section') {
    return {
      sql: [
        'select semantic_unit_section_summaries.note_id, semantic_unit_section_summaries.section_id, semantic_unit_section_summaries.title, semantic_unit_section_summaries.summary, semantic_unit_section_summaries.source_block_ids, semantic_unit_section_summaries.updated_at, semantic_unit_section_summaries.position',
        'from semantic_unit_section_summaries',
        'inner join notes on notes.id = semantic_unit_section_summaries.note_id',
        'where notes.workspace_id = ? and semantic_unit_section_summaries.note_id = ? and semantic_unit_section_summaries.section_id = ?',
        'order by semantic_unit_section_summaries.position asc, semantic_unit_section_summaries.updated_at desc, semantic_unit_section_summaries.section_id asc',
      ].join(' '),
      args: [input.workspaceId, input.noteId, input.targetId],
    };
  }

  return {
    sql: [
      'select semantic_unit_section_summaries.note_id, semantic_unit_section_summaries.section_id, semantic_unit_section_summaries.title, semantic_unit_section_summaries.summary, semantic_unit_section_summaries.source_block_ids, semantic_unit_section_summaries.updated_at, semantic_unit_section_summaries.position',
      'from semantic_unit_section_summaries',
      'inner join notes on notes.id = semantic_unit_section_summaries.note_id',
      'where notes.workspace_id = ? and semantic_unit_section_summaries.note_id = ?',
      'order by semantic_unit_section_summaries.position asc, semantic_unit_section_summaries.updated_at desc, semantic_unit_section_summaries.section_id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

export function mapLocalPreviousStructureSnapshotLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyLocalStructureSqlStatement {
  assertSupportedLocalStructureSqlRequest(input);

  if (input.targetScope === 'section') {
    return {
      sql: [
        'select semantic_unit_structure_snapshots.snapshot_id, semantic_unit_structure_snapshots.note_id, semantic_unit_structure_snapshots.section_id, semantic_unit_structure_snapshots.semantic_unit_ids, semantic_unit_structure_snapshots.summary, semantic_unit_structure_snapshots.generated_at',
        'from semantic_unit_structure_snapshots',
        'inner join notes on notes.id = semantic_unit_structure_snapshots.note_id',
        'where notes.workspace_id = ? and semantic_unit_structure_snapshots.note_id = ? and semantic_unit_structure_snapshots.section_id = ?',
        'order by semantic_unit_structure_snapshots.generated_at desc, semantic_unit_structure_snapshots.snapshot_id desc',
        'limit 1',
      ].join(' '),
      args: [input.workspaceId, input.noteId, input.targetId],
    };
  }

  return {
    sql: [
      'select semantic_unit_structure_snapshots.snapshot_id, semantic_unit_structure_snapshots.note_id, semantic_unit_structure_snapshots.section_id, semantic_unit_structure_snapshots.semantic_unit_ids, semantic_unit_structure_snapshots.summary, semantic_unit_structure_snapshots.generated_at',
      'from semantic_unit_structure_snapshots',
      'inner join notes on notes.id = semantic_unit_structure_snapshots.note_id',
      'where notes.workspace_id = ? and semantic_unit_structure_snapshots.note_id = ? and semantic_unit_structure_snapshots.section_id is null',
      'order by semantic_unit_structure_snapshots.generated_at desc, semantic_unit_structure_snapshots.snapshot_id desc',
      'limit 1',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

function assertSupportedLocalStructureSqlRequest(input: {
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

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}
