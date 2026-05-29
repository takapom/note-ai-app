// SQL adapter for workspace-scoped Note Library summaries.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/data-model.md

import {
  compareNoteListItems,
  type NoteListItem,
  type NoteListPort,
  type NoteListRequest,
  type NoteListResult,
  validateNoteListItem,
  validateNoteListRequest,
} from './noteListPort.ts';
import {
  readOptionalStringColumn,
  readRequiredFiniteNumberColumn,
  readRequiredStringColumn,
  toSqlErrorMessage,
} from './noteDocumentSqlReaders.ts';
import type { NoteDocumentSqlExecutor, NoteDocumentSqlStatement } from './noteDocumentSqlTypes.ts';

export class TursoNoteListSqlAdapter implements NoteListPort {
  private readonly executor: NoteDocumentSqlExecutor;

  constructor(executor: NoteDocumentSqlExecutor) {
    this.executor = executor;
  }

  async listNotes(input: NoteListRequest): Promise<NoteListResult> {
    const inputErrors = validateNoteListRequest(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    try {
      const rows = await this.executor.query(mapNoteListToSql(input));
      return mapRowsToNoteList(rows, input);
    } catch (error) {
      return { ok: false, errors: [toSqlErrorMessage('note list SQL load failed', error)] };
    }
  }
}

export function mapNoteListToSql(input: NoteListRequest): NoteDocumentSqlStatement {
  return {
    sql: [
      'select id, workspace_id, title, description_effective, created_at, updated_at',
      'from notes',
      'where workspace_id = ?',
      'order by updated_at desc, id asc',
    ].join(' '),
    args: [input.workspaceId],
  };
}

export function mapRowsToNoteList(
  rows: readonly Record<string, unknown>[],
  input: NoteListRequest,
): NoteListResult {
  const errors: string[] = [];
  const notes: NoteListItem[] = [];

  for (const [index, row] of rows.entries()) {
    const workspaceId = readRequiredStringColumn(row, 'workspace_id', 'workspaceId');
    if (workspaceId !== input.workspaceId) {
      errors.push(`notes[${index}].workspace_id must match requested workspaceId`);
      continue;
    }

    const note = mapRowToNoteListItem(row);
    const itemErrors = validateNoteListItem(note, index);
    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
      continue;
    }

    notes.push(note);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    notes: notes.sort(compareNoteListItems),
  };
}

function mapRowToNoteListItem(row: Record<string, unknown>): NoteListItem {
  const descriptionEffective = readOptionalStringColumn(row, 'description_effective', 'descriptionEffective');
  return {
    noteId: readRequiredStringColumn(row, 'id', 'noteId') ?? '',
    title: readRequiredStringColumn(row, 'title') ?? '',
    ...(descriptionEffective === undefined || descriptionEffective === null
      ? {}
      : { descriptionEffective }),
    createdAt: readRequiredFiniteNumberColumn(row, 'created_at', 'createdAt') ?? Number.NaN,
    updatedAt: readRequiredFiniteNumberColumn(row, 'updated_at', 'updatedAt') ?? Number.NaN,
  };
}
