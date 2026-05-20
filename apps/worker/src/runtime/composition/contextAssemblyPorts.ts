import { TursoContextAssemblyLocalStructureSqlAdapter } from '../../context-assembly/contextAssemblyLocalStructureSqlAdapter.ts';
import { TursoContextAssemblyMemoryContextSqlAdapter } from '../../context-assembly/contextAssemblyMemoryContextSqlAdapter.ts';
import { TursoContextAssemblyRelatedContextSqlAdapter } from '../../context-assembly/contextAssemblyRelatedContextSqlAdapter.ts';
import { TursoContextAssemblyTargetSnapshotAdapter } from '../../context-assembly/contextAssemblyTargetSnapshotSqlAdapter.ts';
import { WorkerTursoSqlExecutor, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export function createContextAssemblyPorts(tursoClient: WorkerTursoClient | undefined) {
  if (tursoClient === undefined) {
    return undefined;
  }

  const tursoExecutor = new WorkerTursoSqlExecutor(tursoClient);
  return {
    targetSnapshot: new TursoContextAssemblyTargetSnapshotAdapter({ executor: tursoExecutor }),
    localStructure: new TursoContextAssemblyLocalStructureSqlAdapter({ executor: tursoExecutor }),
    relatedContext: new TursoContextAssemblyRelatedContextSqlAdapter({ executor: tursoExecutor }),
    memoryContext: new TursoContextAssemblyMemoryContextSqlAdapter({ executor: tursoExecutor }),
  };
}
