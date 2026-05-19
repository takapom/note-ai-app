// Worker-style fetch entrypoint for the MVP HTTP router.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/api-events.md, docs/contracts/cloudflare-agents-turso.md

import {
  createWorkerRuntimePorts,
  type WorkerTursoClient,
} from './workerRuntimePorts.ts';
import {
  createNoteAgentObjectName,
  createWorkspaceBrainAgentObjectName,
  processWorkspaceBrainThroughAgent,
  invokeSerializableAgentRpc,
  type CloudflareDurableObjectNamespaceLike,
} from './cloudflareAgentRpcBoundary.ts';
import {
  NOTE_AGENT_DEPLOYMENT_BINDING,
  WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
} from './cloudflareAgentBindings.ts';
import {
  createLocalSmokeRuntimePorts,
  handleLocalSmokeRuntimeRequest,
  isLocalSmokePath,
} from './localSmokeRuntime.ts';
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
  NOTE_AGENT?: CloudflareDurableObjectNamespaceLike;
  WORKSPACE_BRAIN_AGENT?: CloudflareDurableObjectNamespaceLike;
  LOCAL_AGENT_SMOKE_ENABLED?: string;
  [key: string]: unknown;
}

export const LOCAL_WORKSPACE_BRAIN_PROCESS_PATH = '/__local/agents/workspace/process';
const AGENT_LOCAL_SCHEMA_RPC_METHOD = 'applyAgentLocalSchemaCommand';
const NOTE_AGENT_LOCAL_SMOKE_SNAPSHOT_RPC_METHOD = 'applyLocalSmokeSchedulerSnapshot';
const AGENT_LOCAL_SCHEMA_COMMAND_KEYS = Object.freeze(['action', 'purpose']);
const NOTE_AGENT_LOCAL_SMOKE_SNAPSHOT_COMMAND_KEYS = Object.freeze(['purpose', 'noteId', 'sections']);

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

  const localWorkspaceBrainResponse = await handleLocalWorkspaceBrainProcessRequest(parsed.request, env);
  if (localWorkspaceBrainResponse !== undefined) {
    return toFetchResponse(localWorkspaceBrainResponse);
  }
  if (env.LOCAL_AGENT_SMOKE_ENABLED === '1' && isLocalSmokePath(parsed.request.path)) {
    return toFetchResponse(await handleLocalSmokeVerificationRequest(parsed.request, env) ?? {
      status: 404,
      body: { ok: false, errors: ['route not found'] },
    });
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
  const localPorts = env.LOCAL_AGENT_SMOKE_ENABLED === '1'
    ? createLocalSmokeRuntimePorts(parsed.request)
    : undefined;
  return toFetchResponse(await handleWorkerHttpRequest(parsed.request, {
    ...ports,
    ...localPorts,
  }));
}

async function handleLocalWorkspaceBrainProcessRequest<Env extends WorkerEntrypointEnv>(
  request: WorkerHttpRequest,
  env: Env,
): Promise<WorkerHttpResponse | undefined> {
  if (request.path.split('?')[0] !== LOCAL_WORKSPACE_BRAIN_PROCESS_PATH) {
    return undefined;
  }
  if (env.LOCAL_AGENT_SMOKE_ENABLED !== '1') {
    return {
      status: 404,
      body: { ok: false, errors: ['route not found'] },
    };
  }
  if (request.method.toUpperCase() !== 'POST') {
    return {
      status: 405,
      body: { ok: false, errors: ['route not found'] },
    };
  }
  if (request.userId === undefined) {
    return {
      status: 400,
      body: { ok: false, errors: ['userId is required for local WorkspaceBrain process trigger'] },
    };
  }
  if (env.WORKSPACE_BRAIN_AGENT === undefined) {
    return {
      status: 501,
      body: { ok: false, errors: ['workspace brain Agent namespace is not configured'] },
    };
  }

  const result = await processWorkspaceBrainThroughAgent({
    namespace: env.WORKSPACE_BRAIN_AGENT,
    command: {
      workspaceId: request.workspaceId,
      userId: request.userId,
      now: request.now,
    },
  });
  if (!result.ok) {
    return {
      status: 502,
      body: { ok: false, reason: result.reason, errors: Array.from(result.errors) },
    };
  }

  return {
    status: 202,
    body: {
      ok: result.result.ok,
      reason: readStringProperty(result.result, 'reason') ?? 'workspace_brain_processed',
      scheduledJobIds: readStringArrayProperty(result.result, 'scheduledJobIds'),
      errors: readStringArrayProperty(result.result, 'errors'),
    },
  };
}

async function handleLocalSmokeVerificationRequest<Env extends WorkerEntrypointEnv>(
  request: WorkerHttpRequest,
  env: Env,
): Promise<WorkerHttpResponse | undefined> {
  if (!isLocalSmokePath(request.path)) {
    return undefined;
  }

  const noteIdResult = readLocalSmokeRequestNoteId(request);
  if (!noteIdResult.ok) {
    return {
      status: 400,
      body: { ok: false, errors: noteIdResult.errors },
    };
  }

  const localRuntimeResponse = await handleLocalSmokeRuntimeRequest(request);
  if (localRuntimeResponse === undefined || localRuntimeResponse.status !== 200) {
    return localRuntimeResponse;
  }

  const agentSetup = await applyLocalSmokeAgentSetup({
    request,
    env,
    noteId: noteIdResult.noteId,
    sections: readLocalSmokeSections(request),
  });
  if (!agentSetup.ok) {
    return {
      status: agentSetup.status,
      body: { ok: false, errors: agentSetup.errors },
    };
  }

  return {
    status: 200,
    body: {
      ...(isRecord(localRuntimeResponse.body) ? localRuntimeResponse.body : { ok: true }),
      localAgents: agentSetup.localAgents,
      errors: [],
    },
  };
}

