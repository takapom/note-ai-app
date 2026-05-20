// SQL adapter for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/data-model.md
// Companion: docs/contracts/app-note-model.md, docs/contracts/backend-runtime.md

import type {
  BlockContract,
  BlockContentContract,
  BlockOrigin,
  BlockType,
  HeadingLevel,
  NoteContract,
  NoteDocumentContract,
  SectionContract,
} from '../../../../contexts/note-model/src/contract/noteContract.ts';
import {
  type NoteDocumentLoadRequest,
  type NoteDocumentLoadResult,
  type NoteDocumentPersistencePort,
  type NoteDocumentSaveResult,
  validateLoadRequest,
  validateNoteDocumentForPersistence,
} from './noteDocumentPersistencePort.ts';

export interface NoteDocumentSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface NoteDocumentSqlExecutor {
  query(statement: NoteDocumentSqlStatement): Promise<readonly Record<string, unknown>[]>;
  writeNoteDocument(statements: readonly NoteDocumentSqlStatement[]): Promise<void>;
}

export class TursoNoteDocumentPersistenceAdapter implements NoteDocumentPersistencePort {
  private readonly executor: NoteDocumentSqlExecutor;

  constructor(executor: NoteDocumentSqlExecutor) {
    this.executor = executor;
  }

  async saveDocument(document: NoteDocumentContract): Promise<NoteDocumentSaveResult> {
    const errors = validateNoteDocumentForPersistence(document);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      await this.executor.writeNoteDocument(mapNoteDocumentToSql(document));
    } catch (error) {
      return { ok: false, errors: [toSqlErrorMessage('note document SQL write failed', error)] };
    }

    return { ok: true, errors: [], document };
  }

  async loadDocument(input: NoteDocumentLoadRequest): Promise<NoteDocumentLoadResult> {
    const inputErrors = validateLoadRequest(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    try {
      const noteRows = await this.executor.query(mapNoteLookupToSql(input));
      const sectionsRows = await this.executor.query(mapSectionsLookupToSql(input));
      const blockRows = await this.executor.query(mapBlocksLookupToSql(input));

      return mapRowsToNoteDocument(noteRows, sectionsRows, blockRows, input);
    } catch (error) {
      return { ok: false, errors: [toSqlErrorMessage('note document SQL load failed', error)] };
    }
  }
}

export function mapNoteLookupToSql(input: NoteDocumentLoadRequest): NoteDocumentSqlStatement {
  return {
    sql: [
      'select id, workspace_id, title, description_user, description_ai, description_ai_approved, description_effective, created_at, updated_at',
      'from notes',
      'where workspace_id = ? and id = ?',
      'limit 2',
    ].join(' '),
    args: [input.workspaceId, input.noteId],
  };
}

export function mapSectionsLookupToSql(input: NoteDocumentLoadRequest): NoteDocumentSqlStatement {
  return {
    sql: [
      'select id, note_id, parent_section_id, heading_block_id, heading_level, title, description_ai, content_hash, last_structured_hash, last_structured_at, position, created_at, updated_at',
      'from sections',
      'where note_id = ?',
      'order by position asc, id asc',
    ].join(' '),
    args: [input.noteId],
  };
}

export function mapBlocksLookupToSql(input: NoteDocumentLoadRequest): NoteDocumentSqlStatement {
  return {
    sql: [
      'select id, note_id, section_id, parent_block_id, type, content_json, plain_text, position, origin, content_hash, created_at, updated_at',
      'from blocks',
      'where note_id = ?',
      'order by position asc, id asc',
    ].join(' '),
    args: [input.noteId],
  };
}

export function mapNoteDocumentToSql(document: NoteDocumentContract): NoteDocumentSqlStatement[] {
  const errors = validateNoteDocumentForPersistence(document);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return [
    mapNoteToUpsertSql(document.note),
    {
      sql: 'delete from blocks where note_id = ?',
      args: [document.note.id],
    },
    {
      sql: 'delete from sections where note_id = ?',
      args: [document.note.id],
    },
    ...document.sections.map(mapSectionToInsertSql),
    ...document.blocks.map(mapBlockToInsertSql),
  ];
}

