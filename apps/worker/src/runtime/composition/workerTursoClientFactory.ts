import { createClient } from '@libsql/client/web';
import type { InValue } from '@libsql/client/web';

import { readTursoClient, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export interface WorkerTursoClientEnv {
  TURSO?: unknown;
  TURSO_CLIENT?: unknown;
  TURSO_DATABASE_URL?: unknown;
  TURSO_AUTH_TOKEN?: unknown;
  LIBSQL_DATABASE_URL?: unknown;
  LIBSQL_AUTH_TOKEN?: unknown;
  [key: string]: unknown;
}

export function resolveWorkerTursoClient(env: WorkerTursoClientEnv): WorkerTursoClient | undefined {
  return readTursoClient(env.TURSO)
    ?? readTursoClient(env.TURSO_CLIENT)
    ?? createWorkerTursoClientFromEnv(env);
}

export function createWorkerTursoClientFromEnv(env: WorkerTursoClientEnv): WorkerTursoClient | undefined {
  const url = readEnvString(env.TURSO_DATABASE_URL) ?? readEnvString(env.LIBSQL_DATABASE_URL);
  if (url === undefined) {
    return undefined;
  }

  const authToken = readEnvString(env.TURSO_AUTH_TOKEN) ?? readEnvString(env.LIBSQL_AUTH_TOKEN);
  const client = createClient(authToken === undefined ? { url } : { url, authToken });
  return {
    execute(statement) {
      return client.execute({
        sql: statement.sql,
        args: Array.from(statement.args) as InValue[],
      });
    },
  };
}

function readEnvString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}
