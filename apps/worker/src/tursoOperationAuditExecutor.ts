// Turso/libSQL executor for operation audit SQL statements.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/data-model.md

import type {
  OperationAuditSqlExecutor,
  OperationAuditSqlStatement,
} from './operationAuditSqlAdapter.ts';

export interface TursoOperationAuditClient {
  execute(statement: { sql: string; args: readonly unknown[] }): Promise<unknown>;
}

// This executor preserves statement order and propagates the first client failure.
// It does not promise rollback for statements already accepted by the client.
export class TursoOperationAuditExecutor implements OperationAuditSqlExecutor {
  private readonly client: TursoOperationAuditClient;

  constructor(client: TursoOperationAuditClient) {
    this.client = client;
  }

  async writeOperationAudit(statements: readonly OperationAuditSqlStatement[]): Promise<void> {
    const errors = validateOperationAuditStatements(statements);
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    for (const statement of statements) {
      await this.client.execute({
        sql: statement.sql,
        args: statement.args,
      });
    }
  }
}

export function validateOperationAuditStatements(
  statements: readonly OperationAuditSqlStatement[] | unknown,
): string[] {
  if (!Array.isArray(statements)) {
    return ['operation audit SQL statements must be an array'];
  }

  if (statements.length === 0) {
    return ['operation audit SQL statements must not be empty'];
  }

  const errors: string[] = [];
  for (const [index, statement] of statements.entries()) {
    if (!isRecord(statement)) {
      errors.push(`operation audit SQL statements[${index}] must be an object`);
      continue;
    }

    if (typeof statement.sql !== 'string' || statement.sql.trim().length === 0) {
      errors.push(`operation audit SQL statements[${index}].sql must be a non-empty string`);
    }

    if (!Array.isArray(statement.args)) {
      errors.push(`operation audit SQL statements[${index}].args must be an array`);
    }
  }

  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
