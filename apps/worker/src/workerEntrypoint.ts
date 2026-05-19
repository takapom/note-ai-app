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
  type OperationProposalSqlStatement,
  TursoOperationProposalSqlAdapter,
} from './operationProposalSqlAdapter.ts';
import {
  handleWorkerHttpRequest,
  matchWorkerRoute,
  type WorkerHttpRequest,
  type WorkerHttpResponse,
  type WorkerHttpRouterPorts,
} from './workerHttpRouter.ts';

type WorkerSqlStatement =
  | NoteDocumentSqlStatement
  | SchedulerAgentLocalSqlStatement
  | SchedulerNoteSnapshotSqlStatement
  | OperationProposalSqlStatement
  | {
      sql: string;
      args: readonly unknown[];
    };

export interface WorkerEntrypointEnv {
  WORKSPACE_ID?: string;
  USER_ID?: string;
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  [key: string]: unknown;
}

export interface WorkerEntrypointContext {
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
    const entrypointContext: WorkerEntrypointContext & { createPorts?: WorkerPortsFactory<Env> } = {};
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
  const parsed = await parseWorkerRequest(request, env, context?.now === undefined ? {} : { now: context.now });
  if (!parsed.ok) {
    return toFetchResponse(parsed.response);
  }

  if (matchWorkerRoute(parsed.request.method, parsed.request.path) === undefined) {
    return toFetchResponse(await handleWorkerHttpRequest(parsed.request, {}));
  }

  if (!isStableRuntimeId(parsed.request.workspaceId)) {
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
  const workspaceId = firstHeaderValue(request.headers, 'x-workspace-id') ?? readEnvString(env.WORKSPACE_ID) ?? '';
  const userId = firstHeaderValue(request.headers, 'x-user-id') ?? readEnvString(env.USER_ID);
  const workerRequest: WorkerHttpRequest = {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    workspaceId,
    now: context.now ?? Date.now(),
    ...(userId === undefined ? {} : { userId }),
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
  const operationApproval = tursoExecutor === undefined
    ? undefined
    : new TursoOperationProposalSqlAdapter({ executor: tursoExecutor });
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
    ...(operationApproval === undefined ? {} : { operationApproval }),
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

function firstHeaderValue(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function readEnvString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readTursoClient(value: unknown): WorkerTursoClient | undefined {
  return isRecord(value) && typeof value.execute === 'function'
    ? value as unknown as WorkerTursoClient
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}
