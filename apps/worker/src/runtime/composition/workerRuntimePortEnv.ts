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
  LOCAL_AGENT_SMOKE_ENABLED?: string;
  WORKER_SMOKE_NOTE_ID?: string;
  WORKER_SMOKE_BLOCK_ID?: string;
  WORKER_LOCAL_MODEL_PROTOCOL?: string;
  WORKER_LOCAL_MODEL_PROVIDER?: string;
  WORKER_LOCAL_MODEL_NAME?: string;
  WORKER_LOCAL_MODEL_BASE_URL?: string;
  WORKER_LOCAL_MODEL_ENDPOINT?: string;
  WORKER_LOCAL_MODEL_API_KEY?: string;
  WORKER_LOCAL_MODEL_TIMEOUT_MS?: string;
  LOCAL_MODEL_PROTOCOL?: string;
  LOCAL_MODEL_PROVIDER?: string;
  LOCAL_MODEL_NAME?: string;
  LOCAL_MODEL_BASE_URL?: string;
  LOCAL_MODEL_ENDPOINT?: string;
  LOCAL_MODEL_API_KEY?: string;
  LOCAL_MODEL_TIMEOUT_MS?: string;
  OLLAMA_HOST?: string;
  OLLAMA_MODEL?: string;
  [key: string]: unknown;
}
