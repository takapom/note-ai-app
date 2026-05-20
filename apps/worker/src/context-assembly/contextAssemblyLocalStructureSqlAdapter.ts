// SQL adapter for context assembly local structure projections.
// Authority: docs/contracts/context-assembly.md
// Companion: docs/contracts/repository-topology.md, docs/contracts/cloudflare-agents-turso.md

import type {
  ContextAssemblyInput,
  TargetScopeKind,
} from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type {
  ContextAssemblyLocalStructurePort,
  ContextAssemblyRuntimeRequest,
} from './contextAssemblyRuntimeFlow.ts';

type ContextAssemblyLocalStructureInput = NonNullable<ContextAssemblyInput['localStructure']>;
type SemanticUnitContextInput = NonNullable<ContextAssemblyLocalStructureInput['existingSemanticUnits']>[number];
type SectionSummaryContextInput = NonNullable<ContextAssemblyLocalStructureInput['sectionSummaries']>[number];
type PreviousStructureSnapshotContextInput = NonNullable<ContextAssemblyLocalStructureInput['previousStructureSnapshot']>;

export interface ContextAssemblyLocalStructureSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ContextAssemblyLocalStructureSqlExecutor {
  query(statement: ContextAssemblyLocalStructureSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export class TursoContextAssemblyLocalStructureSqlAdapter implements ContextAssemblyLocalStructurePort {
  private readonly executor: ContextAssemblyLocalStructureSqlExecutor;

  constructor(input: { executor: ContextAssemblyLocalStructureSqlExecutor }) {
    this.executor = input.executor;
  }

  async loadLocalStructure(
    input: ContextAssemblyRuntimeRequest,
  ): Promise<ContextAssemblyInput['localStructure']> {
    const requestResult = validateSupportedLocalStructureRequest(input);
    if (!requestResult.ok) {
      throw new Error(requestResult.errors.join('; '));
    }

    const semanticUnitRows = await this.executor.query(mapLocalSemanticUnitsLookupToSql(input));
    const semanticUnitsResult = mapSemanticUnitRowsToLocalStructureSemanticUnits(semanticUnitRows, input);
    if (!semanticUnitsResult.ok) {
      throw new Error(semanticUnitsResult.errors.join('; '));
    }

    const sectionSummaryRows = await this.executor.query(mapLocalSectionSummariesLookupToSql(input));
    const sectionSummariesResult = mapSectionSummaryRowsToLocalStructureSectionSummaries(sectionSummaryRows, input);
    if (!sectionSummariesResult.ok) {
      throw new Error(sectionSummariesResult.errors.join('; '));
    }

    const snapshotRows = await this.executor.query(mapLocalPreviousStructureSnapshotLookupToSql(input));
    const snapshotResult = mapPreviousStructureSnapshotRowsToLocalStructureSnapshot(snapshotRows, input);
    if (!snapshotResult.ok) {
      throw new Error(snapshotResult.errors.join('; '));
    }

    return {
      existingSemanticUnits: semanticUnitsResult.existingSemanticUnits,
      sectionSummaries: sectionSummariesResult.sectionSummaries,
      ...(snapshotResult.snapshot === undefined ? {} : { previousStructureSnapshot: snapshotResult.snapshot }),
    };
  }
}

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

export function mapSemanticUnitRowsToLocalStructureSemanticUnits(
  rows: readonly Record<string, unknown>[],
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; existingSemanticUnits: SemanticUnitContextInput[] } | { ok: false; errors: string[] } {
  const existingSemanticUnits: SemanticUnitContextInput[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const unit = mapSemanticUnitRow(row, expected);
    if (!unit.ok) {
      errors.push(...unit.errors.map((error) => `semantic unit rows[${index}].${error}`));
      continue;
    }

    existingSemanticUnits.push(unit.semanticUnit);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, existingSemanticUnits };
}

export function mapSectionSummaryRowsToLocalStructureSectionSummaries(
  rows: readonly Record<string, unknown>[],
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; sectionSummaries: SectionSummaryContextInput[] } | { ok: false; errors: string[] } {
  const sectionSummaries: SectionSummaryContextInput[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const summary = mapSectionSummaryRow(row, expected);
    if (!summary.ok) {
      errors.push(...summary.errors.map((error) => `section summary rows[${index}].${error}`));
      continue;
    }

    sectionSummaries.push(summary.sectionSummary);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, sectionSummaries };
}

export function mapPreviousStructureSnapshotRowsToLocalStructureSnapshot(
  rows: readonly Record<string, unknown>[],
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; snapshot?: PreviousStructureSnapshotContextInput } | { ok: false; errors: string[] } {
  if (rows.length === 0) {
    return { ok: true };
  }
  if (rows.length > 1) {
    return { ok: false, errors: ['previous structure snapshot lookup must return at most one row'] };
  }

  const snapshot = mapPreviousStructureSnapshotRow(rows[0] as Record<string, unknown>, expected);
  if (!snapshot.ok) {
    return {
      ok: false,
      errors: snapshot.errors.map((error) => `previous structure snapshot rows[0].${error}`),
    };
  }

  return { ok: true, snapshot: snapshot.snapshot };
}

function mapSemanticUnitRow(
  row: Record<string, unknown>,
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; semanticUnit: SemanticUnitContextInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = readRequiredStringColumn(row, 'id');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const title = readOptionalStringColumn(row, 'title');
  const summary = readRequiredStringColumn(row, 'summary');
  const sourceBlockId = readOptionalStringColumn(row, 'source_block_id', 'sourceBlockId');
  const sourceBlockIds = readRequiredSourceBlockIds(row, sourceBlockId);
  const sourceStartOffset = readOptionalFiniteNumberColumn(row, 'source_start_offset', 'sourceStartOffset');
  const sourceEndOffset = readOptionalFiniteNumberColumn(row, 'source_end_offset', 'sourceEndOffset');
  const confidence = readOptionalConfidenceColumn(row, 'confidence');
  const relevanceScore = readOptionalFiniteNumberColumn(row, 'relevance_score', 'relevanceScore');
  const updatedAt = readOptionalFiniteNumberColumn(row, 'updated_at', 'updatedAt');
  const position = readOptionalFiniteNumberColumn(row, 'position');

  if (id === undefined) errors.push('id must be a non-empty string');
  if (noteId === undefined) {
    errors.push('note_id must be a non-empty string');
  } else if (noteId !== expected.noteId) {
    errors.push('note_id must match requested noteId');
  }
  pushSectionScopeErrors(errors, 'section_id', sectionId, expected);
  if (title === null) errors.push('title must be a non-empty string when provided');
  if (summary === undefined) errors.push('summary must be a non-empty string');
  if (sourceBlockId === null) errors.push('source_block_id must be a non-empty string when provided');
  if (sourceBlockIds === undefined) errors.push('source_block_ids must contain at least one source block id');
  if (sourceBlockIds === null) errors.push('source_block_ids must be a JSON array or string array of non-empty strings');
  if (sourceStartOffset === null) errors.push('source_start_offset must be a finite number when provided');
  if (sourceEndOffset === null) errors.push('source_end_offset must be a finite number when provided');
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
  if (confidence === null) errors.push('confidence must be a finite number between 0 and 1 when provided');
  if (relevanceScore === null) errors.push('relevance_score must be a finite number when provided');
  if (updatedAt === null) errors.push('updated_at must be a finite number when provided');
  if (position === null) errors.push('position must be a finite number when provided');

  if (
    errors.length > 0 ||
    id === undefined ||
    noteId === undefined ||
    noteId !== expected.noteId ||
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
    },
  };
}

function mapSectionSummaryRow(
  row: Record<string, unknown>,
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; sectionSummary: SectionSummaryContextInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const sectionId = readRequiredStringColumn(row, 'section_id', 'sectionId');
  const title = readOptionalStringColumn(row, 'title');
  const summary = readRequiredStringColumn(row, 'summary');
  const sourceBlockIds = readStringArrayColumn(row, 'source_block_ids', 'sourceBlockIds');
  const updatedAt = readOptionalFiniteNumberColumn(row, 'updated_at', 'updatedAt');
  const position = readOptionalFiniteNumberColumn(row, 'position');

  if (noteId === undefined) {
    errors.push('note_id must be a non-empty string');
  } else if (noteId !== expected.noteId) {
    errors.push('note_id must match requested noteId');
  }
  if (sectionId === undefined) {
    errors.push('section_id must be a non-empty string');
  } else if (expected.targetScope === 'section' && sectionId !== expected.targetId) {
    errors.push('section_id must match requested targetId');
  }
  if (title === null) errors.push('title must be a non-empty string when provided');
  if (summary === undefined) errors.push('summary must be a non-empty string');
  if (sourceBlockIds === undefined || (sourceBlockIds !== null && sourceBlockIds.length === 0)) {
    errors.push('source_block_ids must contain at least one source block id');
  }
  if (sourceBlockIds === null) errors.push('source_block_ids must be a JSON array or string array of non-empty strings');
  if (updatedAt === null) errors.push('updated_at must be a finite number when provided');
  if (position === null) errors.push('position must be a finite number when provided');

  if (
    errors.length > 0 ||
    noteId === undefined ||
    noteId !== expected.noteId ||
    sectionId === undefined ||
    summary === undefined ||
    sourceBlockIds === undefined ||
    sourceBlockIds === null ||
    sourceBlockIds.length === 0
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    sectionSummary: {
      sectionId,
      ...(typeof title === 'string' ? { title } : {}),
      summary,
      sourceBlockIds,
    },
  };
}

function mapPreviousStructureSnapshotRow(
  row: Record<string, unknown>,
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; snapshot: PreviousStructureSnapshotContextInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const snapshotId = readRequiredStringColumn(row, 'snapshot_id', 'snapshotId');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const semanticUnitIds = readStringArrayColumn(row, 'semantic_unit_ids', 'semanticUnitIds');
  const summary = readRequiredStringColumn(row, 'summary');
  const generatedAt = readRequiredFiniteNumberColumn(row, 'generated_at', 'generatedAt');

  if (snapshotId === undefined) errors.push('snapshot_id must be a non-empty string');
  if (noteId === undefined) {
    errors.push('note_id must be a non-empty string');
  } else if (noteId !== expected.noteId) {
    errors.push('note_id must match requested noteId');
  }
  if (sectionId === null) {
    errors.push('section_id must be a non-empty string when provided');
  } else if (expected.targetScope === 'section') {
    if (sectionId === undefined) {
      errors.push('section_id must be provided for section target scope');
    } else if (sectionId !== expected.targetId) {
      errors.push('section_id must match requested targetId');
    }
  } else if (sectionId !== undefined) {
    errors.push('section_id must be absent for note target scope');
  }
  if (semanticUnitIds === undefined || (semanticUnitIds !== null && semanticUnitIds.length === 0)) {
    errors.push('semantic_unit_ids must contain at least one semantic unit id');
  }
  if (semanticUnitIds === null) {
    errors.push('semantic_unit_ids must be a JSON array or string array of non-empty strings');
  }
  if (summary === undefined) errors.push('summary must be a non-empty string');
  if (generatedAt === undefined) errors.push('generated_at must be a finite number');

  if (
    errors.length > 0 ||
    snapshotId === undefined ||
    noteId === undefined ||
    noteId !== expected.noteId ||
    semanticUnitIds === undefined ||
    semanticUnitIds === null ||
    semanticUnitIds.length === 0 ||
    summary === undefined ||
    generatedAt === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    snapshot: {
      snapshotId,
      semanticUnitIds,
      summary,
      generatedAt,
    },
  };
}

function validateSupportedLocalStructureRequest(
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

function pushSectionScopeErrors(
  errors: string[],
  column: string,
  sectionId: string | undefined | null,
  expected: { targetScope: TargetScopeKind; targetId?: string },
): void {
  if (sectionId === null) {
    errors.push(`${column} must be a non-empty string when provided`);
    return;
  }

  if (expected.targetScope !== 'section') {
    return;
  }

  if (sectionId === undefined) {
    errors.push(`${column} must be provided for section target scope`);
  } else if (sectionId !== expected.targetId) {
    errors.push(`${column} must match requested targetId`);
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

function readRequiredFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

  return readRequiredFiniteNumberColumn(row, primaryColumn, fallbackColumn) ?? null;
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

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}
