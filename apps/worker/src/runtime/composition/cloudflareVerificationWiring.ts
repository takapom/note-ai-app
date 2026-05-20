// Cloudflare Agent verification wiring for local-only HTTP surfaces.
// Authority: docs/contracts/backend-runtime.md

import {
  createNoteAgentObjectName,
  createWorkspaceBrainAgentObjectName,
  processWorkspaceBrainThroughAgent,
  invokeSerializableAgentRpc,
} from '../cloudflare/cloudflareAgentRpcBoundary.ts';
import {
  NOTE_AGENT_DEPLOYMENT_BINDING,
  WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
} from '../cloudflare/cloudflareAgentBindings.ts';
import {
  createLocalSmokeRuntimePorts,
  handleLocalSmokeRuntimeRequest,
  isLocalSmokePath,
} from '../local-verification/localSmokeRuntime.ts';

export { createLocalSmokeRuntimePorts };
import type { WorkerHttpRequest, WorkerHttpResponse } from '../http/workerHttpRouter.ts';
import type { WorkerEntrypointEnv } from './workerEntrypointEnv.ts';

export const LOCAL_WORKSPACE_BRAIN_PROCESS_PATH = '/__local/agents/workspace/process';

const AGENT_LOCAL_SCHEMA_RPC_METHOD = 'applyAgentLocalSchemaCommand';
const NOTE_AGENT_LOCAL_SMOKE_SNAPSHOT_RPC_METHOD = 'applyLocalSmokeSchedulerSnapshot';
const AGENT_LOCAL_SCHEMA_COMMAND_KEYS = Object.freeze(['action', 'purpose']);
const NOTE_AGENT_LOCAL_SMOKE_SNAPSHOT_COMMAND_KEYS = Object.freeze(['purpose', 'noteId', 'sections']);

export async function handleLocalWorkspaceBrainProcessRequest<Env extends WorkerEntrypointEnv>(
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

export async function handleLocalSmokeVerificationRequest<Env extends WorkerEntrypointEnv>(
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
  | { ok: true; localAgents: Record<string, unknown> }
  | { ok: false; status: number; errors: string[] }
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

function readStringProperty(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : undefined;
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
