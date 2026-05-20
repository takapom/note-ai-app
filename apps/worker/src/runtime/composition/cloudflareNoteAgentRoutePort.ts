import type { StructureTriggerReason } from '../../../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  readNoteAgentNamespace,
  scheduleNoteStructureThroughAgent,
  type CloudflareDurableObjectNamespaceLike,
} from '../cloudflare/cloudflareAgentRpcBoundary.ts';
import type { NoteStructureRoutePort } from '../http/workerHttpRouter.ts';

export function createNoteAgentStructureRoutePort(
  namespace: CloudflareDurableObjectNamespaceLike,
): NoteStructureRoutePort {
  return {
    async runNoteStructureRoute(input) {
      const dispatched = await scheduleNoteStructureThroughAgent<NoteAgentStructureRpcResult>({
        namespace,
        command: {
          workspaceId: input.workspaceId,
          noteId: input.noteId,
          route: input.route,
          ...(input.cause === undefined ? {} : { cause: input.cause }),
          now: input.now,
        },
      });
      if (!dispatched.ok) {
        return {
          ok: false,
          route: input.route,
          scheduledJobs: [],
          providerCalls: [],
          operationRoutingCalls: [],
          auditWrites: [],
          errors: Array.from(dispatched.errors),
        };
      }

      return {
        ok: dispatched.result.ok,
        route: input.route,
        ...toTriggerReasonProperty(dispatched.result.reason),
        scheduledJobs: dispatched.result.scheduledJobs ?? [],
        providerCalls: dispatched.result.providerCalls,
        operationRoutingCalls: dispatched.result.operationRoutingCalls,
        auditWrites: dispatched.result.auditWrites,
        errors: dispatched.result.errors,
      };
    },
  };
}

export function readNoteAgentNamespaceFromEnv(env: {
  NOTE_AGENT?: unknown;
}): CloudflareDurableObjectNamespaceLike | undefined {
  const noteAgentResult = readNoteAgentNamespace({ NOTE_AGENT: env.NOTE_AGENT });
  return noteAgentResult.ok ? noteAgentResult.namespace : undefined;
}

function toTriggerReasonProperty(
  reason: string,
): { triggerReason: StructureTriggerReason } | {} {
  return isStructureTriggerReason(reason)
    ? { triggerReason: reason }
    : {};
}

function isStructureTriggerReason(value: string): value is StructureTriggerReason {
  return (
    value === 'note_closed' ||
    value === 'tab_switched' ||
    value === 'app_left' ||
    value === 'next_open' ||
    value === 'manual_organize'
  );
}

interface NoteAgentStructureRpcResult {
  ok: boolean;
  accepted: boolean;
  reason: string;
  scheduledJobIds: readonly string[];
  scheduledJobs?: NoteStructureRoutePortResult['scheduledJobs'];
  providerCalls: NoteStructureRoutePortResult['providerCalls'];
  operationRoutingCalls: NoteStructureRoutePortResult['operationRoutingCalls'];
  auditWrites: NoteStructureRoutePortResult['auditWrites'];
  noteSotMutations: [];
  errors: string[];
}

type NoteStructureRoutePortResult = Awaited<
  ReturnType<NoteStructureRoutePort['runNoteStructureRoute']>
>;
