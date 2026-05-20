import { TursoOperationProposalSqlAdapter } from '../../ai-operations/operationProposalSqlAdapter.ts';
import { WorkerTursoSqlExecutor, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export function createAiOperationPorts(tursoClient: WorkerTursoClient | undefined): {
  operationApproval?: TursoOperationProposalSqlAdapter;
} {
  if (tursoClient === undefined) {
    return {};
  }

  return {
    operationApproval: new TursoOperationProposalSqlAdapter({
      executor: new WorkerTursoSqlExecutor(tursoClient),
    }),
  };
}
