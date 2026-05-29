import type { WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export interface WorkerRuntimePortEnv {
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  LIBSQL_DATABASE_URL?: string;
  LIBSQL_AUTH_TOKEN?: string;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  NOTE_AGENT?: unknown;
  WORKSPACE_BRAIN_AGENT?: unknown;
  WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY?: unknown;
  WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT?: unknown;
  [key: string]: unknown;
}
