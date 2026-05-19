// Default Worker runtime port wiring for Turso and Agent-local bindings.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md

import { TursoContextAssemblyLocalStructureSqlAdapter } from './contextAssemblyLocalStructureSqlAdapter.ts';
import { TursoContextAssemblyMemoryContextSqlAdapter } from './contextAssemblyMemoryContextSqlAdapter.ts';
import { TursoContextAssemblyRelatedContextSqlAdapter } from './contextAssemblyRelatedContextSqlAdapter.ts';
import { TursoContextAssemblyTargetSnapshotAdapter } from './contextAssemblyTargetSnapshotSqlAdapter.ts';
import { TursoMemoryReviewSqlAdapter } from './memoryReviewPort.ts';
import {
  type MemoryCandidateSqlStatement,
  TursoMemoryCandidatePersistenceAdapter,
} from './memoryCandidateProposalBoundary.ts';
import { AgentLocalNextOpenDigestReadAdapter } from './nextOpenDigestReadPort.ts';
import { NoteDocumentBlockCommandPort } from './noteBlockCommandPort.ts';
import {
  type NoteDocumentSqlStatement,
  TursoNoteDocumentPersistenceAdapter,
} from './noteDocumentSqlAdapter.ts';
import {
  type OperationProposalSqlStatement,
  TursoOperationProposalSqlAdapter,
} from './operationProposalSqlAdapter.ts';
import { OperationAuditSqlPersistenceAdapter } from './operationAuditSqlAdapter.ts';
import { AgentLocalOperationAuditRecoveryQueueAdapter } from './operationAuditRecoveryAgentLocalSqlAdapter.ts';
import type { OperationGenerationProviderRegistry } from './operationGenerationProviderFlow.ts';
import {
  type ProvenanceLookupSqlStatement,
  TursoProvenanceLookupSqlAdapter,
} from './provenanceLookupPort.ts';
import {
  AgentLocalNextOpenDigestPreparationAdapter,
  AgentLocalStructureJobQueueAdapter,
  type SchedulerAgentLocalSqlStatement,
} from './schedulerAgentLocalSqlAdapter.ts';
import {
  type SchedulerNoteSnapshotSqlStatement,
  TursoSchedulerNoteSnapshotAdapter,
} from './schedulerNoteSnapshotSqlAdapter.ts';
import { AgentLocalStructureJobWorkQueueAdapter } from './structureJobWorkQueueAgentLocalSqlAdapter.ts';
import type { StructureJobProcessorFlowInput } from './structureJobProcessorFlow.ts';
import { TursoOperationAuditExecutor } from './tursoOperationAuditExecutor.ts';
import { type WorkerHttpRouterPorts } from './workerHttpRouter.ts';

type WorkerSqlStatement =
  | NoteDocumentSqlStatement
  | SchedulerAgentLocalSqlStatement
  | SchedulerNoteSnapshotSqlStatement
  | MemoryCandidateSqlStatement
  | OperationProposalSqlStatement
  | ProvenanceLookupSqlStatement
  | {
      sql: string;
      args: readonly unknown[];
    };

export interface WorkerRuntimePortEnv {
  TURSO?: WorkerTursoClient;
  TURSO_CLIENT?: WorkerTursoClient;
  AGENT_LOCAL_SQL?: WorkerTursoClient;
  WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY?: OperationGenerationProviderRegistry;
  WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT?: StructureJobProcessorFlowInput['operationFlow']['snapshot'];
  [key: string]: unknown;
}

export interface WorkerTursoClient {
  execute(statement: { sql: string; args: readonly unknown[] }): Promise<unknown>;
}

export function createWorkerRuntimePorts(input: {
  env: WorkerRuntimePortEnv;
}): WorkerHttpRouterPorts {
  const tursoClient = readTursoClient(input.env.TURSO) ?? readTursoClient(input.env.TURSO_CLIENT);
  const agentLocalClient = readTursoClient(input.env.AGENT_LOCAL_SQL);
  const tursoExecutor = tursoClient === undefined ? undefined : new WorkerTursoSqlExecutor(tursoClient);
  const agentLocalExecutor = agentLocalClient === undefined ? undefined : new WorkerTursoSqlExecutor(agentLocalClient);

  const noteDocument = tursoExecutor === undefined
    ? undefined
    : new TursoNoteDocumentPersistenceAdapter(tursoExecutor);
  const noteBlocks = noteDocument === undefined
    ? undefined
    : new NoteDocumentBlockCommandPort(noteDocument);
  const digestRead = agentLocalExecutor === undefined
    ? undefined
    : new AgentLocalNextOpenDigestReadAdapter(agentLocalExecutor);
  const memoryReview = tursoExecutor === undefined
    ? undefined
    : new TursoMemoryReviewSqlAdapter({ executor: tursoExecutor });
  const memoryCandidatePersistence = tursoExecutor === undefined
    ? undefined
    : new TursoMemoryCandidatePersistenceAdapter({ executor: tursoExecutor });
  const operationApproval = tursoExecutor === undefined
    ? undefined
    : new TursoOperationProposalSqlAdapter({ executor: tursoExecutor });
  const provenanceLookup = tursoExecutor === undefined
    ? undefined
    : new TursoProvenanceLookupSqlAdapter({ executor: tursoExecutor });
  const noteStructure = tursoExecutor === undefined || agentLocalExecutor === undefined
    ? undefined
    : {
        noteSnapshot: new TursoSchedulerNoteSnapshotAdapter({
          sectionExecutor: tursoExecutor,
          dirtyMarkExecutor: agentLocalExecutor,
        }),
        structureJobQueue: new AgentLocalStructureJobQueueAdapter(agentLocalExecutor),
        nextOpenDigestPreparation: new AgentLocalNextOpenDigestPreparationAdapter(agentLocalExecutor),
      };

  return {
    ...(noteDocument === undefined ? {} : { noteDocument }),
    ...(noteBlocks === undefined ? {} : { noteBlocks }),
    ...(digestRead === undefined ? {} : { digestRead }),
    ...(memoryReview === undefined ? {} : { memoryReview }),
    ...(memoryCandidatePersistence === undefined ? {} : { memoryCandidatePersistence }),
    ...(operationApproval === undefined ? {} : { operationApproval }),
    ...(provenanceLookup === undefined ? {} : { provenanceLookup }),
    ...(noteStructure === undefined ? {} : { noteStructure }),
  };
}

