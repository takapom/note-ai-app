// WorkspaceBrain structure-job queue dispatch composition.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/backend-runtime.md

import type { StructureJobContract } from '../../../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  AgentLocalStructureJobQueueAdapter,
  type SchedulerAgentLocalSqlExecutor,
} from '../../scheduler/schedulerAgentLocalSqlAdapter.ts';
import { validateStructureJobWorkQueueRecord } from '../../scheduler/structureJobWorkQueuePort.ts';

export interface WorkspaceBrainStructureJobsDispatchCommand {
  workspaceId: string;
  userId: string;
  now: number;
  structureJobs: readonly unknown[];
}

export interface WorkspaceBrainStructureJobsDispatchResult {
  ok: boolean;
  accepted: boolean;
  reason: string;
  scheduledJobIds: readonly string[];
  enqueuedCount: number;
  providerCalls: readonly { providerId: string; structureJobId: string }[];
  operationRoutingCalls: readonly { structureJobId: string }[];
  auditWrites: readonly { structureJobId: string; savedCount: number }[];
  noteSotMutations: [];
  errors: string[];
}

export async function enqueueWorkspaceBrainStructureJobs(input: {
  executor: SchedulerAgentLocalSqlExecutor;
  command: WorkspaceBrainStructureJobsDispatchCommand;
}): Promise<WorkspaceBrainStructureJobsDispatchResult> {
  const command = validateWorkspaceBrainStructureJobsDispatchCommand(input.command);
  if (!command.ok) {
    return dispatchResult({
      ok: false,
      accepted: false,
      reason: 'invalid_workspace_brain_structure_jobs_enqueue_command',
      scheduledJobIds: [],
      enqueuedCount: 0,
      errors: command.errors,
    });
  }

  if (command.structureJobs.length === 0) {
    return dispatchResult({
      ok: true,
      accepted: true,
      reason: 'no_structure_jobs_to_enqueue',
      scheduledJobIds: [],
      enqueuedCount: 0,
      errors: [],
    });
  }

  const queue = new AgentLocalStructureJobQueueAdapter(input.executor);
  const enqueue = await queue.enqueueJobs(command.structureJobs);
  const scheduledJobIds = command.structureJobs.map((job) => job.id);
  if (!enqueue.ok) {
    return dispatchResult({
      ok: false,
      accepted: false,
      reason: 'workspace_brain_structure_jobs_enqueue_failed',
      scheduledJobIds,
      enqueuedCount: 0,
      errors: ['workspace brain structure job enqueue failed'],
    });
  }

  return dispatchResult({
    ok: true,
    accepted: true,
    reason: 'workspace_brain_structure_jobs_enqueued',
    scheduledJobIds,
    enqueuedCount: enqueue.enqueuedCount,
    errors: [],
  });
}

export function validateWorkspaceBrainStructureJobsDispatchCommand(
  command: unknown,
): { ok: true; workspaceId: string; structureJobs: StructureJobContract[] } | { ok: false; errors: string[] } {
  if (!isRecord(command)) {
    return { ok: false, errors: ['workspace brain enqueue command must be an object'] };
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(command.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(command.userId, 'userId', errors);
  validateFiniteNumber(command.now, 'now', errors);
  if (!Array.isArray(command.structureJobs)) {
    errors.push('structureJobs must be an array');
  }

  const workspaceId = typeof command.workspaceId === 'string' ? command.workspaceId : undefined;
  const structureJobs = Array.isArray(command.structureJobs) ? command.structureJobs : [];
  const jobs: StructureJobContract[] = [];
  for (const [index, job] of structureJobs.entries()) {
    const jobErrors = validateStructureJobWorkQueueRecord(job);
    errors.push(...jobErrors.map((error) => `structureJobs[${index}].${error}`));
    if (isRecord(job) && workspaceId !== undefined && job.workspaceId !== workspaceId) {
      errors.push(`structureJobs[${index}].workspaceId must match workspaceId`);
    }
    if (isRecord(job) && job.status !== 'queued') {
      errors.push(`structureJobs[${index}].status must be queued`);
    }
    if (jobErrors.length === 0 && isRecord(job)) {
      jobs.push(job as unknown as StructureJobContract);
    }
  }

  if (errors.length > 0 || workspaceId === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, workspaceId, structureJobs: jobs };
}

function dispatchResult(input: {
  ok: boolean;
  accepted: boolean;
  reason: string;
  scheduledJobIds: readonly string[];
  enqueuedCount: number;
  errors: readonly string[];
}): WorkspaceBrainStructureJobsDispatchResult {
  return {
    ok: input.ok,
    accepted: input.accepted,
    reason: input.reason,
    scheduledJobIds: [...input.scheduledJobIds],
    enqueuedCount: input.enqueuedCount,
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    noteSotMutations: [],
    errors: [...input.errors],
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
