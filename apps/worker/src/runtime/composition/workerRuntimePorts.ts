// Default Worker runtime port wiring for Turso and Agent-local bindings.
// Authority: docs/contracts/backend-runtime.md

import type { WorkerHttpRouterPorts } from '../http/workerHttpRouter.ts';
import { createAiOperationPorts } from './aiOperationPorts.ts';
import { createAgentLocalPorts, createSchedulerAgentLocalNoteStructurePorts } from './agentLocalPorts.ts';
import { createContextAssemblyPorts } from './contextAssemblyPorts.ts';
import {
  createNoteAgentStructureRoutePort,
  readNoteAgentNamespaceFromEnv,
  readWorkspaceBrainAgentNamespaceFromEnv,
} from './cloudflareNoteAgentRoutePort.ts';
import { createMemoryPorts } from './memoryPorts.ts';
import { createNoteModelPorts } from './noteModelPorts.ts';
import { resolveWorkerTursoClient } from './workerTursoClientFactory.ts';
import { readTursoClient, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export type { WorkerTursoClient } from './workerTursoSqlExecutor.ts';
export {
  createWorkspaceBrainStructureJobProcessorOptions,
  type WorkerWorkspaceBrainStructureJobProcessorOptions,
  type WorkerWorkspaceBrainProcessorOptionsResult,
} from './workspaceBrainProcessorOptions.ts';

export type { WorkerRuntimePortEnv } from './workerRuntimePortEnv.ts';
import type { WorkerRuntimePortEnv } from './workerRuntimePortEnv.ts';

export function createWorkerRuntimePorts(input: {
  env: WorkerRuntimePortEnv;
  agentLocalSql?: WorkerTursoClient;
}): WorkerHttpRouterPorts {
  const tursoClient = resolveWorkerTursoClient(input.env);
  const agentLocalClient = readTursoClient(input.agentLocalSql) ?? readTursoClient(input.env.AGENT_LOCAL_SQL);
  const noteAgent = readNoteAgentNamespaceFromEnv(input.env);
  const workspaceBrainAgent = readWorkspaceBrainAgentNamespaceFromEnv(input.env);

  const noteModel = createNoteModelPorts(tursoClient);
  const memory = createMemoryPorts(tursoClient);
  const aiOperations = createAiOperationPorts(tursoClient);
  const agentLocal = createAgentLocalPorts(agentLocalClient);
  const noteStructure = tursoClient !== undefined && agentLocalClient !== undefined
    ? createSchedulerAgentLocalNoteStructurePorts({
        tursoClient,
        agentLocalClient,
      })
    : undefined;
  const noteStructureRoute = noteAgent === undefined
    ? undefined
    : createNoteAgentStructureRoutePort(noteAgent, workspaceBrainAgent);

  return {
    ...(noteModel.noteDocument === undefined ? {} : { noteDocument: noteModel.noteDocument }),
    ...(noteModel.noteBlocks === undefined ? {} : { noteBlocks: noteModel.noteBlocks }),
    ...(agentLocal.digestRead === undefined ? {} : { digestRead: agentLocal.digestRead }),
    ...(memory.memoryReview === undefined ? {} : { memoryReview: memory.memoryReview }),
    ...(memory.memoryCandidatePersistence === undefined
      ? {}
      : { memoryCandidatePersistence: memory.memoryCandidatePersistence }),
    ...(aiOperations.operationApproval === undefined
      ? {}
      : { operationApproval: aiOperations.operationApproval }),
    ...(noteModel.provenanceLookup === undefined ? {} : { provenanceLookup: noteModel.provenanceLookup }),
    ...(noteStructureRoute === undefined ? {} : { noteStructureRoute }),
    ...(noteStructure === undefined ? {} : { noteStructure }),
  };
}
