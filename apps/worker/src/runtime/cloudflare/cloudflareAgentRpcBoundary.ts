// Worker-side Durable Object namespace/RPC boundary helpers.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md

import {
  NOTE_AGENT_DEPLOYMENT_BINDING,
  WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
  type CloudflareAgentDeploymentBinding,
} from './cloudflareAgentBindings.ts';
import type {
  NoteLeaveCause,
  NoteStructureRouteKind,
} from './noteStructureRouteRpcTypes.ts';
import {
  NOTE_AGENT_COMMAND_KEYS,
  WORKSPACE_BRAIN_COMMAND_KEYS,
  isRecord,
  validateNoteAgentScheduleStructureCommand,
  validateRequiredTrimmedString,
  validateSerializableRpcCommand,
  validateWorkspaceBrainProcessNextQueuedStructureJobCommand,
} from './cloudflareAgentRpcValidation.ts';

export const NOTE_AGENT_SCHEDULE_STRUCTURE_RPC_METHOD = 'scheduleNoteStructure';
export const WORKSPACE_BRAIN_PROCESS_NEXT_QUEUED_STRUCTURE_JOB_RPC_METHOD =
  'processNextQueuedStructureJob';

export interface NoteAgentScheduleStructureRpcCommand {
  workspaceId: string;
  noteId: string;
  route: NoteStructureRouteKind;
  cause?: NoteLeaveCause;
  now: number;
}

export interface WorkspaceBrainProcessNextQueuedStructureJobRpcCommand {
  workspaceId: string;
  userId: string;
  now: number;
}

export interface CloudflareAgentDurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): unknown;
}

export type CloudflareDurableObjectNamespaceLike = CloudflareAgentDurableObjectNamespaceLike;

export type CloudflareAgentRpcFailureReason =
  | 'agent_namespace_missing'
  | 'agent_namespace_invalid'
  | 'agent_object_name_invalid'
  | 'agent_object_resolution_failed'
  | 'agent_rpc_method_missing'
  | 'agent_rpc_command_invalid'
  | 'agent_rpc_invocation_failed';

export interface CloudflareAgentRpcFailure {
  ok: false;
  reason: CloudflareAgentRpcFailureReason;
  binding: CloudflareAgentDeploymentBinding;
  errors: string[];
  objectName?: string;
  methodName?: string;
}

export interface CloudflareAgentRpcSuccess<Result> {
  ok: true;
  binding: CloudflareAgentDeploymentBinding;
  objectName: string;
  methodName: string;
  result: Result;
}

export type CloudflareAgentRpcResult<Result> =
  | CloudflareAgentRpcSuccess<Result>
  | CloudflareAgentRpcFailure;

export type CloudflareAgentNamespaceReadResult =
  | {
      ok: true;
      binding: CloudflareAgentDeploymentBinding;
      namespace: CloudflareAgentDurableObjectNamespaceLike;
    }
  | CloudflareAgentRpcFailure;

export type CloudflareAgentObjectNameResult =
  | { ok: true; objectName: string }
  | { ok: false; errors: string[] };

export interface CloudflareAgentRpcInvocationInput {
  env: unknown;
  binding: CloudflareAgentDeploymentBinding;
  objectName: string;
  methodName: string;
  command: unknown;
  allowedCommandKeys: readonly string[];
}

