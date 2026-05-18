// Thin Worker route and Agent handlers for note structuring runtime entrypoints.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/cloudflare-agents-turso.md

import type {
  ContextAssemblyLimits,
} from '../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type {
  StructureJobContract,
  StructureTargetScope,
  StructureTriggerReason,
  WholeNoteStructureReason,
} from '../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  runContextEnvelopeAssemblyFlow,
  type ContextAssemblyRuntimePorts,
  type ContextEnvelopeAssemblyFlowResult,
} from './contextAssemblyRuntimeFlow.ts';
import type { OperationGenerationProviderRegistry } from './operationGenerationProviderFlow.ts';
import {
  runStructureJobOperationOrchestrationFlow,
  type StructureJobOperationOrchestrationFlowInput,
  type StructureJobOperationOrchestrationFlowResult,
} from './structureJobOperationOrchestrationFlow.ts';
import {
  runStructureTriggerSchedulerFlow,
  type StructureTriggerSchedulerFlowInput,
  type StructureTriggerSchedulerFlowResult,
} from './structureSchedulerRuntimeFlow.ts';

export type NoteStructureRouteKind = 'note_leave' | 'manual_organize' | 'next_open';
export type NoteLeaveCause =
  | 'note_close'
  | 'tab_switch'
  | 'app_leave'
  | 'note_closed'
  | 'tab_switched'
  | 'app_left';

export interface NoteStructureRouteHandlerInput {
  workspaceId: string;
  noteId: string;
  route: NoteStructureRouteKind;
  cause?: NoteLeaveCause;
  now: number;
  ports: StructureTriggerSchedulerFlowInput['ports'];
}

export interface NoteStructureRouteHandlerResult {
  ok: boolean;
  route: NoteStructureRouteKind;
  triggerReason?: StructureTriggerReason;
  scheduler: StructureTriggerSchedulerFlowResult;
  scheduledJobs: StructureJobContract[];
  agentDispatches: [];
  providerCalls: [];
  operationRoutingCalls: [];
  auditWrites: [];
  errors: string[];
}

export interface StructureJobAgentHandlerInput {
  userId: string;
  structureJob: StructureJobContract;
  now: number;
  contextAssemblyPorts: ContextAssemblyRuntimePorts;
  providerRegistry: OperationGenerationProviderRegistry;
  operationFlow: StructureJobOperationOrchestrationFlowInput['operationFlow'];
  limits?: ContextAssemblyLimits;
}

export interface StructureJobAgentHandlerResult {
  ok: boolean;
  contextAssembly: ContextEnvelopeAssemblyFlowResult;
  orchestration?: StructureJobOperationOrchestrationFlowResult;
  providerCalls: Array<{ providerId: string; structureJobId: string }>;
  operationRoutingCalls: Array<{ structureJobId: string }>;
  auditWrites: Array<{ structureJobId: string; savedCount: number }>;
  directApplyResults: [];
  noteSotMutations: [];
  errors: string[];
}

export async function runNoteStructureRouteHandler(
  input: NoteStructureRouteHandlerInput,
): Promise<NoteStructureRouteHandlerResult> {
  const route = mapRouteToSchedulerInput(input);

  if (!route.ok) {
    const scheduler = emptySchedulerResult(route.errors);
    return {
      ok: false,
      route: input.route,
      scheduler,
      scheduledJobs: [],
      agentDispatches: [],
      providerCalls: [],
      operationRoutingCalls: [],
      auditWrites: [],
      errors: route.errors,
    };
  }

  const scheduler = await runStructureTriggerSchedulerFlow(route.input);
  const scheduledJobs = scheduler.enqueue.ok ? scheduler.plan.jobs : [];

  return {
    ok: scheduler.errors.length === 0,
    route: input.route,
    triggerReason: route.input.triggerReason,
    scheduler,
    scheduledJobs,
    agentDispatches: [],
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors: scheduler.errors,
  };
}

