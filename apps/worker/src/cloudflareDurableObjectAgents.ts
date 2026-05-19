// Thin Cloudflare Durable Object deployment adapters.
// Authority: docs/contracts/cloudflare-agents-turso.md

import { DurableObject, type DurableObjectState } from 'cloudflare:workers';
import {
  NoteAgent as NoteAgentRuntimeDelegate,
  WorkspaceBrainAgent as WorkspaceBrainAgentRuntimeDelegate,
  noteAgentBindingDescriptor,
  workspaceBrainAgentBindingDescriptor,
} from './cloudflareAgentBindings.ts';
import {
  type NoteLeaveCause,
  type NoteStructureRouteKind,
} from './noteStructureRuntimeHandlers.ts';
import {
  createWorkerRuntimePorts,
  type WorkerEntrypointEnv,
} from './workerEntrypoint.ts';

export interface NoteAgentScheduleStructureCommand {
  workspaceId: string;
  noteId: string;
  route: NoteStructureRouteKind;
  cause?: NoteLeaveCause;
  now: number;
}

export interface WorkspaceBrainProcessNextStructureJobCommand {
  workspaceId: string;
  userId: string;
  now: number;
}

export interface CloudflareAgentRpcResult {
  ok: boolean;
  accepted: boolean;
  reason: string;
  scheduledJobIds: readonly string[];
  providerCalls: readonly { providerId: string; structureJobId: string }[];
  operationRoutingCalls: readonly { structureJobId: string }[];
  auditWrites: readonly { structureJobId: string; savedCount: number }[];
  noteSotMutations: [];
  errors: string[];
}

export class NoteAgent extends DurableObject<WorkerEntrypointEnv> {
  readonly descriptor = noteAgentBindingDescriptor;
  private readonly runtimeDelegate = new NoteAgentRuntimeDelegate();
  private readonly workerEnv: WorkerEntrypointEnv;

  constructor(ctx: DurableObjectState, env: WorkerEntrypointEnv) {
    super(ctx, env);
    this.workerEnv = env;
  }

  async scheduleNoteStructure(
    input: NoteAgentScheduleStructureCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const ports = createWorkerRuntimePorts({ env: this.workerEnv }).noteStructure;
    if (ports === undefined) {
      return rejectedRpcResult('note_structure_ports_not_configured', [
        'note structure scheduler ports are not configured',
      ]);
    }

    const result = await this.runtimeDelegate.handleNoteStructureRoute({
      ...input,
      ports,
    });

    return {
      ok: result.ok,
      accepted: result.errors.length === 0,
      reason: result.triggerReason ?? result.route,
      scheduledJobIds: result.scheduledJobs.map((job) => job.id),
      providerCalls: result.providerCalls,
      operationRoutingCalls: result.operationRoutingCalls,
      auditWrites: result.auditWrites,
      noteSotMutations: [],
      errors: result.errors,
    };
  }
}

export class WorkspaceBrainAgent extends DurableObject<WorkerEntrypointEnv> {
  readonly descriptor = workspaceBrainAgentBindingDescriptor;
  private readonly runtimeDelegate = new WorkspaceBrainAgentRuntimeDelegate();
  private readonly workerEnv: WorkerEntrypointEnv;

  constructor(ctx: DurableObjectState, env: WorkerEntrypointEnv) {
    super(ctx, env);
    this.workerEnv = env;
    void this.runtimeDelegate;
  }

  processNextQueuedStructureJob(
    input: WorkspaceBrainProcessNextStructureJobCommand,
  ): Promise<CloudflareAgentRpcResult> {
    void input;
    void this.workerEnv;
    return Promise.resolve(rejectedRpcResult('workspace_brain_ports_not_configured', [
      'workspace brain processor ports are not configured',
    ]));
  }
}

function rejectedRpcResult(reason: string, errors: string[]): CloudflareAgentRpcResult {
  return {
    ok: false,
    accepted: false,
    reason,
    scheduledJobIds: [],
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    noteSotMutations: [],
    errors,
  };
}
