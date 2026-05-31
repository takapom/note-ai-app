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
import { readAgentLocalSqlLifecycle } from './agentLocalSqlLifecycle.ts';
import type { CloudflareDurableObjectAgentLocalSqlExecutor } from './cloudflareDurableObjectSqlAdapter.ts';
import {
  runDurableObjectAgentLocalSchemaCommand,
  type DurableObjectAgentLocalSchemaCommand,
  type DurableObjectAgentLocalSchemaResult,
} from './durableObjectAgentLocalSchema.ts';
import {
  rejectedRpcResult,
  rejectedSchemaCommandResult,
  type CloudflareAgentRpcResult,
} from './agentRpcResults.ts';
import {
  localSmokeWorkspaceBrainRpcObservedResult,
  mapNoteStructureRouteHandlerResultToRpc,
  mapWorkspaceBrainProcessorResultToRpc,
} from './cloudflareDurableObjectRpcMapping.ts';
import {
  persistWorkspaceBrainAlarmProcessCommand,
  readWorkspaceBrainAlarmProcessCommand,
  scheduleWorkspaceBrainProcessingAlarm,
  shouldScheduleNextWorkspaceBrainAlarm,
} from './cloudflareDurableObjectAlarm.ts';
import {
  type NoteLeaveCause,
  type NoteStructureRouteKind,
} from './noteStructureRouteRpcTypes.ts';
import {
  createWorkerRuntimePorts,
  createWorkspaceBrainStructureJobProcessorOptions,
} from '../composition/workerRuntimePorts.ts';
import {
  enqueueWorkspaceBrainStructureJobs,
  type WorkspaceBrainStructureJobsDispatchCommand,
} from '../composition/workspaceBrainStructureJobDispatch.ts';
import { type WorkerEntrypointEnv } from '../composition/workerEntrypointEnv.ts';
import {
  LocalSmokeSchedulerSnapshotStore,
  persistLocalSmokeSchedulerSnapshot,
  readLocalSmokeSchedulerSnapshot,
  type LocalSmokeSchedulerSnapshotCommand,
} from '../local-verification/localSmokeSchedulerPorts.ts';

export type {
  NoteLeaveCause,
  NoteStructureRouteKind,
  LocalSmokeSchedulerSnapshotCommand,
};

export interface NoteAgentScheduleStructureCommand {
  workspaceId: string;
  noteId: string;
  route: NoteStructureRouteKind;
  cause?: NoteLeaveCause;
  now: number;
}

export type WorkspaceBrainEnqueueStructureJobsCommand = WorkspaceBrainStructureJobsDispatchCommand;

