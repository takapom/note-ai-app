import {
  TursoMemoryCandidatePersistenceAdapter,
  type MemoryCandidateSqlStatement,
} from '../../memory/memoryCandidateProposalBoundary.ts';
import { TursoMemoryReviewSqlAdapter } from '../../memory/memoryReviewPort.ts';
import { WorkerTursoSqlExecutor, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export function createMemoryPorts(tursoClient: WorkerTursoClient | undefined): {
  memoryReview?: TursoMemoryReviewSqlAdapter;
  memoryCandidatePersistence?: TursoMemoryCandidatePersistenceAdapter;
} {
  if (tursoClient === undefined) {
    return {};
  }

  const tursoExecutor = new WorkerTursoSqlExecutor(tursoClient);
  return {
    memoryReview: new TursoMemoryReviewSqlAdapter({ executor: tursoExecutor }),
    memoryCandidatePersistence: new TursoMemoryCandidatePersistenceAdapter({ executor: tursoExecutor }),
  };
}

export type { MemoryCandidateSqlStatement };
