// Worker entrypoint env shape shared across HTTP and Cloudflare runtime boundaries.
// Authority: docs/contracts/backend-runtime.md

import type { CloudflareDurableObjectNamespaceLike } from '../cloudflare/cloudflareAgentRpcBoundary.ts';
import type { WorkerAuthBoundaryEnv } from '../http/workerAuthBoundary.ts';
import type { WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export interface WorkerEntrypointEnv extends WorkerAuthBoundaryEnv {
  WORKSPACE_ID?: string;
  USER_ID?: string;
  WORKER_AUTH_SHARED_SECRET?: string;
  AUTH_SHARED_SECRET?: string;
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  NOTE_AGENT?: CloudflareDurableObjectNamespaceLike;
  WORKSPACE_BRAIN_AGENT?: CloudflareDurableObjectNamespaceLike;
  LOCAL_AGENT_SMOKE_ENABLED?: string;
  [key: string]: unknown;
}
