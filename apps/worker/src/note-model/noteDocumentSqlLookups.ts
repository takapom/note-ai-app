// SQL statement mapping for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/data-model.md

import type { BlockContract, NoteContract, NoteDocumentContract, SectionContract } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import { type NoteDocumentLoadRequest, validateNoteDocumentForPersistence } from './noteDocumentPersistencePort.ts';
import type { NoteDocumentSqlStatement } from './noteDocumentSqlTypes.ts';

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