export function mapRowsToNoteDocument(
  noteRows: readonly Record<string, unknown>[],
  sectionRows: readonly Record<string, unknown>[],
  blockRows: readonly Record<string, unknown>[],
  input: NoteDocumentLoadRequest,
): NoteDocumentLoadResult {
  const noteResult = mapNoteRows(noteRows, input);
  if (noteResult.ok !== true) {
    return noteResult;
  }

  const sectionResult = mapSectionRows(sectionRows, input.noteId);
  if (sectionResult.ok !== true) {
    return sectionResult;
  }

  const blockResult = mapBlockRows(blockRows, input.noteId);
  if (blockResult.ok !== true) {
    return blockResult;
  }

  const document: NoteDocumentContract = {
    note: noteResult.note,
    sections: sectionResult.sections,
    blocks: blockResult.blocks,
  };
  const errors = validateNoteDocumentForPersistence(document);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, errors: [], document };
}

function mapNoteToUpsertSql(note: NoteContract): NoteDocumentSqlStatement {
  return {
    sql: [
      'insert into notes',
      '(id, workspace_id, title, description_user, description_ai, description_ai_approved, description_effective, created_at, updated_at)',
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'on conflict(id) do update set workspace_id = excluded.workspace_id, title = excluded.title, description_user = excluded.description_user, description_ai = excluded.description_ai, description_ai_approved = excluded.description_ai_approved, description_effective = excluded.description_effective, updated_at = excluded.updated_at',
    ].join(' '),
    args: [
      note.id,
      note.workspaceId,
      note.title,
      note.descriptionUser ?? null,
      note.descriptionAi ?? null,
      note.descriptionAiApproved ?? null,
      note.descriptionEffective ?? null,
      note.createdAt,
      note.updatedAt,
    ],
  };
}

function mapSectionToInsertSql(section: SectionContract): NoteDocumentSqlStatement {
  return {
    sql: [
      'insert into sections',
      '(id, note_id, parent_section_id, heading_block_id, heading_level, title, description_ai, content_hash, last_structured_hash, last_structured_at, position, created_at, updated_at)',
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      section.id,
      section.noteId,
      section.parentSectionId ?? null,
      section.headingBlockId ?? null,
      section.headingLevel ?? null,
      section.title ?? null,
      section.descriptionAi ?? null,
      section.contentHash,
      section.lastStructuredHash ?? null,
      section.lastStructuredAt ?? null,
      section.position,
      section.createdAt,
      section.updatedAt,
    ],
  };
}

function mapBlockToInsertSql(block: BlockContract): NoteDocumentSqlStatement {
  return {
    sql: [
      'insert into blocks',
      '(id, note_id, section_id, parent_block_id, type, content_json, plain_text, position, origin, content_hash, created_at, updated_at)',
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      block.id,
      block.noteId,
      block.sectionId ?? null,
      block.parentBlockId ?? null,
      block.type,
      JSON.stringify(block.contentJson),
      block.plainText,
      block.position,
      block.origin,
      block.contentHash,
      block.createdAt,
      block.updatedAt,
    ],
  };
}

