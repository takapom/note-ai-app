// Thin Cloudflare Durable Object deployment adapters.
// Authority: docs/contracts/cloudflare-agents-turso.md

import { DurableObject, type DurableObjectState } from 'cloudflare:workers';
import {
  NoteAgent as NoteAgentRuntimeDelegate,
  WorkspaceBrainAgent as WorkspaceBrainAgentRuntimeDelegate,
  type WorkspaceBrainProcessNextStructureJobCommand,
  type WorkspaceBrainStructureJobProcessorOptions,
  noteAgentBindingDescriptor,
  workspaceBrainAgentBindingDescriptor,
} from './cloudflareAgentBindings.ts';
import {
  type NoteLeaveCause,
  type NoteStructureRouteKind,
} from './noteStructureRuntimeHandlers.ts';
import {
  createWorkerRuntimePorts,
  createWorkspaceBrainStructureJobProcessorOptions,
} from './workerRuntimePorts.ts';
import { type WorkerEntrypointEnv } from './workerEntrypoint.ts';

export interface NoteAgentScheduleStructureCommand {
  workspaceId: string;
  noteId: string;
  route: NoteStructureRouteKind;
  cause?: NoteLeaveCause;
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

export const WORKSPACE_BRAIN_PROCESSOR_OPTIONS_ENV_KEY = 'WORKSPACE_BRAIN_STRUCTURE_JOB_PROCESSOR_OPTIONS';

export type WorkspaceBrainStructureJobProcessorOptionsProvider = (input: {
  env: WorkerEntrypointEnv;
  command: WorkspaceBrainProcessNextStructureJobCommand;
}) => WorkspaceBrainStructureJobProcessorOptions | undefined | Promise<WorkspaceBrainStructureJobProcessorOptions | undefined>;

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
  }

  async processNextQueuedStructureJob(
    input: WorkspaceBrainProcessNextStructureJobCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const options = await readWorkspaceBrainProcessorOptions(this.workerEnv, input);
    if (!options.ok) {
      return rejectedRpcResult(options.reason, options.errors);
    }

    const result = await this.runtimeDelegate.processNextQueuedStructureJob(input, options.options);
    if (!('claim' in result)) {
      return rejectedRpcResult('invalid_workspace_brain_process_command', result.errors);
    }

    return {
      ok: result.ok,
      accepted: result.errors.length === 0,
      reason: result.reason,
      scheduledJobIds: result.claim.job === undefined ? [] : [result.claim.job.id],
      providerCalls: result.providerCalls,
      operationRoutingCalls: result.operationRoutingCalls,
      auditWrites: result.auditWrites,
      noteSotMutations: [],
      errors: result.errors,
    };
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

async function readWorkspaceBrainProcessorOptions(
  env: WorkerEntrypointEnv,
  command: WorkspaceBrainProcessNextStructureJobCommand,
): Promise<
  | { ok: true; options: WorkspaceBrainStructureJobProcessorOptions }
  | { ok: false; reason: string; errors: string[] }
> {
  const configured = env[WORKSPACE_BRAIN_PROCESSOR_OPTIONS_ENV_KEY];
  if (configured === undefined) {
    const fromRuntimeBindings = createWorkspaceBrainStructureJobProcessorOptions({
      env,
      now: command.now,
    });
    if (!fromRuntimeBindings.ok) {
      return {
        ok: false,
        reason: 'workspace_brain_ports_not_configured',
        errors: fromRuntimeBindings.errors,
      };
    }

    return {
      ok: true,
      options: fromRuntimeBindings.options,
    };
  }

  try {
    const options = typeof configured === 'function'
      ? await (configured as WorkspaceBrainStructureJobProcessorOptionsProvider)({ env, command })
      : configured;
    if (options === undefined) {
      return {
        ok: false,
        reason: 'workspace_brain_ports_not_configured',
        errors: ['workspace brain processor ports are not configured'],
      };
    }

    return {
      ok: true,
      options: options as WorkspaceBrainStructureJobProcessorOptions,
    };
  } catch (error) {
    void error;
    return {
      ok: false,
      reason: 'workspace_brain_ports_not_configured',
      errors: ['workspace brain processor ports are not configured'],
    };
  }
}
