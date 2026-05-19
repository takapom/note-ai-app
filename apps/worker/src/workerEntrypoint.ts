// Worker-style fetch entrypoint for the MVP HTTP router.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/api-events.md, docs/contracts/cloudflare-agents-turso.md

import {
  createWorkerRuntimePorts,
  type WorkerTursoClient,
} from './workerRuntimePorts.ts';
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
  type WorkerAuthBoundaryResult,
  type WorkerAuthBoundaryEnv,
  type WorkerAuthVerifier,
} from './workerAuthBoundary.ts';

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

export interface WorkerFetchHandlerOptions<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv> {
  authenticateRequest?: WorkerAuthVerifier<Env>;
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
    const entrypointContext: WorkerRuntimeContext<Env> = {
      ...(context ?? {}),
    };
    const resolvedNow = context?.now ?? options.now?.();
    if (resolvedNow !== undefined) {
      entrypointContext.now = resolvedNow;
    }
    if (options.authenticateRequest !== undefined) {
      entrypointContext.authenticateRequest = options.authenticateRequest;
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
  context?: WorkerRuntimeContext<Env>,
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

export async function parseWorkerRequest<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv>(
  request: Request,
  env: Env = {} as Env,
  context: WorkerRuntimeContext<Env> = {},
): Promise<WorkerRequestParseResult> {
  const authResult = await authenticateWorkerRequest({ request, env, context });
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

export type WorkerRuntimeContext<Env extends WorkerEntrypointEnv = WorkerEntrypointEnv> =
  WorkerEntrypointContext & {
    authenticateRequest?: WorkerAuthVerifier<Env>;
    createPorts?: WorkerPortsFactory<Env>;
  };

async function authenticateWorkerRequest<Env extends WorkerEntrypointEnv>(input: {
  request: Request;
  env: Env;
  context: WorkerRuntimeContext<Env>;
}): Promise<WorkerAuthBoundaryResult> {
  if (input.context.authenticateRequest === undefined) {
    return normalizeWorkerAuthBoundary(input);
  }

  const verified = await callAuthVerifier(input.context.authenticateRequest, {
    request: input.request,
    env: input.env,
    context: input.context,
  });
  if (!verified.ok) {
    return verified;
  }

  return normalizeWorkerAuthBoundary({
    request: input.request,
    env: input.env,
    context: input.context,
    verifiedIdentity: verified.identity,
  });
}

async function callAuthVerifier<Env extends WorkerEntrypointEnv>(
  authenticateRequest: WorkerAuthVerifier<Env>,
  input: Parameters<WorkerAuthVerifier<Env>>[0],
): Promise<WorkerAuthBoundaryResult> {
  try {
    const result: unknown = await authenticateRequest(input);
    return isWorkerAuthBoundaryResult(result)
      ? result
      : invalidAuthResult();
  } catch {
    return invalidAuthResult();
  }
}

function invalidAuthResult(): WorkerAuthBoundaryResult {
  return {
    ok: false,
    status: 401,
    errors: ['worker auth credentials are invalid'],
  };
}

function isWorkerAuthBoundaryResult(value: unknown): value is WorkerAuthBoundaryResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false;
  }
  if (value.ok) {
    return (
      isRecord(value.identity) &&
      typeof value.identity.workspaceId === 'string' &&
      (
        value.identity.userId === undefined ||
        typeof value.identity.userId === 'string'
      )
    );
  }
  return (
    (value.status === 400 || value.status === 401) &&
    Array.isArray(value.errors) &&
    value.errors.every((error) => typeof error === 'string')
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
