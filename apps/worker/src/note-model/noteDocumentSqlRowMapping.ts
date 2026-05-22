// SQL row mapping for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/data-model.md

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
  validateNoteDocumentForPersistence,
} from './noteDocumentPersistencePort.ts';
import {
  readContentJsonColumn,
  readOptionalBooleanColumn,
  readOptionalFiniteNumberColumn,
  readOptionalHeadingLevelColumn,
  readOptionalStringColumn,
  readRequiredFiniteNumberColumn,
  readRequiredStringColumn,
  readStringColumnAllowEmpty,
} from './noteDocumentSqlReaders.ts';

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