async function applyLocalSmokeAgentSetup<Env extends WorkerEntrypointEnv>(input: {
  request: WorkerHttpRequest;
  env: Env;
  noteId: string;
  sections: readonly unknown[];
}): Promise<
  | {
      ok: true;
      localAgents: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      errors: string[];
    }
> {
  const noteAgentObjectName = createNoteAgentObjectName({
    workspaceId: input.request.workspaceId,
    noteId: input.noteId,
  });
  if (!noteAgentObjectName.ok) {
    return { ok: false, status: 400, errors: noteAgentObjectName.errors };
  }

  const workspaceBrainObjectName = createWorkspaceBrainAgentObjectName({
    workspaceId: input.request.workspaceId,
  });
  if (!workspaceBrainObjectName.ok) {
    return { ok: false, status: 400, errors: workspaceBrainObjectName.errors };
  }

  const noteAgentSchema = await invokeSerializableAgentRpc({
    env: { [NOTE_AGENT_DEPLOYMENT_BINDING]: input.env.NOTE_AGENT },
    binding: NOTE_AGENT_DEPLOYMENT_BINDING,
    objectName: noteAgentObjectName.objectName,
    methodName: AGENT_LOCAL_SCHEMA_RPC_METHOD,
    command: { action: 'reset', purpose: 'local_verification' },
    allowedCommandKeys: AGENT_LOCAL_SCHEMA_COMMAND_KEYS,
  });
  const noteSchemaResult = readSuccessfulLocalSmokeRpcResult(noteAgentSchema);
  if (!noteSchemaResult.ok) {
    return noteSchemaResult;
  }

  const workspaceBrainSchema = await invokeSerializableAgentRpc({
    env: { [WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING]: input.env.WORKSPACE_BRAIN_AGENT },
    binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
    objectName: workspaceBrainObjectName.objectName,
    methodName: AGENT_LOCAL_SCHEMA_RPC_METHOD,
    command: { action: 'reset', purpose: 'local_verification' },
    allowedCommandKeys: AGENT_LOCAL_SCHEMA_COMMAND_KEYS,
  });
  const workspaceSchemaResult = readSuccessfulLocalSmokeRpcResult(workspaceBrainSchema);
  if (!workspaceSchemaResult.ok) {
    return workspaceSchemaResult;
  }

  const snapshot = input.sections.length === 0
    ? undefined
    : await invokeSerializableAgentRpc({
        env: { [NOTE_AGENT_DEPLOYMENT_BINDING]: input.env.NOTE_AGENT },
        binding: NOTE_AGENT_DEPLOYMENT_BINDING,
        objectName: noteAgentObjectName.objectName,
        methodName: NOTE_AGENT_LOCAL_SMOKE_SNAPSHOT_RPC_METHOD,
        command: {
          purpose: 'local_verification',
          noteId: input.noteId,
          sections: input.sections,
        },
        allowedCommandKeys: NOTE_AGENT_LOCAL_SMOKE_SNAPSHOT_COMMAND_KEYS,
      });
  const snapshotResult = snapshot === undefined
    ? undefined
    : readSuccessfulLocalSmokeRpcResult(snapshot);
  if (snapshotResult?.ok === false) {
    return snapshotResult;
  }

  return {
    ok: true,
    localAgents: {
      noteAgentSchema: noteSchemaResult.result,
      workspaceBrainSchema: workspaceSchemaResult.result,
      ...(snapshotResult === undefined ? {} : { noteAgentSchedulerSnapshot: snapshotResult.result }),
    },
  };
}

function readSuccessfulLocalSmokeRpcResult(
  rpcResult: Awaited<ReturnType<typeof invokeSerializableAgentRpc>>,
): { ok: true; result: unknown } | { ok: false; status: number; errors: string[] } {
  if (!rpcResult.ok) {
    return {
      ok: false,
      status: rpcResult.reason === 'agent_namespace_missing' ? 501 : 502,
      errors: Array.from(rpcResult.errors),
    };
  }
  if (!isRecord(rpcResult.result) || rpcResult.result.ok !== true) {
    return {
      ok: false,
      status: 502,
      errors: readStringArrayProperty(rpcResult.result, 'errors').length === 0
        ? [`${rpcResult.methodName} local smoke RPC failed`]
        : readStringArrayProperty(rpcResult.result, 'errors'),
    };
  }

  return { ok: true, result: rpcResult.result };
}

function readLocalSmokeRequestNoteId(
  request: WorkerHttpRequest,
): { ok: true; noteId: string } | { ok: false; errors: string[] } {
  const noteId = isRecord(request.body) && typeof request.body.noteId === 'string'
    ? request.body.noteId
    : isRecord(request.body) &&
      isRecord(request.body.document) &&
      isRecord(request.body.document.note) &&
      typeof request.body.document.note.id === 'string'
      ? request.body.document.note.id
      : undefined;

  return typeof noteId === 'string' && noteId.trim().length > 0
    ? { ok: true, noteId }
    : { ok: false, errors: ['noteId must be provided for local smoke Agent setup'] };
}

function readLocalSmokeSections(request: WorkerHttpRequest): readonly unknown[] {
  return isRecord(request.body) &&
    isRecord(request.body.document) &&
    Array.isArray(request.body.document.sections)
    ? request.body.document.sections
    : [];
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

function readStringProperty(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === 'string'
    ? value[key]
    : undefined;
}

function readStringArrayProperty(value: unknown, key: string): string[] {
  return isRecord(value) &&
    Array.isArray(value[key]) &&
    value[key].every((item) => typeof item === 'string')
    ? value[key]
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
