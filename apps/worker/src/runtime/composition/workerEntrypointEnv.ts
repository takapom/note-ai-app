// Worker entrypoint env shape shared across HTTP and Cloudflare runtime boundaries.
// Authority: docs/contracts/backend-runtime.md

import type { CloudflareDurableObjectNamespaceLike } from '../cloudflare/cloudflareAgentRpcBoundary.ts';
import type { WorkerAuthBoundaryEnv } from '../http/workerAuthBoundary.ts';
import type { WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export interface WorkerEntrypointEnv extends WorkerAuthBoundaryEnv {
  WORKSPACE_ID?: string;
  USER_ID?: string;
  NOTE_ID?: string;
  WORKER_AUTH_SHARED_SECRET?: string;
  AUTH_SHARED_SECRET?: string;
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  LIBSQL_DATABASE_URL?: string;
  LIBSQL_AUTH_TOKEN?: string;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  NOTE_AGENT?: CloudflareDurableObjectNamespaceLike;
  WORKSPACE_BRAIN_AGENT?: CloudflareDurableObjectNamespaceLike;
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
