// Facade for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/data-model.md

export type { NoteDocumentSqlExecutor, NoteDocumentSqlStatement } from './noteDocumentSqlTypes.ts';
export { TursoNoteDocumentPersistenceAdapter } from './noteDocumentSqlAdapterImpl.ts';
export { mapBlocksLookupToSql, mapNoteDocumentToSql, mapNoteLookupToSql, mapSectionsLookupToSql } from './noteDocumentSqlLookups.ts';
export { mapRowsToNoteDocument } from './noteDocumentSqlRowMapping.ts';
