import type { WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export interface WorkerRuntimePortEnv {
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  NOTE_AGENT?: unknown;
  WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY?: unknown;
  WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT?: unknown;
  [key: string]: unknown;
}
