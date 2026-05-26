// WorkspaceBrain enqueue RPC boundary helpers.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/backend-runtime.md

import {
  WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
  type CloudflareAgentDeploymentBinding,
} from './cloudflareAgentBindings.ts';
import {
  createWorkspaceBrainAgentObjectName,
  invokeSerializableAgentRpc,
  type CloudflareAgentRpcFailure,
  type CloudflareAgentRpcFailureReason,
  type CloudflareAgentRpcResult,
  type CloudflareDurableObjectNamespaceLike,
} from './cloudflareAgentRpcBoundary.ts';

export const WORKSPACE_BRAIN_ENQUEUE_STRUCTURE_JOBS_RPC_METHOD = 'enqueueStructureJobs';

export interface WorkspaceBrainEnqueueStructureJobsRpcCommand {
  workspaceId: string;
  userId: string;
  now: number;
  structureJobs: readonly unknown[];
}

const WORKSPACE_BRAIN_ENQUEUE_STRUCTURE_JOBS_COMMAND_KEYS = Object.freeze([
  'workspaceId',
  'userId',
  'now',
  'structureJobs',
]);

export async function invokeWorkspaceBrainEnqueueStructureJobsRpc<Result = unknown>(input: {
  env: unknown;
  command: WorkspaceBrainEnqueueStructureJobsRpcCommand;
}): Promise<CloudflareAgentRpcResult<Result>> {
  const objectName = createWorkspaceBrainAgentObjectName(input.command);
  if (!objectName.ok) {
    return rpcFailure({
      reason: 'agent_object_name_invalid',
      binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
      errors: objectName.errors,
    });
  }

  const commandErrors = validateWorkspaceBrainEnqueueStructureJobsCommand(input.command);
  if (commandErrors.length > 0) {
    return rpcFailure({
      reason: 'agent_rpc_command_invalid',
      binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
      objectName: objectName.objectName,
      methodName: WORKSPACE_BRAIN_ENQUEUE_STRUCTURE_JOBS_RPC_METHOD,
      errors: commandErrors,
    });
  }

  return invokeSerializableAgentRpc<Result>({
    env: input.env,
    binding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
    objectName: objectName.objectName,
    methodName: WORKSPACE_BRAIN_ENQUEUE_STRUCTURE_JOBS_RPC_METHOD,
    command: input.command,
    allowedCommandKeys: WORKSPACE_BRAIN_ENQUEUE_STRUCTURE_JOBS_COMMAND_KEYS,
  });
}

export async function enqueueStructureJobsThroughWorkspaceBrain<Result = unknown>(input: {
  namespace: CloudflareDurableObjectNamespaceLike;
  command: WorkspaceBrainEnqueueStructureJobsRpcCommand;
}): Promise<CloudflareAgentRpcResult<Result>> {
  return invokeWorkspaceBrainEnqueueStructureJobsRpc<Result>({
    env: { [WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING]: input.namespace },
    command: input.command,
  });
}

export function validateWorkspaceBrainEnqueueStructureJobsCommand(
  command: unknown,
): string[] {
  const errors = validateSerializableRpcCommand(command, WORKSPACE_BRAIN_ENQUEUE_STRUCTURE_JOBS_COMMAND_KEYS);
  if (!isRecord(command)) {
    return errors;
  }

  validateRequiredTrimmedString(command.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(command.userId, 'userId', errors);
  validateFiniteNumber(command.now, 'now', errors);
  if (!Array.isArray(command.structureJobs)) {
    errors.push('structureJobs must be an array');
    return errors;
  }

  for (const [index, job] of command.structureJobs.entries()) {
    if (!isRecord(job)) {
      errors.push(`structureJobs[${index}] must be an object`);
      continue;
    }
    validateRequiredTrimmedString(job.id, `structureJobs[${index}].id`, errors);
    validateRequiredTrimmedString(job.workspaceId, `structureJobs[${index}].workspaceId`, errors);
    if (typeof command.workspaceId === 'string' && job.workspaceId !== command.workspaceId) {
      errors.push(`structureJobs[${index}].workspaceId must match workspaceId`);
    }
    if (job.status !== 'queued') {
      errors.push(`structureJobs[${index}].status must be queued`);
    }
  }

  return errors;
}

function validateSerializableRpcCommand(
  command: unknown,
  allowedKeys: readonly string[],
): string[] {
  if (!isRecord(command)) {
    return ['agent RPC command must be a serializable object'];
  }

  const errors: string[] = [];
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(command)) {
    if (!allowed.has(key)) {
      errors.push(`${key} is not an allowed RPC command field`);
    }
  }
  validateSerializableValue(command, 'command', errors);
  return errors;
}

function validateSerializableValue(value: unknown, path: string, errors: string[]): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(`${path} must not contain non-finite numbers`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSerializableValue(item, `${path}.${index}`, errors));
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      validateSerializableValue(child, `${path}.${key}`, errors);
    }
    return;
  }

  errors.push(`${path} must contain only serializable values`);
}

function validateRequiredTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed`);
  }
}

function validateFiniteNumber(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