export type WorkerWorkspaceBrainStructureJobProcessorOptions = Pick<
  StructureJobProcessorFlowInput,
  'workQueue' | 'contextAssemblyPorts' | 'providerRegistry' | 'operationFlow' | 'limits'
>;

export type WorkerWorkspaceBrainProcessorOptionsResult =
  | { ok: true; options: WorkerWorkspaceBrainStructureJobProcessorOptions }
  | { ok: false; errors: string[] };

export function createWorkspaceBrainStructureJobProcessorOptions(input: {
  env: WorkerRuntimePortEnv;
  now: number;
}): WorkerWorkspaceBrainProcessorOptionsResult {
  const tursoClient = readTursoClient(input.env.TURSO) ?? readTursoClient(input.env.TURSO_CLIENT);
  const agentLocalClient = readTursoClient(input.env.AGENT_LOCAL_SQL);
  const providerRegistry = readProviderRegistry(input.env.WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY);
  const snapshot = readOperationRouterSnapshot(input.env.WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT);
  const errors: string[] = [];

  if (tursoClient === undefined) {
    errors.push('workspace brain Turso binding is not configured');
  }
  if (agentLocalClient === undefined) {
    errors.push('workspace brain Agent-local SQL binding is not configured');
  }
  if (providerRegistry === undefined) {
    errors.push('workspace brain provider registry is not configured');
  }
  if (snapshot === undefined) {
    errors.push('workspace brain operation router snapshot is not configured');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('workspace brain processor now must be a finite number');
  }
  if (
    errors.length > 0 ||
    tursoClient === undefined ||
    agentLocalClient === undefined ||
    providerRegistry === undefined ||
    snapshot === undefined
  ) {
    return { ok: false, errors };
  }

  const tursoExecutor = new WorkerTursoSqlExecutor(tursoClient);
  const agentLocalExecutor = new WorkerTursoSqlExecutor(agentLocalClient);

  return {
    ok: true,
    options: {
      workQueue: new AgentLocalStructureJobWorkQueueAdapter(agentLocalExecutor),
      contextAssemblyPorts: {
        targetSnapshot: new TursoContextAssemblyTargetSnapshotAdapter({ executor: tursoExecutor }),
        localStructure: new TursoContextAssemblyLocalStructureSqlAdapter({ executor: tursoExecutor }),
        relatedContext: new TursoContextAssemblyRelatedContextSqlAdapter({ executor: tursoExecutor }),
        memoryContext: new TursoContextAssemblyMemoryContextSqlAdapter({ executor: tursoExecutor }),
      },
      providerRegistry,
      operationFlow: {
        snapshot,
        auditPersistence: new OperationAuditSqlPersistenceAdapter(
          new TursoOperationAuditExecutor(tursoClient),
        ),
        auditRecoveryQueue: new AgentLocalOperationAuditRecoveryQueueAdapter(agentLocalExecutor),
        now: input.now,
        generatedBy: 'worker_runtime',
      },
    },
  };
}

export class WorkerTursoSqlExecutor {
  private readonly client: WorkerTursoClient;

  constructor(client: WorkerTursoClient) {
    this.client = client;
  }

  async execute(statement: WorkerSqlStatement): Promise<unknown> {
    return this.client.execute({
      sql: statement.sql,
      args: statement.args,
    });
  }

  async query(statement: WorkerSqlStatement): Promise<readonly Record<string, unknown>[]> {
    const result = await this.execute(statement);
    return readRows(result);
  }

  async write(statement: WorkerSqlStatement): Promise<void | { rowsAffected?: number; changes?: number }> {
    const result = await this.execute(statement);
    if (!isRecord(result)) {
      return undefined;
    }
    return {
      ...(typeof result.rowsAffected === 'number' ? { rowsAffected: result.rowsAffected } : {}),
      ...(typeof result.changes === 'number' ? { changes: result.changes } : {}),
    };
  }

  async writeNoteDocument(statements: readonly NoteDocumentSqlStatement[]): Promise<void> {
    if (statements.length === 0) {
      throw new Error('note document SQL statements must not be empty');
    }

    for (const statement of statements) {
      await this.execute(statement);
    }
  }
}

function readRows(result: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.filter(isRecord);
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result.rows.filter(isRecord);
  }
  if (isRecord(result) && Array.isArray(result.results)) {
    return result.results.filter(isRecord);
  }
  return [];
}

function readTursoClient(value: unknown): WorkerTursoClient | undefined {
  return isRecord(value) && typeof value.execute === 'function'
    ? value as unknown as WorkerTursoClient
    : undefined;
}

function readProviderRegistry(value: unknown): OperationGenerationProviderRegistry | undefined {
  return isRecord(value) && typeof value.resolveProvider === 'function'
    ? value as unknown as OperationGenerationProviderRegistry
    : undefined;
}

function readOperationRouterSnapshot(
  value: unknown,
): StructureJobProcessorFlowInput['operationFlow']['snapshot'] | undefined {
  return isRecord(value)
    ? value as unknown as StructureJobProcessorFlowInput['operationFlow']['snapshot']
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