function mapNoteRows(
  rows: readonly Record<string, unknown>[],
  input: NoteDocumentLoadRequest,
): { ok: true; note: NoteContract; errors: [] } | { ok: false; errors: string[] } {
  if (rows.length !== 1) {
    return { ok: false, errors: ['note row must exist exactly once for requested workspaceId and noteId'] };
  }

  const row = rows[0] as Record<string, unknown>;
  const errors: string[] = [];
  const id = readRequiredStringColumn(row, 'id');
  const workspaceId = readRequiredStringColumn(row, 'workspace_id', 'workspaceId');
  const title = readRequiredStringColumn(row, 'title');
  const descriptionUser = readOptionalStringColumn(row, 'description_user', 'descriptionUser');
  const descriptionAi = readOptionalStringColumn(row, 'description_ai', 'descriptionAi');
  const descriptionAiApproved = readOptionalBooleanColumn(row, 'description_ai_approved', 'descriptionAiApproved');
  const descriptionEffective = readOptionalStringColumn(row, 'description_effective', 'descriptionEffective');
  const createdAt = readRequiredFiniteNumberColumn(row, 'created_at', 'createdAt');
  const updatedAt = readRequiredFiniteNumberColumn(row, 'updated_at', 'updatedAt');

  if (id === undefined) errors.push('note rows[0].id must be a non-empty string');
  if (id !== undefined && id !== input.noteId) errors.push('note rows[0].id must match requested noteId');
  if (workspaceId === undefined) errors.push('note rows[0].workspace_id must be a non-empty string');
  if (workspaceId !== undefined && workspaceId !== input.workspaceId) {
    errors.push('note rows[0].workspace_id must match requested workspaceId');
  }
  if (title === undefined) errors.push('note rows[0].title must be a non-empty string');
  if (descriptionUser === null) errors.push('note rows[0].description_user must be a non-empty string when provided');
  if (descriptionAi === null) errors.push('note rows[0].description_ai must be a non-empty string when provided');
  if (descriptionAiApproved === null) {
    errors.push('note rows[0].description_ai_approved must be boolean-like when provided');
  }
  if (descriptionEffective === null) {
    errors.push('note rows[0].description_effective must be a non-empty string when provided');
  }
  if (createdAt === undefined) errors.push('note rows[0].created_at must be a finite number');
  if (updatedAt === undefined) errors.push('note rows[0].updated_at must be a finite number');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    note: {
      id: id as string,
      workspaceId: workspaceId as string,
      title: title as string,
      ...(typeof descriptionUser === 'string' ? { descriptionUser } : {}),
      ...(typeof descriptionAi === 'string' ? { descriptionAi } : {}),
      ...(typeof descriptionAiApproved === 'boolean' ? { descriptionAiApproved } : {}),
      ...(typeof descriptionEffective === 'string' ? { descriptionEffective } : {}),
      createdAt: createdAt as number,
      updatedAt: updatedAt as number,
    },
  };
}

function mapSectionRows(
  rows: readonly Record<string, unknown>[],
  expectedNoteId: string,
): { ok: true; sections: SectionContract[] } | { ok: false; errors: string[] } {
  const sections: SectionContract[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const result = mapSectionRow(row, expectedNoteId, index);
    if (!result.ok) {
      errors.push(...result.errors);
      continue;
    }
    sections.push(result.section);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, sections };
}