export async function runStructureJobAgentHandler(
  input: StructureJobAgentHandlerInput,
): Promise<StructureJobAgentHandlerResult> {
  const contextAssembly = await runContextEnvelopeAssemblyFlow({
    workspaceId: input.structureJob.workspaceId,
    userId: input.userId,
    noteId: input.structureJob.noteId,
    structureJobId: input.structureJob.id,
    targetScope: input.structureJob.targetScope,
    ...(input.structureJob.sectionId === undefined ? {} : { targetId: input.structureJob.sectionId }),
    now: input.now,
    ports: input.contextAssemblyPorts,
    ...(input.limits === undefined ? {} : { limits: input.limits }),
  });

  if (!contextAssembly.validation.valid || contextAssembly.envelope === undefined || contextAssembly.event === undefined) {
    return {
      ok: false,
      contextAssembly,
      providerCalls: [],
      operationRoutingCalls: [],
      auditWrites: [],
      directApplyResults: [],
      noteSotMutations: [],
      errors: contextAssembly.errors,
    };
  }

  const orchestration = await runStructureJobOperationOrchestrationFlow({
    structureJob: input.structureJob,
    contextEnvelope: contextAssembly.envelope,
    contextEnvelopeBuilt: contextAssembly.event,
    providerRegistry: input.providerRegistry,
    operationFlow: input.operationFlow,
    now: input.now,
  });
  const routingFlow = orchestration.structureJobOperationFlow?.routingFlow;

  return {
    ok: orchestration.ok,
    contextAssembly,
    orchestration,
    providerCalls: orchestration.generationFlow.providerCalls,
    operationRoutingCalls: orchestration.structureJobOperationFlow === undefined
      ? []
      : [{ structureJobId: input.structureJob.id }],
    auditWrites: routingFlow?.auditPersistence.attempted === true
      ? [{
          structureJobId: input.structureJob.id,
          savedCount: routingFlow.auditPersistence.savedCount,
        }]
      : [],
    directApplyResults: [],
    noteSotMutations: [],
    errors: orchestration.errors,
  };
}

function mapRouteToSchedulerInput(
  input: NoteStructureRouteHandlerInput,
): { ok: true; input: StructureTriggerSchedulerFlowInput } | { ok: false; errors: string[] } {
  const mapped = routeToTrigger(input.route, input.cause);
  if (mapped === undefined) {
    return { ok: false, errors: [`route ${input.route} is not a structure route`] };
  }
  if ('errors' in mapped) {
    return { ok: false, errors: mapped.errors };
  }

  return {
    ok: true,
    input: {
      workspaceId: input.workspaceId,
      noteId: input.noteId,
      triggerReason: mapped.triggerReason,
      now: input.now,
      ports: input.ports,
      ...(mapped.targetScope === undefined ? {} : { targetScope: mapped.targetScope }),
      ...(mapped.wholeNoteReason === undefined ? {} : { wholeNoteReason: mapped.wholeNoteReason }),
    },
  };
}

function routeToTrigger(route: NoteStructureRouteKind, cause: NoteLeaveCause | undefined): {
  triggerReason: StructureTriggerReason;
  targetScope?: StructureTargetScope;
  wholeNoteReason?: WholeNoteStructureReason;
} | { errors: string[] } | undefined {
  switch (route) {
    case 'note_leave':
      return noteLeaveCauseToTrigger(cause);
    case 'manual_organize':
      return {
        triggerReason: 'manual_organize',
        targetScope: 'note',
        wholeNoteReason: 'manual_organize',
      };
    case 'next_open':
      return { triggerReason: 'next_open' };
    default:
      return undefined;
  }
}

function noteLeaveCauseToTrigger(cause: NoteLeaveCause | undefined): {
  triggerReason: StructureTriggerReason;
} | { errors: string[] } {
  if (cause === undefined) {
    return { triggerReason: 'note_closed' };
  }

  switch (cause) {
    case 'note_close':
    case 'note_closed':
      return { triggerReason: 'note_closed' };
    case 'tab_switch':
    case 'tab_switched':
      return { triggerReason: 'tab_switched' };
    case 'app_leave':
    case 'app_left':
      return { triggerReason: 'app_left' };
    default:
      return {
        errors: [
          'note_leave cause must be one of note_close, tab_switch, app_leave, note_closed, tab_switched, app_left',
        ],
      };
  }
}

function emptySchedulerResult(errors: string[]): StructureTriggerSchedulerFlowResult {
  return {
    plan: {
      jobs: [],
      skippedJobs: [],
      errors,
    },
    enqueue: {
      attempted: false,
      ok: true,
      enqueuedCount: 0,
      errors: [],
    },
    digestPreparation: {
      attempted: false,
      ok: true,
      errors: [],
    },
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors,
  };
}
