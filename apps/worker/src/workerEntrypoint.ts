// Worker-style fetch entrypoint for the MVP HTTP router.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/api-events.md, docs/contracts/cloudflare-agents-turso.md

import { AgentLocalNextOpenDigestReadAdapter } from './nextOpenDigestReadPort.ts';
import { NoteDocumentBlockCommandPort } from './noteBlockCommandPort.ts';
import {
  type NoteDocumentSqlStatement,
  TursoNoteDocumentPersistenceAdapter,
} from './noteDocumentSqlAdapter.ts';
import {
  AgentLocalBlockChangedPersistenceAdapter,
  AgentLocalNextOpenDigestPreparationAdapter,
  AgentLocalStructureJobQueueAdapter,
  type SchedulerAgentLocalSqlStatement,
} from './schedulerAgentLocalSqlAdapter.ts';
import {
  type SchedulerNoteSnapshotSqlStatement,
  TursoSchedulerNoteSnapshotAdapter,
} from './schedulerNoteSnapshotSqlAdapter.ts';
import { TursoMemoryReviewSqlAdapter } from './memoryReviewPort.ts';
import {
  type MemoryCandidateSqlStatement,
  TursoMemoryCandidatePersistenceAdapter,
} from './memoryCandidateProposalBoundary.ts';
import {
  type OperationProposalSqlStatement,
  TursoOperationProposalSqlAdapter,
} from './operationProposalSqlAdapter.ts';
import {
  type ProvenanceLookupSqlStatement,
  TursoProvenanceLookupSqlAdapter,
} from './provenanceLookupPort.ts';
import {
  handleWorkerHttpRequest,
  matchWorkerRoute,
  type WorkerHttpRequest,
  type WorkerHttpResponse,
  type WorkerHttpRouterPorts,
} from './workerHttpRouter.ts';
import {
  normalizeWorkerAuthBoundary,
  type WorkerAuthBoundaryContext,
  type WorkerAuthBoundaryEnv,
} from './workerAuthBoundary.ts';

type WorkerSqlStatement =
  | NoteDocumentSqlStatement
  | SchedulerAgentLocalSqlStatement
  | SchedulerNoteSnapshotSqlStatement
  | MemoryCandidateSqlStatement
  | OperationProposalSqlStatement
  | ProvenanceLookupSqlStatement
  | {
      sql: string;
      args: readonly unknown[];
    };

export interface WorkerEntrypointEnv extends WorkerAuthBoundaryEnv {
  WORKSPACE_ID?: string;
  USER_ID?: string;
  WORKER_AUTH_SHARED_SECRET?: string;
  AUTH_SHARED_SECRET?: string;
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  [key: string]: unknown;
}

export interface WorkerEntrypointContext extends WorkerAuthBoundaryContext {
  now?: number;
}

export interface WorkerTursoClient {
  execute(statement: { sql: string; args: readonly unknown[] }): Promise<unknown>;
}

export interface WorkerFetchHandlerOptions<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv> {
  createPorts?: WorkerPortsFactory<Env>;
  now?: () => number;
}

export type WorkerPortsFactory<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv> = (input: {
  request: WorkerHttpRequest;
  env: Env;
  context?: WorkerEntrypointContext;
}) => WorkerHttpRouterPorts | Promise<WorkerHttpRouterPorts>;

export type WorkerRequestParseResult =
  | { ok: true; request: WorkerHttpRequest }
  | { ok: false; response: WorkerHttpResponse };

export function createWorkerFetchHandler<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv>(
  options: WorkerFetchHandlerOptions<Env> = {},
): (request: Request, env: Env, context?: WorkerEntrypointContext) => Promise<Response> {
  return async (request, env, context) => {
    const entrypointContext: WorkerEntrypointContext & { createPorts?: WorkerPortsFactory<Env> } = {
      ...(context ?? {}),
    };
    const resolvedNow = context?.now ?? options.now?.();
    if (resolvedNow !== undefined) {
      entrypointContext.now = resolvedNow;
    }
    if (options.createPorts !== undefined) {
      entrypointContext.createPorts = options.createPorts;
    }

    return handleWorkerFetch(request, env, entrypointContext);
  };
}

export async function handleWorkerFetch<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv>(
  request: Request,
  env: Env,
  context?: WorkerEntrypointContext & { createPorts?: WorkerPortsFactory<Env> },
): Promise<Response> {
  const parsed = await parseWorkerRequest(request, env, context);
  if (!parsed.ok) {
    return toFetchResponse(parsed.response);
  }

  if (matchWorkerRoute(parsed.request.method, parsed.request.path) === undefined) {
    return toFetchResponse(await handleWorkerHttpRequest(parsed.request, {}));
  }

  const createPorts = context?.createPorts ?? createWorkerRuntimePorts;
  const ports = await createPorts({
    request: parsed.request,
    env,
    ...(context === undefined ? {} : { context }),
  });
  return toFetchResponse(await handleWorkerHttpRequest(parsed.request, ports));
}