export type { CloudflareAgentRpcResult } from './agentRpcResults.ts';

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
  private readonly localSmokeSchedulerSnapshotStore = new LocalSmokeSchedulerSnapshotStore();

  constructor(ctx: DurableObjectState, env: WorkerEntrypointEnv) {
    super(ctx, env);
    this.workerEnv = env;
    this.storage = ctx.storage;
  }

  async scheduleNoteStructure(
    input: NoteAgentScheduleStructureCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const agentLocalSql = readAgentLocalSqlLifecycle({
      storage: this.storage,
      ...(this.agentLocalSql === undefined ? {} : { cachedExecutor: this.agentLocalSql }),
    });
    if (!agentLocalSql.ok) {
      return rejectedRpcResult('agent_local_sql_not_configured', agentLocalSql.errors);
    }
    this.agentLocalSql = agentLocalSql.executor;

    const localSmokePorts = await this.createLocalSmokeNoteStructurePorts(input.noteId, agentLocalSql.executor);
    const ports = localSmokePorts
      ?? createWorkerRuntimePorts({
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

    return mapNoteStructureRouteHandlerResultToRpc(result);
  }

  async applyAgentLocalSchemaCommand(
    input: DurableObjectAgentLocalSchemaCommand,
  ): Promise<DurableObjectAgentLocalSchemaResult> {
    const agentLocalSql = readAgentLocalSqlLifecycle({
      storage: this.storage,
      ...(this.agentLocalSql === undefined ? {} : { cachedExecutor: this.agentLocalSql }),
    });
    if (!agentLocalSql.ok) {
      return rejectedSchemaCommandResult(input, agentLocalSql.errors);
    }
    this.agentLocalSql = agentLocalSql.executor;

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

    const applied = this.localSmokeSchedulerSnapshotStore.applySnapshot(input);
    if (!applied.ok) {
      return applied;
    }

    return persistLocalSmokeSchedulerSnapshot({
      storage: this.storage,
      snapshot: input,
    });
  }

  private async createLocalSmokeNoteStructurePorts(
    noteId: string,
    agentLocalSql: CloudflareDurableObjectAgentLocalSqlExecutor,
  ) {
    if (!isLocalAgentSmokeEnabled(this.workerEnv)) {
      return undefined;
    }
    if (this.localSmokeSchedulerSnapshotStore.hasSnapshot(noteId)) {
      return this.localSmokeSchedulerSnapshotStore.createNoteStructurePorts(noteId, agentLocalSql);
    }

    const persisted = await readLocalSmokeSchedulerSnapshot({
      storage: this.storage,
      noteId,
    });
    if (!persisted.ok || persisted.snapshot === undefined) {
      return undefined;
    }

    const applied = this.localSmokeSchedulerSnapshotStore.applySnapshot(persisted.snapshot);
    return applied.ok
      ? this.localSmokeSchedulerSnapshotStore.createNoteStructurePorts(noteId, agentLocalSql)
      : undefined;
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

  async enqueueStructureJobs(
    input: WorkspaceBrainEnqueueStructureJobsCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const agentLocalSql = readAgentLocalSqlLifecycle({
      storage: this.storage,
      ...(this.agentLocalSql === undefined ? {} : { cachedExecutor: this.agentLocalSql }),
    });
    if (!agentLocalSql.ok) {
      return rejectedRpcResult('agent_local_sql_not_configured', agentLocalSql.errors);
    }
    this.agentLocalSql = agentLocalSql.executor;

    const result = await enqueueWorkspaceBrainStructureJobs({
      executor: agentLocalSql.executor,
      command: input,
    });
    if (!result.ok) {
      return result;
    }

    const command = await persistWorkspaceBrainAlarmProcessCommand({
      storage: this.storage,
      command: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    });
    const alarm = command.ok
      ? await scheduleWorkspaceBrainProcessingAlarm({
          storage: this.storage,
          now: input.now,
        })
      : command;
    if (!alarm.ok) {
      return {
        ...result,
        ok: false,
        accepted: false,
        reason: 'workspace_brain_alarm_schedule_failed',
        errors: alarm.errors,
      };
    }

    return result;
  }

  async alarm(): Promise<CloudflareAgentRpcResult> {
    const command = await readWorkspaceBrainAlarmProcessCommand({ storage: this.storage });
    if (!command.ok) {
      return rejectedRpcResult('workspace_brain_alarm_command_not_configured', command.errors);
    }

    const now = Date.now();
    const result = await this.processNextQueuedStructureJob({
      ...command.command,
      now,
    });
    if (!shouldScheduleNextWorkspaceBrainAlarm(result)) {
      return result;
    }

    const alarm = await scheduleWorkspaceBrainProcessingAlarm({
      storage: this.storage,
      now,
    });
    if (!alarm.ok) {
      return {
        ...result,
        ok: false,
        accepted: false,
        reason: 'workspace_brain_alarm_reschedule_failed',
        errors: alarm.errors,
      };
    }

    return result;
  }

  async processNextQueuedStructureJob(
    input: WorkspaceBrainProcessNextStructureJobCommand,
  ): Promise<CloudflareAgentRpcResult> {
    const agentLocalSql = readAgentLocalSqlLifecycle({
      storage: this.storage,
      ...(this.agentLocalSql === undefined ? {} : { cachedExecutor: this.agentLocalSql }),
    });
    if (!agentLocalSql.ok) {
      return rejectedRpcResult('agent_local_sql_not_configured', agentLocalSql.errors);
    }
    this.agentLocalSql = agentLocalSql.executor;

    const options = await readWorkspaceBrainProcessorOptions(this.workerEnv, input, agentLocalSql.executor);
    if (!options.ok) {
      if (isLocalAgentSmokeEnabled(this.workerEnv)) {
        return localSmokeWorkspaceBrainRpcObservedResult();
      }
      return rejectedRpcResult(options.reason, options.errors);
    }

    const result = await this.runtimeDelegate.processNextQueuedStructureJob(input, options.options);
    return mapWorkspaceBrainProcessorResultToRpc(result);
  }

  async applyAgentLocalSchemaCommand(
    input: DurableObjectAgentLocalSchemaCommand,
  ): Promise<DurableObjectAgentLocalSchemaResult> {
    const agentLocalSql = readAgentLocalSqlLifecycle({
      storage: this.storage,
      ...(this.agentLocalSql === undefined ? {} : { cachedExecutor: this.agentLocalSql }),
    });
    if (!agentLocalSql.ok) {
      return rejectedSchemaCommandResult(input, agentLocalSql.errors);
    }
    this.agentLocalSql = agentLocalSql.executor;

    return runDurableObjectAgentLocalSchemaCommand({
      executor: agentLocalSql.executor,
      command: input,
      localVerificationEnabled: isLocalAgentSmokeEnabled(this.workerEnv),
    });
  }
}

function isLocalAgentSmokeEnabled(env: WorkerEntrypointEnv): boolean {
  return env.LOCAL_AGENT_SMOKE_ENABLED === '1';
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
      workspaceId: command.workspaceId,
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
  } catch {
    return {
      ok: false,
      reason: 'workspace_brain_ports_not_configured',
      errors: ['workspace brain processor ports are not configured'],
    };
  }
}
