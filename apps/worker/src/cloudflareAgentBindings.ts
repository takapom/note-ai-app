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
  runtimeRole: readonly string[];
  delegatesTo: readonly string[];
  ownsRuntimePolicy: false;
}

export const noteAgentBindingDescriptor: CloudflareAgentBindingDescriptor = Object.freeze({
  className: NOTE_AGENT_CLASS_NAME,
  deploymentBinding: NOTE_AGENT_DEPLOYMENT_BINDING,
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
