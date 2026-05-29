// WorkspaceBrainAgent processor command validation and input mapping.
// Authority: docs/contracts/backend-runtime.md

import type { StructureJobProcessorFlowInput } from '../composition/agentDelegates.ts';

export interface WorkspaceBrainProcessNextStructureJobCommand {
  workspaceId: string;
  userId: string;
  now: number;
}

export type WorkspaceBrainStructureJobProcessorOptions = Pick<
  StructureJobProcessorFlowInput,
  'workQueue' | 'contextAssemblyPorts' | 'providerRegistry' | 'operationFlow' | 'limits'
>;

export type WorkspaceBrainStructureJobProcessorCommandResult =
  | { ok: true; input: StructureJobProcessorFlowInput }
  | { ok: false; errors: string[] };

export type WorkspaceBrainStructureJobProcessorCommandFailure = Extract<
  WorkspaceBrainStructureJobProcessorCommandResult,
  { ok: false }
>;

export function createWorkspaceBrainStructureJobProcessorInput(
  command: WorkspaceBrainProcessNextStructureJobCommand,
  options: WorkspaceBrainStructureJobProcessorOptions,
): WorkspaceBrainStructureJobProcessorCommandResult {
  const errors = validateWorkspaceBrainProcessNextStructureJobCommand(command);
  errors.push(...validateWorkspaceBrainStructureJobProcessorOptions(options));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      workspaceId: command.workspaceId,
      userId: command.userId,
      now: command.now,
      workQueue: options.workQueue,
      contextAssemblyPorts: options.contextAssemblyPorts,
      providerRegistry: options.providerRegistry,
      operationFlow: options.operationFlow,
      ...(options.limits === undefined ? {} : { limits: options.limits }),
    },
  };
}

export function validateWorkspaceBrainProcessNextStructureJobCommand(
  command: unknown,
): string[] {
  if (!isRecord(command)) {
    return ['workspace brain process command must be an object'];
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(command.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(command.userId, 'userId', errors);
  validateFiniteNumber(command.now, 'now', errors);

  for (const [key, value] of Object.entries(command)) {
    if (typeof value === 'function') {
      errors.push(`${key} must be serializable`);
    }
  }

  return errors;
}

export function validateWorkspaceBrainStructureJobProcessorOptions(
  options: unknown,
): string[] {
  if (!isRecord(options)) {
    return ['workspace brain processor options must be an object'];
  }

  const errors: string[] = [];
  validateRequiredMethods(options.workQueue, 'workQueue', [
    'claimNextQueuedJob',
    'markJobCompleted',
    'markJobFailed',
  ], errors);
  validateRequiredMembers(options.contextAssemblyPorts, 'contextAssemblyPorts', [
    'targetSnapshot',
    'localStructure',
    'relatedContext',
    'memoryContext',
  ], errors);
  if (
    isRecord(options.contextAssemblyPorts) &&
    isRecord(options.contextAssemblyPorts.targetSnapshot) &&
    typeof options.contextAssemblyPorts.targetSnapshot.loadTargetContext !== 'function'
  ) {
    errors.push('contextAssemblyPorts.targetSnapshot.loadTargetContext must be a function');
  }
  if (
    isRecord(options.contextAssemblyPorts) &&
    isRecord(options.contextAssemblyPorts.localStructure) &&
    typeof options.contextAssemblyPorts.localStructure.loadLocalStructure !== 'function'
  ) {
    errors.push('contextAssemblyPorts.localStructure.loadLocalStructure must be a function');
  }
  if (
    isRecord(options.contextAssemblyPorts) &&
    isRecord(options.contextAssemblyPorts.relatedContext) &&
    typeof options.contextAssemblyPorts.relatedContext.loadRelatedContext !== 'function'
  ) {
    errors.push('contextAssemblyPorts.relatedContext.loadRelatedContext must be a function');
  }
  if (
    isRecord(options.contextAssemblyPorts) &&
    isRecord(options.contextAssemblyPorts.memoryContext) &&
    typeof options.contextAssemblyPorts.memoryContext.loadMemoryContext !== 'function'
  ) {
    errors.push('contextAssemblyPorts.memoryContext.loadMemoryContext must be a function');
  }
  if (!isRecord(options.providerRegistry) || typeof options.providerRegistry.resolveProvider !== 'function') {
    errors.push('providerRegistry.resolveProvider must be a function');
  }
  if (!isRecord(options.operationFlow)) {
    errors.push('operationFlow must be an object');
  } else {
    if (!isRecord(options.operationFlow.snapshot)) {
      errors.push('operationFlow.snapshot must be an object');
    }
    if (!isRecord(options.operationFlow.auditPersistence) ||
      typeof options.operationFlow.auditPersistence.save !== 'function') {
      errors.push('operationFlow.auditPersistence.save must be a function');
    }
    validateFiniteNumber(options.operationFlow.now, 'operationFlow.now', errors);
  }

  return errors;
}

function validateRequiredMethods(
  value: unknown,
  field: string,
  requiredMethods: readonly string[],
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${field} must be an object`);
    return;
  }

  for (const method of requiredMethods) {
    if (typeof value[method] !== 'function') {
      errors.push(`${field}.${method} must be a function`);
    }
  }
}

function validateRequiredMembers(
  value: unknown,
  field: string,
  requiredMembers: readonly string[],
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${field} must be an object`);
    return;
  }

  for (const member of requiredMembers) {
    if (!(member in value)) {
      errors.push(`${field}.${member} is required`);
    }
  }
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