export async function parseWorkerRequest(
  request: Request,
  env: WorkerEntrypointEnv = {},
  context: WorkerEntrypointContext = {},
): Promise<WorkerRequestParseResult> {
  const authResult = normalizeWorkerAuthBoundary({ request, env, context });
  if (!authResult.ok) {
    return {
      ok: false,
      response: {
        status: authResult.status,
        body: { ok: false, errors: authResult.errors },
      },
    };
  }

  const bodyResult = await parseJsonBody(request);
  if (!bodyResult.ok) {
    return {
      ok: false,
      response: {
        status: 400,
        body: { ok: false, errors: ['request body must be valid JSON'] },
      },
    };
  }

  const url = new URL(request.url);
  const workerRequest: WorkerHttpRequest = {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    workspaceId: authResult.identity.workspaceId,
    now: context.now ?? Date.now(),
    ...(authResult.identity.userId === undefined ? {} : { userId: authResult.identity.userId }),
    ...(bodyResult.body === undefined ? {} : { body: bodyResult.body }),
  };

  return { ok: true, request: workerRequest };
}

export function createWorkerRuntimePorts(input: {
  env: WorkerEntrypointEnv;
}): WorkerHttpRouterPorts {
  const tursoClient = readTursoClient(input.env.TURSO) ?? readTursoClient(input.env.TURSO_CLIENT);
  const agentLocalClient = readTursoClient(input.env.AGENT_LOCAL_SQL);
  const tursoExecutor = tursoClient === undefined ? undefined : new WorkerTursoSqlExecutor(tursoClient);
  const agentLocalExecutor = agentLocalClient === undefined ? undefined : new WorkerTursoSqlExecutor(agentLocalClient);

  const noteDocument = tursoExecutor === undefined
    ? undefined
    : new TursoNoteDocumentPersistenceAdapter(tursoExecutor);
  const noteBlocks = noteDocument === undefined
    ? undefined
    : new NoteDocumentBlockCommandPort(noteDocument);
  const digestRead = agentLocalExecutor === undefined
    ? undefined
    : new AgentLocalNextOpenDigestReadAdapter(agentLocalExecutor);
  const memoryReview = tursoExecutor === undefined
    ? undefined
    : new TursoMemoryReviewSqlAdapter({ executor: tursoExecutor });
  const memoryCandidatePersistence = tursoExecutor === undefined
    ? undefined
    : new TursoMemoryCandidatePersistenceAdapter({ executor: tursoExecutor });
  const operationApproval = tursoExecutor === undefined
    ? undefined
    : new TursoOperationProposalSqlAdapter({ executor: tursoExecutor });
  const provenanceLookup = tursoExecutor === undefined
    ? undefined
    : new TursoProvenanceLookupSqlAdapter({ executor: tursoExecutor });
  const noteStructure = tursoExecutor === undefined || agentLocalExecutor === undefined
    ? undefined
    : {
        noteSnapshot: new TursoSchedulerNoteSnapshotAdapter({
          sectionExecutor: tursoExecutor,
          dirtyMarkExecutor: agentLocalExecutor,
        }),
        structureJobQueue: new AgentLocalStructureJobQueueAdapter(agentLocalExecutor),
        nextOpenDigestPreparation: new AgentLocalNextOpenDigestPreparationAdapter(agentLocalExecutor),
      };

  return {
    ...(noteDocument === undefined ? {} : { noteDocument }),
    ...(noteBlocks === undefined ? {} : { noteBlocks }),
    ...(digestRead === undefined ? {} : { digestRead }),
    ...(memoryReview === undefined ? {} : { memoryReview }),
    ...(memoryCandidatePersistence === undefined ? {} : { memoryCandidatePersistence }),
    ...(operationApproval === undefined ? {} : { operationApproval }),
    ...(provenanceLookup === undefined ? {} : { provenanceLookup }),
    ...(noteStructure === undefined ? {} : { noteStructure }),
  };
}

export class WorkerTursoSqlExecutor {
  private readonly client: WorkerTursoClient;

  constructor(client: WorkerTursoClient) {
    this.client = client;
  }

  async execute(statement: WorkerSqlStatement): Promise<unknown> {
    return this.client.execute({
      sql: statement.sql,
      args: statement.args,
    });
  }

  async query(statement: WorkerSqlStatement): Promise<readonly Record<string, unknown>[]> {
    const result = await this.execute(statement);
    return readRows(result);
  }

  async write(statement: WorkerSqlStatement): Promise<void | { rowsAffected?: number; changes?: number }> {
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

export default {
  fetch: createWorkerFetchHandler(),
};

async function parseJsonBody(request: Request): Promise<{ ok: true; body?: unknown } | { ok: false }> {
  if (request.method.toUpperCase() === 'GET' || request.method.toUpperCase() === 'HEAD') {
    return { ok: true };
  }

  const text = await request.text();
  if (text.trim().length === 0) {
    return { ok: true };
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function toFetchResponse(response: WorkerHttpResponse): Response {
  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');

  if (response.status === 204) {
    headers.delete('content-type');
    return new Response(null, {
      status: response.status,
      headers,
    });
  }

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers,
  });
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

function readTursoClient(value: unknown): WorkerTursoClient | undefined {
  return isRecord(value) && typeof value.execute === 'function'
    ? value as unknown as WorkerTursoClient
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