export function createNoteAgentObjectName(input: {
  workspaceId: unknown;
  noteId: unknown;
}): CloudflareAgentObjectNameResult {
  const errors: string[] = [];
  validateRequiredTrimmedString(input.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(input.noteId, 'noteId', errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const workspaceId = input.workspaceId as string;
  const noteId = input.noteId as string;

  return {
    ok: true,
    objectName: `${workspaceId}:${noteId}`,
  };
}

export function createWorkspaceBrainAgentObjectName(input: {
  workspaceId: unknown;
}): CloudflareAgentObjectNameResult {
  const errors: string[] = [];
  validateRequiredTrimmedString(input.workspaceId, 'workspaceId', errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const workspaceId = input.workspaceId as string;

  return {
    ok: true,
    objectName: workspaceId,
  };
}

export function readNoteAgentNamespace(env: unknown): CloudflareAgentNamespaceReadResult {
  return readCloudflareAgentNamespace(env, NOTE_AGENT_DEPLOYMENT_BINDING);
}

export function readWorkspaceBrainAgentNamespace(env: unknown): CloudflareAgentNamespaceReadResult {
  return readCloudflareAgentNamespace(env, WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING);
}

export function readDurableObjectNamespace(
  value: unknown,
): CloudflareAgentDurableObjectNamespaceLike | undefined {
  return isDurableObjectNamespaceLike(value) ? value : undefined;
}

export function readCloudflareAgentNamespace(
  env: unknown,
  binding: CloudflareAgentDeploymentBinding,
): CloudflareAgentNamespaceReadResult {
  if (!isRecord(env) || env[binding] === undefined) {
    return rpcFailure({
      reason: 'agent_namespace_missing',
      binding,
      errors: [`${binding} Durable Object namespace is not configured`],
    });
  }

  const namespace = env[binding];
  if (!isDurableObjectNamespaceLike(namespace)) {
    return rpcFailure({
      reason: 'agent_namespace_invalid',
      binding,
      errors: [`${binding} Durable Object namespace is invalid`],
    });
  }

  return {
    ok: true,
    binding,
    namespace,
  };
}

export async function invokeNoteAgentScheduleStructureRpc<Result = any>(input: {
  env: unknown;
  command: NoteAgentScheduleStructureRpcCommand;
}): Promise<CloudflareAgentRpcResult<Result>> {
  const objectName = createNoteAgentObjectName(input.command);
  if (!objectName.ok) {
    return rpcFailure({
      reason: 'agent_object_name_invalid',
      binding: NOTE_AGENT_DEPLOYMENT_BINDING,
      errors: objectName.errors,
    });
  }

  const commandErrors = validateNoteAgentScheduleStructureCommand(input.command);
  if (commandErrors.length > 0) {
    return rpcFailure({
      reason: 'agent_rpc_command_invalid',
      binding: NOTE_AGENT_DEPLOYMENT_BINDING,
      objectName: objectName.objectName,
      methodName: NOTE_AGENT_SCHEDULE_STRUCTURE_RPC_METHOD,
      errors: commandErrors,
    });
  }

  return invokeSerializableAgentRpc<Result>({
    env: input.env,
    binding: NOTE_AGENT_DEPLOYMENT_BINDING,
    objectName: objectName.objectName,
    methodName: NOTE_AGENT_SCHEDULE_STRUCTURE_RPC_METHOD,
    command: input.command,
    allowedCommandKeys: NOTE_AGENT_COMMAND_KEYS,
  });
}

export async function scheduleNoteStructureThroughAgent<Result = any>(input: {
  namespace: CloudflareDurableObjectNamespaceLike;
  command: NoteAgentScheduleStructureRpcCommand;
}): Promise<CloudflareAgentRpcResult<Result>> {
  return invokeNoteAgentScheduleStructureRpc<Result>({
    env: { [NOTE_AGENT_DEPLOYMENT_BINDING]: input.namespace },
    command: input.command,
  });
}

export async function invokeWorkspaceBrainProcessNextQueuedStructureJobRpc<Result = any>(input: {
  env: unknown;
  command: WorkspaceBrainProcessNextQueuedStructureJobRpcCommand;
}): Promise<CloudflareAgentRpcResult<Result>> {
  const objectName = createWorkspaceBrainAgentObjectName(input.command);
  if (!objectName.ok) {
    return rpcFailure({
      reason: 'agent_object_name_invalid',
      binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
      errors: objectName.errors,
    });
  }

  const commandErrors = validateWorkspaceBrainProcessNextQueuedStructureJobCommand(input.command);
  if (commandErrors.length > 0) {
    return rpcFailure({
      reason: 'agent_rpc_command_invalid',
      binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
      objectName: objectName.objectName,
      methodName: WORKSPACE_BRAIN_PROCESS_NEXT_QUEUED_STRUCTURE_JOB_RPC_METHOD,
      errors: commandErrors,
    });
  }

  return invokeSerializableAgentRpc<Result>({
    env: input.env,
    binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
    objectName: objectName.objectName,
    methodName: WORKSPACE_BRAIN_PROCESS_NEXT_QUEUED_STRUCTURE_JOB_RPC_METHOD,
    command: input.command,
    allowedCommandKeys: WORKSPACE_BRAIN_COMMAND_KEYS,
  });
}

export async function processWorkspaceBrainThroughAgent<Result = any>(input: {
  namespace: CloudflareDurableObjectNamespaceLike;
  command: WorkspaceBrainProcessNextQueuedStructureJobRpcCommand;
}): Promise<CloudflareAgentRpcResult<Result>> {
  return invokeWorkspaceBrainProcessNextQueuedStructureJobRpc<Result>({
    env: { [WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING]: input.namespace },
    command: input.command,
  });
}

export async function invokeSerializableAgentRpc<Result = any>(
  input: CloudflareAgentRpcInvocationInput,
): Promise<CloudflareAgentRpcResult<Result>> {
  const commandErrors = validateSerializableRpcCommand(input.command, input.allowedCommandKeys);
  if (commandErrors.length > 0) {
    return rpcFailure({
      reason: 'agent_rpc_command_invalid',
      binding: input.binding,
      objectName: input.objectName,
      methodName: input.methodName,
      errors: commandErrors,
    });
  }

  const namespace = readCloudflareAgentNamespace(input.env, input.binding);
  if (!namespace.ok) {
    return namespace;
  }

  let stub: unknown;
  try {
    const id = namespace.namespace.idFromName(input.objectName);
    stub = namespace.namespace.get(id);
  } catch (error) {
    void error;
    return rpcFailure({
      reason: 'agent_object_resolution_failed',
      binding: input.binding,
      objectName: input.objectName,
      methodName: input.methodName,
      errors: [`${input.binding} Durable Object instance could not be resolved`],
    });
  }

  if (!isRecord(stub) || typeof stub[input.methodName] !== 'function') {
    return rpcFailure({
      reason: 'agent_rpc_method_missing',
      binding: input.binding,
      objectName: input.objectName,
      methodName: input.methodName,
      errors: [`${input.methodName} RPC method is not available on ${input.binding}`],
    });
  }

  try {
    const result = await (stub as Record<string, (command: unknown) => Result | Promise<Result>>)[input.methodName](
      input.command,
    );
    return {
      ok: true,
      binding: input.binding,
      objectName: input.objectName,
      methodName: input.methodName,
      result,
    };
  } catch (error) {
    void error;
    return rpcFailure({
      reason: 'agent_rpc_invocation_failed',
      binding: input.binding,
      objectName: input.objectName,
      methodName: input.methodName,
      errors: [`${input.binding} agent RPC invocation failed`],
    });
  }
}

function rpcFailure(input: {
  reason: CloudflareAgentRpcFailureReason;
  binding: CloudflareAgentDeploymentBinding;
  errors: readonly string[];
  objectName?: string;
  methodName?: string;
}): CloudflareAgentRpcFailure {
  return {
    ok: false,
    reason: input.reason,
    binding: input.binding,
    errors: [...input.errors],
    ...(input.objectName === undefined ? {} : { objectName: input.objectName }),
    ...(input.methodName === undefined ? {} : { methodName: input.methodName }),
  };
}

function isDurableObjectNamespaceLike(
  value: unknown,
): value is CloudflareAgentDurableObjectNamespaceLike {
  return isRecord(value) &&
    typeof value.idFromName === 'function' &&
    typeof value.get === 'function';
}
