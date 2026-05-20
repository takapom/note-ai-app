// SQL adapter for scheduler section snapshots.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/app-note-model.md, docs/contracts/backend-runtime.md

import type { SectionContract } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import type { SchedulerNoteSnapshotPort } from './structureSchedulerRuntimeFlow.ts';

export interface SchedulerNoteSnapshotSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface SchedulerNoteSnapshotSqlExecutor {
  query(statement: SchedulerNoteSnapshotSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export class TursoSchedulerNoteSnapshotAdapter implements SchedulerNoteSnapshotPort {
  private readonly sectionExecutor: SchedulerNoteSnapshotSqlExecutor;
  private readonly dirtyMarkExecutor: SchedulerNoteSnapshotSqlExecutor | undefined;

  constructor(input: {
    sectionExecutor: SchedulerNoteSnapshotSqlExecutor;
    dirtyMarkExecutor?: SchedulerNoteSnapshotSqlExecutor;
  }) {
    this.sectionExecutor = input.sectionExecutor;
    this.dirtyMarkExecutor = input.dirtyMarkExecutor;
  }

  async loadSections(input: { workspaceId: string; noteId: string }): Promise<SectionContract[]> {
    const sectionRows = await this.sectionExecutor.query(mapSectionSnapshotLookupToSql(input));
    const sectionResult = mapSectionRowsToContracts(sectionRows, input.noteId);

    if (!sectionResult.ok) {
      throw new Error(sectionResult.errors.join('; '));
    }

    if (this.dirtyMarkExecutor === undefined) {
      return sectionResult.sections;
    }

    const dirtyRows = await this.dirtyMarkExecutor.query(mapDirtySectionMarksLookupToSql(input));
    const dirtyResult = mapDirtySectionMarkRows(dirtyRows, input.noteId);

    if (!dirtyResult.ok) {
      throw new Error(dirtyResult.errors.join('; '));
    }

    return overlayDirtySectionMarks(sectionResult.sections, dirtyResult.dirtySectionIds);
  }
}

export function mapSectionSnapshotLookupToSql(input: {
  workspaceId: string;
  noteId: string;
}): SchedulerNoteSnapshotSqlStatement {
  return {
    sql: [
      'select sections.id, sections.note_id, sections.parent_section_id, sections.heading_block_id, sections.heading_level, sections.title, sections.description_ai, sections.content_hash, sections.last_structured_hash, sections.last_structured_at, sections.position, sections.created_at, sections.updated_at',
      'from sections',
      'inner join notes on notes.id = sections.note_id',
      'where notes.workspace_id = ? and sections.note_id = ?',
      'order by sections.position asc, sections.id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

export function mapDirtySectionMarksLookupToSql(input: {
  workspaceId: string;
  noteId: string;
}): SchedulerNoteSnapshotSqlStatement {
  return {
    sql: [
      'select target_scope, note_id, section_id, is_dirty, marked_at',
      'from agent_local_dirty_scope_marks',
      'where note_id = ?',
      'order by marked_at asc, section_id asc',
    ].join(' '),
    args: [input.noteId],
  };
}

export function mapSectionRowsToContracts(
  rows: readonly Record<string, unknown>[],
  expectedNoteId?: string,
): { ok: true; sections: SectionContract[] } | { ok: false; errors: string[] } {
  const sections: SectionContract[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const section = mapSectionRow(row, expectedNoteId);
    if (!section.ok) {
      errors.push(...section.errors.map((error) => `section rows[${index}].${error}`));
      continue;
    }

    sections.push(section.section);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, sections };
}

export function mapDirtySectionMarkRows(
  rows: readonly Record<string, unknown>[],
  expectedNoteId?: string,
): { ok: true; dirtySectionIds: readonly string[] } | { ok: false; errors: string[] } {
  const latestBySectionId = new Map<string, { isDirty: boolean; markedAt: number }>();
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const targetScope = readRequiredStringColumn(row, 'target_scope', 'targetScope');
    const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
    const sectionId = readRequiredStringColumn(row, 'section_id', 'sectionId');
    const isDirty = readBooleanishColumn(row, 'is_dirty', 'isDirty');
    const markedAt = readRequiredFiniteNumberColumn(row, 'marked_at', 'markedAt');

    if (targetScope === undefined) {
      errors.push(`dirty section mark rows[${index}].target_scope must be section`);
    } else if (targetScope !== 'section') {
      continue;
    }
    if (noteId === undefined) {
      errors.push(`dirty section mark rows[${index}].note_id must be a non-empty string`);
    } else if (expectedNoteId !== undefined && noteId !== expectedNoteId) {
      continue;
    }
    if (sectionId === undefined) {
      errors.push(`dirty section mark rows[${index}].section_id must be a non-empty string`);
    }
    if (isDirty === undefined) {
      errors.push(`dirty section mark rows[${index}].is_dirty must be boolean-like`);
    }
    if (markedAt === undefined) {
      errors.push(`dirty section mark rows[${index}].marked_at must be a finite number`);
    }

    if (sectionId !== undefined && isDirty !== undefined && markedAt !== undefined) {
      const previous = latestBySectionId.get(sectionId);
      if (previous === undefined || markedAt >= previous.markedAt) {
        latestBySectionId.set(sectionId, { isDirty, markedAt });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    dirtySectionIds: Array.from(latestBySectionId.entries())
      .filter(([, mark]) => mark.isDirty)
      .map(([sectionId]) => sectionId),
  };
}

export function overlayDirtySectionMarks(
  sections: readonly SectionContract[],
  dirtySectionIds: readonly string[],
): SectionContract[] {
  const dirty = new Set(dirtySectionIds);

  return sections.map((section) => ({
    ...section,
    isDirty: section.isDirty || dirty.has(section.id),
  }));
}

function mapSectionRow(
  row: Record<string, unknown>,
  expectedNoteId: string | undefined,
): { ok: true; section: SectionContract } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = readRequiredStringColumn(row, 'id');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const parentSectionId = readOptionalStringColumn(row, 'parent_section_id', 'parentSectionId');
  const headingBlockId = readOptionalStringColumn(row, 'heading_block_id', 'headingBlockId');
  const headingLevel = readOptionalHeadingLevelColumn(row, 'heading_level', 'headingLevel');
  const title = readOptionalStringColumn(row, 'title');
  const descriptionAi = readOptionalStringColumn(row, 'description_ai', 'descriptionAi');
  const contentHash = readRequiredStringColumn(row, 'content_hash', 'contentHash');
  const lastStructuredHash = readOptionalStringColumn(row, 'last_structured_hash', 'lastStructuredHash');
  const lastStructuredAt = readOptionalFiniteNumberColumn(row, 'last_structured_at', 'lastStructuredAt');
  const position = readRequiredFiniteNumberColumn(row, 'position');
  const createdAt = readRequiredFiniteNumberColumn(row, 'created_at', 'createdAt');
  const updatedAt = readRequiredFiniteNumberColumn(row, 'updated_at', 'updatedAt');

  if (id === undefined) errors.push('id must be a non-empty string');
  if (noteId === undefined) errors.push('note_id must be a non-empty string');
  if (noteId !== undefined && expectedNoteId !== undefined && noteId !== expectedNoteId) {
    errors.push('note_id must match requested noteId');
  }
  if (parentSectionId === null) errors.push('parent_section_id must be a non-empty string when provided');
  if (headingBlockId === null) errors.push('heading_block_id must be a non-empty string when provided');
  if (headingLevel === null) errors.push('heading_level must be 1, 2, or 3 when provided');
  if (title === null) errors.push('title must be a non-empty string when provided');
  if (descriptionAi === null) errors.push('description_ai must be a non-empty string when provided');
  if (contentHash === undefined) errors.push('content_hash must be a non-empty string');
  if (lastStructuredHash === null) errors.push('last_structured_hash must be a non-empty string when provided');
  if (lastStructuredAt === null) errors.push('last_structured_at must be a finite number when provided');
  if (position === undefined) errors.push('position must be a finite number');
  if (createdAt === undefined) errors.push('created_at must be a finite number');
  if (updatedAt === undefined) errors.push('updated_at must be a finite number');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    section: {
      id: id as string,
      noteId: noteId as string,
      ...(typeof parentSectionId === 'string' ? { parentSectionId } : {}),
      ...(typeof headingBlockId === 'string' ? { headingBlockId } : {}),
      ...(headingLevel === 1 || headingLevel === 2 || headingLevel === 3 ? { headingLevel } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof descriptionAi === 'string' ? { descriptionAi } : {}),
      contentHash: contentHash as string,
      ...(typeof lastStructuredHash === 'string' ? { lastStructuredHash } : {}),
      ...(typeof lastStructuredAt === 'number' ? { lastStructuredAt } : {}),
      isDirty: false,
      position: position as number,
      createdAt: createdAt as number,
      updatedAt: updatedAt as number,
    },
  };
}

function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed === value ? value : undefined;
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

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalHeadingLevelColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): 1 | 2 | 3 | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return value === 1 || value === 2 || value === 3 ? value : null;
}

function readBooleanishColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): boolean | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return undefined;
}
