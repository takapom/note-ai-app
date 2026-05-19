// Framework-neutral Cloudflare Agent deployment binding foundation.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/backend-runtime.md

import {
  runNoteStructureRouteHandler,
  runStructureJobAgentHandler,
  type NoteStructureRouteHandlerInput,
  type NoteStructureRouteHandlerResult,
  type StructureJobAgentHandlerInput,
  type StructureJobAgentHandlerResult,
} from './noteStructureRuntimeHandlers.ts';
import {
  runStructureJobProcessorFlow,
  type StructureJobProcessorFlowInput,
  type StructureJobProcessorFlowResult,
} from './structureJobProcessorFlow.ts';

export const NOTE_AGENT_CLASS_NAME = 'NoteAgent';
export const NOTE_AGENT_DEPLOYMENT_BINDING = 'NOTE_AGENT';
export const WORKSPACE_BRAIN_AGENT_CLASS_NAME = 'WorkspaceBrainAgent';
export const WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING = 'WORKSPACE_BRAIN_AGENT';

export type CloudflareAgentClassName =
  | typeof NOTE_AGENT_CLASS_NAME
  | typeof WORKSPACE_BRAIN_AGENT_CLASS_NAME;

export type CloudflareAgentDeploymentBinding =
  | typeof NOTE_AGENT_DEPLOYMENT_BINDING
  | typeof WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING;

export interface CloudflareAgentBindingDescriptor {
  className: CloudflareAgentClassName;
  deploymentBinding: CloudflareAgentDeploymentBinding;
  deploymentBindingKind: 'durable_object_namespace';
  moduleExport: CloudflareAgentClassName;
  runtimeRole: readonly string[];
  delegatesTo: readonly string[];
  ownsRuntimePolicy: false;
}

export interface CloudflareDurableObjectBindingDescriptor {
  name: CloudflareAgentDeploymentBinding;
  class_name: CloudflareAgentClassName;
}

export const noteAgentBindingDescriptor: CloudflareAgentBindingDescriptor = Object.freeze({
  className: NOTE_AGENT_CLASS_NAME,
  deploymentBinding: NOTE_AGENT_DEPLOYMENT_BINDING,
  deploymentBindingKind: 'durable_object_namespace',
  moduleExport: NOTE_AGENT_CLASS_NAME,
  runtimeRole: Object.freeze([
    'edit event buffer',
    'dirty section tracking',
    'note leave handling',
    'structure job scheduling',
    'context_hash dedupe coordination',
  ]),
  delegatesTo: Object.freeze([
    'runNoteStructureRouteHandler',
  ]),
  ownsRuntimePolicy: false,
});

export const workspaceBrainAgentBindingDescriptor: CloudflareAgentBindingDescriptor = Object.freeze({
  className: WORKSPACE_BRAIN_AGENT_CLASS_NAME,
  deploymentBinding: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
  deploymentBindingKind: 'durable_object_namespace',
  moduleExport: WORKSPACE_BRAIN_AGENT_CLASS_NAME,
  runtimeRole: Object.freeze([
    'related context retrieval coordination',
    'memory candidate management coordination',
    'workspace-wide semantic graph coordination',
    'queued structure job processing',
  ]),
  delegatesTo: Object.freeze([
    'runStructureJobAgentHandler',
    'runStructureJobProcessorFlow',
  ]),
  ownsRuntimePolicy: false,
});

export const cloudflareAgentBindingDescriptors: readonly CloudflareAgentBindingDescriptor[] = Object.freeze([
  noteAgentBindingDescriptor,
  workspaceBrainAgentBindingDescriptor,
]);

export interface NoteAgentRuntimeDelegates {
  runNoteStructureRouteHandler(
    input: NoteStructureRouteHandlerInput,
  ): Promise<NoteStructureRouteHandlerResult>;
}

export interface WorkspaceBrainAgentRuntimeDelegates {
  runStructureJobAgentHandler(
    input: StructureJobAgentHandlerInput,
  ): Promise<StructureJobAgentHandlerResult>;
  runStructureJobProcessorFlow(
    input: StructureJobProcessorFlowInput,
  ): Promise<StructureJobProcessorFlowResult>;
}

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

export interface CloudflareAgentBindingOptions {
  noteAgent?: Partial<NoteAgentRuntimeDelegates>;
  workspaceBrainAgent?: Partial<WorkspaceBrainAgentRuntimeDelegates>;
}

export interface CloudflareAgentBindings {
  NoteAgent: NoteAgent;
  WorkspaceBrainAgent: WorkspaceBrainAgent;
}

export class NoteAgent {
  readonly descriptor = noteAgentBindingDescriptor;
  private readonly delegates: NoteAgentRuntimeDelegates;

  constructor(delegates: Partial<NoteAgentRuntimeDelegates> = {}) {
    this.delegates = {
      runNoteStructureRouteHandler,
      ...delegates,
    };
  }

  handleNoteStructureRoute(
    input: NoteStructureRouteHandlerInput,
  ): Promise<NoteStructureRouteHandlerResult> {
    return this.delegates.runNoteStructureRouteHandler(input);
  }
}

export class WorkspaceBrainAgent {
  readonly descriptor = workspaceBrainAgentBindingDescriptor;
  private readonly delegates: WorkspaceBrainAgentRuntimeDelegates;

  constructor(delegates: Partial<WorkspaceBrainAgentRuntimeDelegates> = {}) {
    this.delegates = {
      runStructureJobAgentHandler,
      runStructureJobProcessorFlow,
      ...delegates,
    };
  }

  handleStructureJob(
    input: StructureJobAgentHandlerInput,
  ): Promise<StructureJobAgentHandlerResult> {
    return this.delegates.runStructureJobAgentHandler(input);
  }

  processNextStructureJob(
    input: StructureJobProcessorFlowInput,
  ): Promise<StructureJobProcessorFlowResult> {
    return this.delegates.runStructureJobProcessorFlow(input);
  }

  processNextQueuedStructureJob(
    command: WorkspaceBrainProcessNextStructureJobCommand,
    options: WorkspaceBrainStructureJobProcessorOptions,
  ): Promise<StructureJobProcessorFlowResult | WorkspaceBrainStructureJobProcessorCommandFailure> {
    const input = createWorkspaceBrainStructureJobProcessorInput(command, options);
    if (!input.ok) {
      return Promise.resolve(input);
    }

    return this.processNextStructureJob(input.input);
  }
}

export function createCloudflareAgentBindings(
  options: CloudflareAgentBindingOptions = {},
): CloudflareAgentBindings {
  return {
    NoteAgent: new NoteAgent(options.noteAgent),
    WorkspaceBrainAgent: new WorkspaceBrainAgent(options.workspaceBrainAgent),
  };
}

export function getCloudflareAgentBindingDescriptor(
  className: CloudflareAgentClassName,
): CloudflareAgentBindingDescriptor | undefined {
  return cloudflareAgentBindingDescriptors.find((descriptor) => descriptor.className === className);
}

export function createCloudflareDurableObjectBindingDescriptors(
  descriptors: readonly CloudflareAgentBindingDescriptor[] = cloudflareAgentBindingDescriptors,
): readonly CloudflareDurableObjectBindingDescriptor[] {
  return Object.freeze(descriptors.map(toCloudflareDurableObjectBindingDescriptor));
}

export function toCloudflareDurableObjectBindingDescriptor(
  descriptor: CloudflareAgentBindingDescriptor,
): CloudflareDurableObjectBindingDescriptor {
  return Object.freeze({
    name: descriptor.deploymentBinding,
    class_name: descriptor.moduleExport,
  });
}

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
