// SQL adapter for context assembly target snapshots.
// Authority: docs/contracts/context-assembly.md
// Companion: docs/contracts/cloudflare-agents-turso.md, docs/contracts/app-note-model.md

import {
  userAuthoredBlockOrigin,
  userBlockTypes,
  type HeadingLevel,
} from '../../../contexts/note-model/src/contract/noteContract.ts';
import type {
  ContextAssemblyInput,
  TargetScopeKind,
} from '../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type {
  ContextAssemblyRuntimeRequest,
  ContextAssemblyTargetSnapshotPort,
} from './contextAssemblyRuntimeFlow.ts';

export interface ContextAssemblyTargetSnapshotSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ContextAssemblyTargetSnapshotSqlExecutor {
  query(statement: ContextAssemblyTargetSnapshotSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export class TursoContextAssemblyTargetSnapshotAdapter implements ContextAssemblyTargetSnapshotPort {
  private readonly executor: ContextAssemblyTargetSnapshotSqlExecutor;

  constructor(input: { executor: ContextAssemblyTargetSnapshotSqlExecutor }) {
    this.executor = input.executor;
  }

  async loadTargetContext(input: ContextAssemblyRuntimeRequest): Promise<{
    target: ContextAssemblyInput['target'];
    note: ContextAssemblyInput['note'];
    outline: ContextAssemblyInput['outline'];
  }> {
    const requestResult = validateSupportedTargetRequest(input);
    if (!requestResult.ok) {
      throw new Error(requestResult.errors.join('; '));
    }

    const noteRows = await this.executor.query(mapTargetNoteLookupToSql(input));
    const noteResult = mapNoteRowsToContextAssemblyNote(noteRows, input);
    if (!noteResult.ok) {
      throw new Error(noteResult.errors.join('; '));
    }

    const outlineRows = await this.executor.query(mapTargetOutlineLookupToSql(input));
    const outlineResult = mapOutlineRowsToContextAssemblyOutline(outlineRows, input.noteId);
    if (!outlineResult.ok) {
      throw new Error(outlineResult.errors.join('; '));
    }

    const blockRows = await this.executor.query(mapTargetBlocksLookupToSql(input));
    const targetResult = mapTargetBlockRowsToContextAssemblyTarget(blockRows, input);
    if (!targetResult.ok) {
      throw new Error(targetResult.errors.join('; '));
    }

    return {
      target: targetResult.target,
      note: noteResult.note,
      outline: outlineResult.outline,
    };
  }
}

export function mapTargetNoteLookupToSql(input: {
  workspaceId: string;
  noteId: string;
}): ContextAssemblyTargetSnapshotSqlStatement {
  return {
    sql: [
      'select notes.id, notes.workspace_id, notes.title, notes.description_user, notes.description_ai, notes.description_ai_approved',
      'from notes',
      'where notes.workspace_id = ? and notes.id = ?',
      'limit 2',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

export function mapTargetOutlineLookupToSql(input: {
  workspaceId: string;
  noteId: string;
}): ContextAssemblyTargetSnapshotSqlStatement {
  return {
    sql: [
      'select sections.id, sections.note_id, sections.heading_level, sections.title, sections.position',
      'from sections',
      'inner join notes on notes.id = sections.note_id',
      'where notes.workspace_id = ? and sections.note_id = ? and sections.heading_level is not null and sections.title is not null',
      'order by sections.position asc, sections.id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

export function mapTargetBlocksLookupToSql(input: {
  workspaceId: string;
  noteId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
}): ContextAssemblyTargetSnapshotSqlStatement {
  if (input.targetScope === 'chunk') {
    throw new Error('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  }

  if (input.targetScope === 'section') {
    if (!isTrimmedNonEmptyString(input.targetId)) {
      throw new Error('targetId must be provided for section target scope');
    }

    return {
      sql: [
        'select blocks.id, blocks.note_id, blocks.section_id, blocks.type, blocks.plain_text, blocks.position, blocks.origin',
        'from blocks',
        'inner join notes on notes.id = blocks.note_id',
        'where notes.workspace_id = ? and blocks.note_id = ? and blocks.section_id = ? and blocks.origin = ?',
        'order by blocks.position asc, blocks.id asc',
      ].join(' '),
      args: [input.workspaceId, input.noteId, input.targetId, userAuthoredBlockOrigin],
    };
  }

  return {
    sql: [
      'select blocks.id, blocks.note_id, blocks.section_id, blocks.type, blocks.plain_text, blocks.position, blocks.origin',
      'from blocks',
      'inner join notes on notes.id = blocks.note_id',
      'where notes.workspace_id = ? and blocks.note_id = ? and blocks.origin = ?',
      'order by blocks.position asc, blocks.id asc',
    ].join(' '),
    args: [input.workspaceId, input.noteId, userAuthoredBlockOrigin],
  };
}

export function mapNoteRowsToContextAssemblyNote(
  rows: readonly Record<string, unknown>[],
  expected: { workspaceId: string; noteId: string },
): { ok: true; note: ContextAssemblyInput['note'] } | { ok: false; errors: string[] } {
  if (rows.length === 0) {
    return { ok: false, errors: ['note row must exist for requested workspaceId and noteId'] };
  }
  if (rows.length > 1) {
    return { ok: false, errors: ['note lookup must return at most one row'] };
  }

  const row = rows[0] as Record<string, unknown>;
  const errors: string[] = [];
  const id = readRequiredStringColumn(row, 'id');
  const workspaceId = readRequiredStringColumn(row, 'workspace_id', 'workspaceId');
  const title = readRequiredStringColumn(row, 'title');
  const descriptionUser = readOptionalStringColumn(row, 'description_user', 'descriptionUser');
  const descriptionAi = readOptionalStringColumn(row, 'description_ai', 'descriptionAi');
  const descriptionAiApproved = readOptionalBooleanishColumn(
    row,
    'description_ai_approved',
    'descriptionAiApproved',
  );

  if (id === undefined) errors.push('note rows[0].id must be a non-empty string');
  if (id !== undefined && id !== expected.noteId) errors.push('note rows[0].id must match requested noteId');
  if (workspaceId === undefined) errors.push('note rows[0].workspace_id must be a non-empty string');
  if (workspaceId !== undefined && workspaceId !== expected.workspaceId) {
    errors.push('note rows[0].workspace_id must match requested workspaceId');
  }
  if (title === undefined) errors.push('note rows[0].title must be a non-empty string');
  if (descriptionUser === null) {
    errors.push('note rows[0].description_user must be a non-empty string when provided');
  }
  if (descriptionAi === null) {
    errors.push('note rows[0].description_ai must be a non-empty string when provided');
  }
  if (descriptionAiApproved === null) {
    errors.push('note rows[0].description_ai_approved must be boolean-like when provided');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    note: {
      id: id as string,
      title: title as string,
      ...(typeof descriptionUser === 'string' ? { descriptionUser } : {}),
      ...(typeof descriptionAi === 'string' ? { descriptionAi } : {}),
      ...(typeof descriptionAiApproved === 'boolean' ? { descriptionAiApproved } : {}),
    },
  };
}

export function mapOutlineRowsToContextAssemblyOutline(
  rows: readonly Record<string, unknown>[],
  expectedNoteId?: string,
): { ok: true; outline: ContextAssemblyInput['outline'] } | { ok: false; errors: string[] } {
  const outline: ContextAssemblyInput['outline'] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const sectionId = readRequiredStringColumn(row, 'id', 'sectionId');
    const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
    const title = readRequiredStringColumn(row, 'title');
    const level = readHeadingLevelColumn(row, 'heading_level', 'level');
    const position = readRequiredFiniteNumberColumn(row, 'position');

    if (sectionId === undefined) errors.push(`outline rows[${index}].id must be a non-empty string`);
    if (noteId === undefined) errors.push(`outline rows[${index}].note_id must be a non-empty string`);
    if (noteId !== undefined && expectedNoteId !== undefined && noteId !== expectedNoteId) {
      errors.push(`outline rows[${index}].note_id must match requested noteId`);
    }
    if (title === undefined) errors.push(`outline rows[${index}].title must be a non-empty string`);
    if (level === undefined) errors.push(`outline rows[${index}].heading_level must be 1, 2, or 3`);
    if (position === undefined) errors.push(`outline rows[${index}].position must be a finite number`);

    if (
      sectionId !== undefined &&
      noteId !== undefined &&
      (expectedNoteId === undefined || noteId === expectedNoteId) &&
      title !== undefined &&
      level !== undefined &&
      position !== undefined
    ) {
      outline.push({ sectionId, title, level });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, outline };
}

export function mapTargetBlockRowsToContextAssemblyTarget(
  rows: readonly Record<string, unknown>[],
  expected: { noteId: string; targetScope: TargetScopeKind; targetId?: string },
): { ok: true; target: ContextAssemblyInput['target'] } | { ok: false; errors: string[] } {
  if (expected.targetScope === 'chunk') {
    return {
      ok: false,
      errors: ['targetScope chunk is unsupported until a stable chunk SQL schema exists'],
    };
  }

  const sourceBlockIds: string[] = [];
  const targetTextParts: string[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const id = readRequiredStringColumn(row, 'id');
    const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
    const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
    const type = readRequiredStringColumn(row, 'type');
    const plainText = readRequiredTextColumn(row, 'plain_text', 'plainText');
    const position = readRequiredFiniteNumberColumn(row, 'position');
    const origin = readRequiredStringColumn(row, 'origin');

    if (id === undefined) errors.push(`target block rows[${index}].id must be a non-empty string`);
    if (noteId === undefined) errors.push(`target block rows[${index}].note_id must be a non-empty string`);
    if (noteId !== undefined && noteId !== expected.noteId) {
      errors.push(`target block rows[${index}].note_id must match requested noteId`);
    }
    if (expected.targetScope === 'section') {
      if (sectionId === undefined) {
        errors.push(`target block rows[${index}].section_id must be a non-empty string`);
      } else if (sectionId !== expected.targetId) {
        errors.push(`target block rows[${index}].section_id must match requested targetId`);
      }
    } else if (sectionId === null) {
      errors.push(`target block rows[${index}].section_id must be a non-empty string when provided`);
    }
    if (type === undefined) {
      errors.push(`target block rows[${index}].type must be a non-empty string`);
    } else if (!isUserBlockTypeName(type)) {
      errors.push(`target block rows[${index}].type must be a user block type`);
    }
    if (plainText === undefined) errors.push(`target block rows[${index}].plain_text must be a string`);
    if (position === undefined) errors.push(`target block rows[${index}].position must be a finite number`);
    if (origin === undefined) {
      errors.push(`target block rows[${index}].origin must be user`);
    } else if (origin !== userAuthoredBlockOrigin) {
      errors.push(`target block rows[${index}].origin must be user`);
    }

    if (
      id !== undefined &&
      noteId === expected.noteId &&
      (expected.targetScope === 'note' || sectionId === expected.targetId) &&
      type !== undefined &&
      isUserBlockTypeName(type) &&
      plainText !== undefined &&
      position !== undefined &&
      origin === userAuthoredBlockOrigin
    ) {
      sourceBlockIds.push(id);
      targetTextParts.push(plainText);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (sourceBlockIds.length === 0) {
    return { ok: false, errors: ['target must include at least one user-authored source block'] };
  }

  return {
    ok: true,
    target: {
      scope: expected.targetScope,
      text: targetTextParts.join('\n'),
      sourceBlockIds,
    },
  };
}

function validateSupportedTargetRequest(
  input: ContextAssemblyRuntimeRequest,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (input.targetScope === 'chunk') {
    errors.push('targetScope chunk is unsupported until a stable chunk SQL schema exists');
  }
  if (input.targetScope === 'section' && !isTrimmedNonEmptyString(input.targetId)) {
    errors.push('targetId must be provided for section target scope');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
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

function readHeadingLevelColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): HeadingLevel | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function readRequiredFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalBooleanishColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): boolean | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return null;
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function isUserBlockTypeName(value: string): boolean {
  return (userBlockTypes as readonly string[]).includes(value);
}
