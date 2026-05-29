// Framework-neutral Cloudflare Agent deployment binding foundation.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/backend-runtime.md

import {
  defaultNoteAgentRuntimeDelegates,
  defaultWorkspaceBrainAgentRuntimeDelegates,
  type NoteStructureRouteHandlerInput,
  type NoteStructureRouteHandlerResult,
  type StructureJobAgentHandlerInput,
  type StructureJobAgentHandlerResult,
  type StructureJobProcessorFlowInput,
  type StructureJobProcessorFlowResult,
} from '../composition/agentDelegates.ts';
import {
  createWorkspaceBrainStructureJobProcessorInput,
  type WorkspaceBrainProcessNextStructureJobCommand,
  type WorkspaceBrainStructureJobProcessorCommandFailure,
  type WorkspaceBrainStructureJobProcessorCommandResult,
  type WorkspaceBrainStructureJobProcessorOptions,
} from './cloudflareWorkspaceBrainProcessorCommand.ts';

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

export {
  createWorkspaceBrainStructureJobProcessorInput,
  validateWorkspaceBrainProcessNextStructureJobCommand,
  validateWorkspaceBrainStructureJobProcessorOptions,
} from './cloudflareWorkspaceBrainProcessorCommand.ts';
export type {
  WorkspaceBrainProcessNextStructureJobCommand,
  WorkspaceBrainStructureJobProcessorCommandFailure,
  WorkspaceBrainStructureJobProcessorCommandResult,
  WorkspaceBrainStructureJobProcessorOptions,
} from './cloudflareWorkspaceBrainProcessorCommand.ts';

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
      ...defaultNoteAgentRuntimeDelegates,
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
      ...defaultWorkspaceBrainAgentRuntimeDelegates,
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
