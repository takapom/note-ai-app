import type { NoteDocumentSqlStatement } from '../../note-model/noteDocumentSqlAdapter.ts';

export interface WorkerTursoClient {
  execute(statement: { sql: string; args: readonly unknown[] }): Promise<unknown>;
}

export class WorkerTursoSqlExecutor {
  private readonly client: WorkerTursoClient;

  constructor(client: WorkerTursoClient) {
    this.client = client;
  }

  async execute(statement: { sql: string; args: readonly unknown[] }): Promise<unknown> {
    return this.client.execute({
      sql: statement.sql,
      args: statement.args,
    });
  }

  async query(statement: { sql: string; args: readonly unknown[] }): Promise<readonly Record<string, unknown>[]> {
    const result = await this.execute(statement);
    return readRows(result);
  }

  async write(statement: { sql: string; args: readonly unknown[] }): Promise<void | { rowsAffected?: number; changes?: number }> {
    const result = await this.execute(statement);
    if (!isRecord(result)) {
      return undefined;
    }
    return {
      ...(typeof result.rowsAffected === 'number' ? { rowsAffected: result.rowsAffected } : {}),
      ...(typeof result.changes === 'number' ? { changes: result.changes } : {}),
    };
  }

  async writeNoteDocument(statements: readonly NoteDocumentSqlStatement[]): Promise<void> {
    if (statements.length === 0) {
      throw new Error('note document SQL statements must not be empty');
    }

    for (const statement of statements) {
      await this.execute(statement);
    }
  }
}

function readRows(result: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.filter(isRecord);
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result.rows.filter(isRecord);
  }
  if (isRecord(result) && Array.isArray(result.results)) {
    return result.results.filter(isRecord);
  }
  return [];
}

export function readTursoClient(value: unknown): WorkerTursoClient | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof (value as { execute?: unknown }).execute === 'function'
    ? value as WorkerTursoClient
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
