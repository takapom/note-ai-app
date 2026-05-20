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
  CloudflareDurableObjectAgentLocalSqlExecutor,
} from './cloudflareDurableObjectSqlAdapter.ts';
import {
  runDurableObjectAgentLocalSchemaCommand,
  type DurableObjectAgentLocalSchemaCommand,
  type DurableObjectAgentLocalSchemaResult,
} from './durableObjectAgentLocalSchema.ts';
import {
  AgentLocalNextOpenDigestPreparationAdapter,
  AgentLocalStructureJobQueueAdapter,
} from './schedulerAgentLocalSqlAdapter.ts';
import {
  type NoteLeaveCause,
  type NoteStructureRouteKind,
} from './noteStructureRuntimeHandlers.ts';
import type { SectionContract } from '../../../contexts/note-model/src/contract/noteContract.ts';
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

export interface LocalSmokeSchedulerSnapshotCommand {
  purpose: 'local_verification';
  noteId: string;
  sections: readonly SectionContract[];
}

export interface CloudflareAgentRpcResult {
  ok: boolean;
  accepted: boolean;
  reason: string;
  scheduledJobIds: readonly string[];
  scheduledJobs?: Awaited<ReturnType<NoteAgentRuntimeDelegate['handleNoteStructureRoute']>>['scheduledJobs'];
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
  private readonly storage: unknown;
  private agentLocalSql?: CloudflareDurableObjectAgentLocalSqlExecutor;
  private readonly localSmokeSectionsByNoteId = new Map<string, readonly SectionContract[]>();

  constructor(ctx: DurableObjectState, env: WorkerEntrypointEnv) {
    super(ctx, env);
    this.workerEnv = env;
    this.storage = ctx.storage;
  }

  async scheduleNoteStructure(
    input: NoteAgentScheduleStructureCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const agentLocalSql = this.readAgentLocalSql();
    if (!agentLocalSql.ok) {
      return rejectedRpcResult('agent_local_sql_not_configured', agentLocalSql.errors);
    }

    const ports = this.localSmokeSectionsByNoteId.has(input.noteId)
      ? this.createLocalSmokeNoteStructurePorts(input.noteId)
      : createWorkerRuntimePorts({
          env: this.workerEnv,
          agentLocalSql: agentLocalSql.executor,
        }).noteStructure;
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
      scheduledJobs: result.scheduledJobs,
      providerCalls: result.providerCalls,
      operationRoutingCalls: result.operationRoutingCalls,
      auditWrites: result.auditWrites,
      noteSotMutations: [],
      errors: result.errors,
    };
  }

  async applyAgentLocalSchemaCommand(
    input: DurableObjectAgentLocalSchemaCommand,
  ): Promise<DurableObjectAgentLocalSchemaResult> {
    const agentLocalSql = this.readAgentLocalSql();
    if (!agentLocalSql.ok) {
      return rejectedSchemaCommandResult(input, agentLocalSql.errors);
    }

    return runDurableObjectAgentLocalSchemaCommand({
      executor: agentLocalSql.executor,
      command: input,
      localVerificationEnabled: isLocalAgentSmokeEnabled(this.workerEnv),
    });
  }

  async applyLocalSmokeSchedulerSnapshot(
    input: LocalSmokeSchedulerSnapshotCommand,
  ): Promise<{ ok: boolean; errors: string[] }> {
    if (!isLocalAgentSmokeEnabled(this.workerEnv)) {
      return { ok: false, errors: ['local smoke scheduler snapshot is available only for local verification'] };
    }
    if (
      input.purpose !== 'local_verification' ||
      typeof input.noteId !== 'string' ||
      !Array.isArray(input.sections)
    ) {
      return { ok: false, errors: ['local smoke scheduler snapshot command is invalid'] };
    }

    this.localSmokeSectionsByNoteId.set(input.noteId, structuredClone(input.sections));
    return { ok: true, errors: [] };
  }

  private createLocalSmokeNoteStructurePorts(noteId: string) {
    const agentLocalSql = this.readAgentLocalSql();
    if (!agentLocalSql.ok) {
      throw new Error('Agent-local SQL storage is not configured');
    }

    return {
      noteSnapshot: {
        loadSections: async () => [...structuredClone(this.localSmokeSectionsByNoteId.get(noteId) ?? [])],
      },
      structureJobQueue: new AgentLocalStructureJobQueueAdapter(agentLocalSql.executor),
      nextOpenDigestPreparation: new AgentLocalNextOpenDigestPreparationAdapter(agentLocalSql.executor),
    };
  }

  private readAgentLocalSql():
    | { ok: true; executor: CloudflareDurableObjectAgentLocalSqlExecutor }
    | { ok: false; errors: string[] } {
    if (this.agentLocalSql !== undefined) {
      return { ok: true, executor: this.agentLocalSql };
    }

    try {
      this.agentLocalSql = new CloudflareDurableObjectAgentLocalSqlExecutor(this.storage);
      return { ok: true, executor: this.agentLocalSql };
    } catch {
      return { ok: false, errors: ['Agent-local SQL storage is not configured'] };
    }
  }
}

