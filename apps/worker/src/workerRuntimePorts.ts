// Default Worker runtime port wiring for Turso and Agent-local bindings.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
