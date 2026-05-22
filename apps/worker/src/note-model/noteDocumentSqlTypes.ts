// SQL types for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/data-model.md

export interface NoteDocumentSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface NoteDocumentSqlExecutor {
  query(statement: NoteDocumentSqlStatement): Promise<readonly Record<string, unknown>[]>;
  writeNoteDocument(statements: readonly NoteDocumentSqlStatement[]): Promise<void>;
}