function mapSectionRow(
  row: Record<string, unknown>,
  expectedNoteId: string,
  index: number,
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
  const prefix = `section rows[${index}]`;

  if (id === undefined) errors.push(`${prefix}.id must be a non-empty string`);
  if (noteId === undefined) errors.push(`${prefix}.note_id must be a non-empty string`);
  if (noteId !== undefined && noteId !== expectedNoteId) errors.push(`${prefix}.note_id must match requested noteId`);
  if (parentSectionId === null) errors.push(`${prefix}.parent_section_id must be a non-empty string when provided`);
  if (headingBlockId === null) errors.push(`${prefix}.heading_block_id must be a non-empty string when provided`);
  if (headingLevel === null) errors.push(`${prefix}.heading_level must be 1, 2, or 3 when provided`);
  if (title === null) errors.push(`${prefix}.title must be a non-empty string when provided`);
  if (descriptionAi === null) errors.push(`${prefix}.description_ai must be a non-empty string when provided`);
  if (contentHash === undefined) errors.push(`${prefix}.content_hash must be a non-empty string`);
  if (lastStructuredHash === null) {
    errors.push(`${prefix}.last_structured_hash must be a non-empty string when provided`);
  }
  if (lastStructuredAt === null) errors.push(`${prefix}.last_structured_at must be a finite number when provided`);
  if (position === undefined) errors.push(`${prefix}.position must be a finite number`);
  if (createdAt === undefined) errors.push(`${prefix}.created_at must be a finite number`);
  if (updatedAt === undefined) errors.push(`${prefix}.updated_at must be a finite number`);

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

function mapBlockRows(
  rows: readonly Record<string, unknown>[],
  expectedNoteId: string,
): { ok: true; blocks: BlockContract[] } | { ok: false; errors: string[] } {
  const blocks: BlockContract[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const result = mapBlockRow(row, expectedNoteId, index);
    if (!result.ok) {
      errors.push(...result.errors);
      continue;
    }
    blocks.push(result.block);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, blocks };
}

function mapBlockRow(
  row: Record<string, unknown>,
  expectedNoteId: string,
  index: number,
): { ok: true; block: BlockContract } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = readRequiredStringColumn(row, 'id');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const parentBlockId = readOptionalStringColumn(row, 'parent_block_id', 'parentBlockId');
  const type = readRequiredStringColumn(row, 'type') as BlockType | undefined;
  const contentJson = readContentJsonColumn(row, 'content_json', 'contentJson');
  const plainText = readStringColumnAllowEmpty(row, 'plain_text', 'plainText');
  const position = readRequiredFiniteNumberColumn(row, 'position');
  const origin = readRequiredStringColumn(row, 'origin') as BlockOrigin | undefined;
  const contentHash = readRequiredStringColumn(row, 'content_hash', 'contentHash');
  const createdAt = readRequiredFiniteNumberColumn(row, 'created_at', 'createdAt');
  const updatedAt = readRequiredFiniteNumberColumn(row, 'updated_at', 'updatedAt');
  const prefix = `block rows[${index}]`;

  if (id === undefined) errors.push(`${prefix}.id must be a non-empty string`);
  if (noteId === undefined) errors.push(`${prefix}.note_id must be a non-empty string`);
  if (noteId !== undefined && noteId !== expectedNoteId) errors.push(`${prefix}.note_id must match requested noteId`);
  if (sectionId === null) errors.push(`${prefix}.section_id must be a non-empty string when provided`);
  if (parentBlockId === null) errors.push(`${prefix}.parent_block_id must be a non-empty string when provided`);
  if (type === undefined) errors.push(`${prefix}.type must be a non-empty string`);
  if (contentJson === undefined) errors.push(`${prefix}.content_json must be valid JSON object content`);
  if (plainText === undefined) errors.push(`${prefix}.plain_text must be a string`);
  if (position === undefined) errors.push(`${prefix}.position must be a finite number`);
  if (origin === undefined) errors.push(`${prefix}.origin must be a non-empty string`);
  if (contentHash === undefined) errors.push(`${prefix}.content_hash must be a non-empty string`);
  if (createdAt === undefined) errors.push(`${prefix}.created_at must be a finite number`);
  if (updatedAt === undefined) errors.push(`${prefix}.updated_at must be a finite number`);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const block: BlockContract = {
    id: id as string,
    noteId: noteId as string,
    ...(typeof sectionId === 'string' ? { sectionId } : {}),
    ...(typeof parentBlockId === 'string' ? { parentBlockId } : {}),
    type: type as BlockType,
    contentJson: contentJson as BlockContentContract,
    plainText: plainText as string,
    position: position as number,
    origin: origin as BlockOrigin,
    contentHash: contentHash as string,
    createdAt: createdAt as number,
    updatedAt: updatedAt as number,
  };

  return { ok: true, block };
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

  return value.trim().length > 0 && value.trim() === value ? value : undefined;
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

function readStringColumnAllowEmpty(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'string' ? value : undefined;
}

function readOptionalBooleanColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): boolean | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return null;
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

function readOptionalHeadingLevelColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): HeadingLevel | undefined | null {
  const value = readOptionalFiniteNumberColumn(row, primaryColumn, fallbackColumn);
  if (value === undefined || value === null) {
    return value;
  }
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function readContentJsonColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): BlockContentContract | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BlockContentContract;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as BlockContentContract;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function toSqlErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  return prefix;
}
