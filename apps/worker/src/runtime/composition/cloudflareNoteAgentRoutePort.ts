import type { StructureTriggerReason } from '../../../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  readNoteAgentNamespace,
  readWorkspaceBrainAgentNamespace,
  scheduleNoteStructureThroughAgent,
  type CloudflareDurableObjectNamespaceLike,
} from '../cloudflare/cloudflareAgentRpcBoundary.ts';
import { enqueueStructureJobsThroughWorkspaceBrain } from '../cloudflare/cloudflareWorkspaceBrainEnqueueRpc.ts';
import type { NoteStructureBackgroundDispatchResult, NoteStructureRoutePort } from '../http/workerHttpRouter.ts';

export function createNoteAgentStructureRoutePort(
  namespace: CloudflareDurableObjectNamespaceLike,
  workspaceBrainNamespace?: CloudflareDurableObjectNamespaceLike,
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

      const scheduledJobs = dispatched.result.scheduledJobs ?? [];
      const backgroundDispatch = dispatched.result.ok
          ? await dispatchScheduledJobsToWorkspaceBrain({
              namespace: workspaceBrainNamespace,
              workspaceId: input.workspaceId,
              userId: input.userId,
              now: input.now,
              scheduledJobs,
            })
        : undefined;

      return {
        ok: dispatched.result.ok,
        route: input.route,
        ...toTriggerReasonProperty(dispatched.result.reason),
        scheduledJobs,
        providerCalls: dispatched.result.providerCalls,
        operationRoutingCalls: dispatched.result.operationRoutingCalls,
        auditWrites: dispatched.result.auditWrites,
        ...(backgroundDispatch === undefined ? {} : { backgroundDispatch }),
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

export function readWorkspaceBrainAgentNamespaceFromEnv(env: {
  WORKSPACE_BRAIN_AGENT?: unknown;
}): CloudflareDurableObjectNamespaceLike | undefined {
  const workspaceBrainResult = readWorkspaceBrainAgentNamespace({
    WORKSPACE_BRAIN_AGENT: env.WORKSPACE_BRAIN_AGENT,
  });
  return workspaceBrainResult.ok ? workspaceBrainResult.namespace : undefined;
}

async function dispatchScheduledJobsToWorkspaceBrain(input: {
  namespace: CloudflareDurableObjectNamespaceLike | undefined;
  workspaceId: string;
  userId: string | undefined;
  now: number;
  scheduledJobs: NoteStructureRoutePortResult['scheduledJobs'];
}): Promise<NoteStructureBackgroundDispatchResult | undefined> {
  if (input.namespace === undefined) {
    return undefined;
  }

  const scheduledJobIds = input.scheduledJobs.map((job) => job.id);
  if (input.scheduledJobs.length === 0) {
    return {
      attempted: false,
      ok: true,
      enqueuedCount: 0,
      scheduledJobIds,
      errors: [],
    };
  }

  if (input.userId === undefined) {
    return {
      attempted: false,
      ok: false,
      enqueuedCount: 0,
      scheduledJobIds,
      errors: ['userId is required for WorkspaceBrain structure job dispatch'],
    };
  }

  const dispatched = await enqueueStructureJobsThroughWorkspaceBrain<WorkspaceBrainEnqueueStructureJobsRpcResult>({
    namespace: input.namespace,
    command: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      now: input.now,
      structureJobs: input.scheduledJobs,
    },
  });

  if (!dispatched.ok) {
    return {
      attempted: true,
      ok: false,
      enqueuedCount: 0,
      scheduledJobIds,
      errors: Array.from(dispatched.errors),
    };
  }

  return {
    attempted: true,
    ok: dispatched.result.ok,
    enqueuedCount: dispatched.result.enqueuedCount,
    scheduledJobIds: dispatched.result.scheduledJobIds,
    errors: dispatched.result.errors,
  };
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

interface WorkspaceBrainEnqueueStructureJobsRpcResult {
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

type NoteStructureRoutePortResult = Awaited<
  ReturnType<NoteStructureRoutePort['runNoteStructureRoute']>
>;
