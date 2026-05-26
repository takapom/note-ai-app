// Durable Object alarm helpers for WorkspaceBrain background processing.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/backend-runtime.md

import type { CloudflareAgentRpcResult } from './agentRpcResults.ts';

export const WORKSPACE_BRAIN_PROCESS_COMMAND_STORAGE_KEY = 'workspace_brain.process_command';
export const WORKSPACE_BRAIN_PROCESS_ALARM_DELAY_MS = 250;

export interface WorkspaceBrainAlarmProcessCommand {
  workspaceId: string;
  userId: string;
}

export type WorkspaceBrainAlarmCommandResult =
  | { ok: true; command: WorkspaceBrainAlarmProcessCommand }
  | { ok: false; errors: string[] };

export type WorkspaceBrainAlarmScheduleResult =
  | { ok: true; scheduledAt: number }
  | { ok: false; errors: string[] };

export interface DurableObjectAlarmStorageLike {
  get?(key: string): unknown;
  put?(key: string, value: unknown): unknown;
  setAlarm?(scheduledTime: number): unknown;
}

export async function persistWorkspaceBrainAlarmProcessCommand(input: {
  storage: unknown;
  command: WorkspaceBrainAlarmProcessCommand;
}): Promise<WorkspaceBrainAlarmCommandResult> {
  const command = validateWorkspaceBrainAlarmProcessCommand(input.command);
  if (!command.ok) {
    return command;
  }

  const storage = readAlarmStorage(input.storage);
  if (storage === undefined || typeof storage.put !== 'function') {
    return { ok: false, errors: ['WorkspaceBrain alarm command storage is not configured'] };
  }

  try {
    await storage.put(WORKSPACE_BRAIN_PROCESS_COMMAND_STORAGE_KEY, command.command);
  } catch {
    return { ok: false, errors: ['WorkspaceBrain alarm command storage failed'] };
  }

  return command;
}

export async function readWorkspaceBrainAlarmProcessCommand(input: {
  storage: unknown;
}): Promise<WorkspaceBrainAlarmCommandResult> {
  const storage = readAlarmStorage(input.storage);
  if (storage === undefined || typeof storage.get !== 'function') {
    return { ok: false, errors: ['WorkspaceBrain alarm command storage is not configured'] };
  }

  let stored: unknown;
  try {
    stored = await storage.get(WORKSPACE_BRAIN_PROCESS_COMMAND_STORAGE_KEY);
  } catch {
    return { ok: false, errors: ['WorkspaceBrain alarm command storage failed'] };
  }

  return validateWorkspaceBrainAlarmProcessCommand(stored);
}

export async function scheduleWorkspaceBrainProcessingAlarm(input: {
  storage: unknown;
  now: number;
  delayMs?: number;
}): Promise<WorkspaceBrainAlarmScheduleResult> {
  const delayMs = input.delayMs ?? WORKSPACE_BRAIN_PROCESS_ALARM_DELAY_MS;
  if (!Number.isFinite(input.now) || !Number.isFinite(delayMs) || delayMs < 0) {
    return { ok: false, errors: ['WorkspaceBrain alarm time must be finite'] };
  }

  const storage = readAlarmStorage(input.storage);
  if (storage === undefined || typeof storage.setAlarm !== 'function') {
    return { ok: false, errors: ['WorkspaceBrain alarm scheduler is not configured'] };
  }

  const scheduledAt = input.now + delayMs;
  try {
    await storage.setAlarm(scheduledAt);
  } catch {
    return { ok: false, errors: ['WorkspaceBrain alarm scheduling failed'] };
  }

  return { ok: true, scheduledAt };
}

export function shouldScheduleNextWorkspaceBrainAlarm(
  result: Pick<CloudflareAgentRpcResult, 'reason'>,
): boolean {
  return result.reason === 'completed' || result.reason === 'agent_failed';
}

function validateWorkspaceBrainAlarmProcessCommand(
  command: unknown,
): WorkspaceBrainAlarmCommandResult {
  if (!isRecord(command)) {
    return { ok: false, errors: ['WorkspaceBrain alarm command must be an object'] };
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(command.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(command.userId, 'userId', errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    command: {
      workspaceId: command.workspaceId as string,
      userId: command.userId as string,
    },
  };
}

function readAlarmStorage(storage: unknown): DurableObjectAlarmStorageLike | undefined {
  return isRecord(storage) ? storage as DurableObjectAlarmStorageLike : undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
