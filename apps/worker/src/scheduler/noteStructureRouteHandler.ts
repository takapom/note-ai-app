// Thin Worker route handler for note structure triggers.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/backend-runtime.md

import type {
  StructureJobContract,
  StructureTargetScope,
  StructureTriggerReason,
  WholeNoteStructureReason,
} from '../../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
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