export class WorkspaceBrainAgent extends DurableObject<WorkerEntrypointEnv> {
  readonly descriptor = workspaceBrainAgentBindingDescriptor;
  private readonly runtimeDelegate = new WorkspaceBrainAgentRuntimeDelegate();
  private readonly workerEnv: WorkerEntrypointEnv;
  private readonly storage: unknown;
  private agentLocalSql?: CloudflareDurableObjectAgentLocalSqlExecutor;

  constructor(ctx: DurableObjectState, env: WorkerEntrypointEnv) {
    super(ctx, env);
    this.workerEnv = env;
    this.storage = ctx.storage;
  }

  async processNextQueuedStructureJob(
    input: WorkspaceBrainProcessNextStructureJobCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const agentLocalSql = this.readAgentLocalSql();
    if (!agentLocalSql.ok) {
      return rejectedRpcResult('agent_local_sql_not_configured', agentLocalSql.errors);
    }

    const options = await readWorkspaceBrainProcessorOptions(this.workerEnv, input, agentLocalSql.executor);
    if (!options.ok) {
      if (isLocalAgentSmokeEnabled(this.workerEnv)) {
        return {
          ok: true,
          accepted: true,
          reason: 'local_smoke_workspace_brain_rpc_observed',
          scheduledJobIds: [],
          providerCalls: [],
          operationRoutingCalls: [],
          auditWrites: [],
          noteSotMutations: [],
          errors: [],
        };
      }
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

  async applyAgentLocalSchemaCommand(
    input: DurableObjectAgentLocalSchemaCommand,
  ): Promise<DurableObjectAgentLocalSchemaResult> {
    const agentLocalSql = this.readAgentLocalSql();
    if (!agentLocalSql.ok) {
      return rejectedSchemaCommandResult(input, agentLocalSql.errors);
    }

    return runDurableObjectAgentLocalSchemaCommand({
      executor: agentLocalSql.executor,
      command: input,
      localVerificationEnabled: isLocalAgentSmokeEnabled(this.workerEnv),
    });
  }

  private readAgentLocalSql():
    | { ok: true; executor: CloudflareDurableObjectAgentLocalSqlExecutor }
    | { ok: false; errors: string[] } {
    if (this.agentLocalSql !== undefined) {
      return { ok: true, executor: this.agentLocalSql };
    }

    try {
      this.agentLocalSql = new CloudflareDurableObjectAgentLocalSqlExecutor(this.storage);
      return { ok: true, executor: this.agentLocalSql };
    } catch {
      return { ok: false, errors: ['Agent-local SQL storage is not configured'] };
    }
  }
}

function isLocalAgentSmokeEnabled(env: WorkerEntrypointEnv): boolean {
  return env.LOCAL_AGENT_SMOKE_ENABLED === '1';
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

function rejectedSchemaCommandResult(
  command: unknown,
  errors: string[],
): DurableObjectAgentLocalSchemaResult {
  return {
    ok: false,
    action: isResetSchemaCommand(command) ? 'reset' : 'initialize',
    initializedTables: [],
    droppedTables: [],
    errors,
  };
}

function isResetSchemaCommand(command: unknown): boolean {
  return typeof command === 'object'
    && command !== null
    && !Array.isArray(command)
    && (command as { action?: unknown }).action === 'reset';
}

async function readWorkspaceBrainProcessorOptions(
  env: WorkerEntrypointEnv,
  command: WorkspaceBrainProcessNextStructureJobCommand,
  agentLocalSql: CloudflareDurableObjectAgentLocalSqlExecutor,
): Promise<
  | { ok: true; options: WorkspaceBrainStructureJobProcessorOptions }
  | { ok: false; reason: string; errors: string[] }
> {
  const configured = env[WORKSPACE_BRAIN_PROCESSOR_OPTIONS_ENV_KEY];
  if (configured === undefined) {
    const fromRuntimeBindings = createWorkspaceBrainStructureJobProcessorOptions({
      env,
      agentLocalSql,
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
