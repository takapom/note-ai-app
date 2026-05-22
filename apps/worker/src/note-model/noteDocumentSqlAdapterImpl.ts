// SQL adapter for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/data-model.md

import type { NoteDocumentContract } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import {
  type NoteDocumentLoadRequest,
  type NoteDocumentLoadResult,
  type NoteDocumentPersistencePort,
  type NoteDocumentSaveResult,
  validateLoadRequest,
  validateNoteDocumentForPersistence,
} from './noteDocumentPersistencePort.ts';
import { mapBlocksLookupToSql, mapNoteDocumentToSql, mapNoteLookupToSql, mapSectionsLookupToSql } from './noteDocumentSqlLookups.ts';
import { toSqlErrorMessage } from './noteDocumentSqlReaders.ts';
import { mapRowsToNoteDocument } from './noteDocumentSqlRowMapping.ts';
import type { NoteDocumentSqlExecutor } from './noteDocumentSqlTypes.ts';

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
