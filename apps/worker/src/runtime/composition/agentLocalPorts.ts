import { AgentLocalOperationAuditRecoveryQueueAdapter } from '../../ai-operations/operationAuditRecoveryAgentLocalSqlAdapter.ts';
import { AgentLocalStructureJobWorkQueueAdapter } from '../../scheduler/structureJobWorkQueueAgentLocalSqlAdapter.ts';
import {
  AgentLocalNextOpenDigestPreparationAdapter,
  AgentLocalStructureJobQueueAdapter,
} from '../../scheduler/schedulerAgentLocalSqlAdapter.ts';
import { AgentLocalNextOpenDigestReadAdapter } from '../../scheduler/nextOpenDigestReadPort.ts';
import { TursoSchedulerNoteSnapshotAdapter } from '../../scheduler/schedulerNoteSnapshotSqlAdapter.ts';
import { WorkerTursoSqlExecutor, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export function createAgentLocalPorts(agentLocalClient: WorkerTursoClient | undefined): {
  digestRead?: AgentLocalNextOpenDigestReadAdapter;
  noteStructure?: {
    noteSnapshot: TursoSchedulerNoteSnapshotAdapter;
    structureJobQueue: AgentLocalStructureJobQueueAdapter;
    nextOpenDigestPreparation: AgentLocalNextOpenDigestPreparationAdapter;
  };
  structureJobWorkQueue?: AgentLocalStructureJobWorkQueueAdapter;
  auditRecoveryQueue?: AgentLocalOperationAuditRecoveryQueueAdapter;
} {
  if (agentLocalClient === undefined) {
    return {};
  }

  const agentLocalExecutor = new WorkerTursoSqlExecutor(agentLocalClient);
  return {
    digestRead: new AgentLocalNextOpenDigestReadAdapter(agentLocalExecutor),
    structureJobWorkQueue: new AgentLocalStructureJobWorkQueueAdapter(agentLocalExecutor),
    auditRecoveryQueue: new AgentLocalOperationAuditRecoveryQueueAdapter(agentLocalExecutor),
  };
}

export function createSchedulerAgentLocalNoteStructurePorts(input: {
  tursoClient: WorkerTursoClient;
  agentLocalClient: WorkerTursoClient;
}) {
  const tursoExecutor = new WorkerTursoSqlExecutor(input.tursoClient);
  const agentLocalExecutor = new WorkerTursoSqlExecutor(input.agentLocalClient);
  return {
    noteSnapshot: createSchedulerNoteSnapshotPort(tursoExecutor, agentLocalExecutor),
    structureJobQueue: new AgentLocalStructureJobQueueAdapter(agentLocalExecutor),
    nextOpenDigestPreparation: new AgentLocalNextOpenDigestPreparationAdapter(agentLocalExecutor),
  };
}

function createSchedulerNoteSnapshotPort(
  tursoExecutor: WorkerTursoSqlExecutor,
  agentLocalExecutor: WorkerTursoSqlExecutor,
): TursoSchedulerNoteSnapshotAdapter {
  return new TursoSchedulerNoteSnapshotAdapter({
    sectionExecutor: tursoExecutor,
    dirtyMarkExecutor: agentLocalExecutor,
  });
}
