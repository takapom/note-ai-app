// Serializable Cloudflare Agent RPC command validation.
// Authority: docs/contracts/backend-runtime.md

import type {
  NoteLeaveCause,
  NoteStructureRouteKind,
} from './noteStructureRouteRpcTypes.ts';

export const NOTE_AGENT_COMMAND_KEYS = Object.freeze(['workspaceId', 'noteId', 'route', 'cause', 'now']);
export const WORKSPACE_BRAIN_COMMAND_KEYS = Object.freeze(['workspaceId', 'userId', 'now']);

const NOTE_STRUCTURE_ROUTES: readonly NoteStructureRouteKind[] = Object.freeze([
  'note_leave',
  'manual_organize',
  'next_open',
]);
const NOTE_LEAVE_CAUSES: readonly NoteLeaveCause[] = Object.freeze([
  'note_close',
  'tab_switch',
  'app_leave',
  'note_closed',
  'tab_switched',
  'app_left',
]);

export function validateNoteAgentScheduleStructureCommand(
  command: unknown,
): string[] {
  const errors = validateSerializableRpcCommand(command, NOTE_AGENT_COMMAND_KEYS);
  if (!isRecord(command)) {
    return errors;
  }

  validateRequiredTrimmedString(command.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(command.noteId, 'noteId', errors);
  validateRequiredEnum(command.route, 'route', NOTE_STRUCTURE_ROUTES, errors);
  if (command.cause !== undefined) {
    validateRequiredEnum(command.cause, 'cause', NOTE_LEAVE_CAUSES, errors);
  }
  validateFiniteNumber(command.now, 'now', errors);

  return errors;
}

export function validateWorkspaceBrainProcessNextQueuedStructureJobCommand(
  command: unknown,
): string[] {
  const errors = validateSerializableRpcCommand(command, WORKSPACE_BRAIN_COMMAND_KEYS);
  if (!isRecord(command)) {
    return errors;
  }

  validateRequiredTrimmedString(command.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(command.userId, 'userId', errors);
  validateFiniteNumber(command.now, 'now', errors);

  return errors;
}

export function validateSerializableRpcCommand(
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

export function validateRequiredTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed`);
  }
}

function validateRequiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  errors: string[],
): void {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    errors.push(`${field} must be one of ${allowed.join(', ')}`);
  }
}

function validateFiniteNumber(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
