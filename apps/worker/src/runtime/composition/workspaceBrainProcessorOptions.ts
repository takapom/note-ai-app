import { OperationAuditSqlPersistenceAdapter } from '../../ai-operations/operationAuditSqlAdapter.ts';
import {
  InMemoryOperationAuditPersistencePort,
  type OperationAuditPersistencePort,
} from '../../ai-operations/operationAuditPort.ts';
import type { OperationGenerationProviderRegistry } from '../../ai-operations/operationGenerationProviderFlow.ts';
import { TursoOperationAuditExecutor } from '../../ai-operations/tursoOperationAuditExecutor.ts';
import type { StructureJobProcessorFlowInput } from '../../ai-operations/structure-job/structureJobProcessorFlow.ts';
import { createAgentLocalPorts } from './agentLocalPorts.ts';
import { createContextAssemblyPorts } from './contextAssemblyPorts.ts';
import { resolveWorkerTursoClient } from './workerTursoClientFactory.ts';
import { readTursoClient } from './workerTursoSqlExecutor.ts';
import type { WorkerRuntimePortEnv } from './workerRuntimePortEnv.ts';
import {
  createLocalModelOperationProviderRegistry,
  hasLocalModelSmokeEnv,
  readLocalModelProviderConfigFromEnv,
} from '../local-verification/localModelOperationProvider.ts';
import { createLocalSmokeContextAssemblyPorts } from '../local-verification/localSmokeRuntime.ts';
import { createLocalSmokeOperationRouterSnapshotFromEnv } from '../local-verification/localSmokeOperationRouterSnapshot.ts';

export type WorkerWorkspaceBrainStructureJobProcessorOptions = Pick<
  StructureJobProcessorFlowInput,
  'workQueue' | 'contextAssemblyPorts' | 'providerRegistry' | 'operationFlow' | 'limits'
>;

export type WorkerWorkspaceBrainProcessorOptionsResult =
  | { ok: true; options: WorkerWorkspaceBrainStructureJobProcessorOptions }
  | { ok: false; errors: string[] };

export function createWorkspaceBrainStructureJobProcessorOptions(input: {
  env: WorkerRuntimePortEnv;
  agentLocalSql?: unknown;
  workspaceId?: string;
  now: number;
}): WorkerWorkspaceBrainProcessorOptionsResult {
  const tursoClient = resolveWorkerTursoClient(input.env);
  const agentLocalClient = readTursoClient(input.agentLocalSql) ?? readTursoClient(input.env.AGENT_LOCAL_SQL);
  const localModelConfig = readLocalModelProviderConfigFromEnv(input.env);
  const localSmokeContextAssemblyPorts = hasLocalModelSmokeEnv(input.env)
    ? createLocalSmokeContextAssemblyPorts({
        workspaceId: input.workspaceId,
        noteId: input.env.WORKER_SMOKE_NOTE_ID,
      })
    : undefined;
  const providerRegistry = readProviderRegistry(input.env.WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY)
    ?? readLocalModelProviderRegistry(localModelConfig);
  const contextAssemblyPorts = localSmokeContextAssemblyPorts ?? createContextAssemblyPorts(tursoClient);
  const snapshot = readOperationRouterSnapshot(input.env.WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT)
    ?? (hasLocalModelSmokeEnv(input.env) ? createLocalSmokeOperationRouterSnapshotFromEnv(input.env) : undefined);
  const errors: string[] = [];
  const missingTursoForRuntime = tursoClient === undefined && localSmokeContextAssemblyPorts === undefined;

  if (missingTursoForRuntime) {
    errors.push('workspace brain Turso binding is not configured');
  }
  if (agentLocalClient === undefined) {
    errors.push('workspace brain Agent-local SQL binding is not configured');
  }
  if (providerRegistry === undefined) {
    errors.push(...readProviderRegistryErrors(localModelConfig));
  }
  if (snapshot === undefined) {
    errors.push(hasLocalModelSmokeEnv(input.env)
      ? 'local smoke operation router snapshot is not configured'
      : 'workspace brain operation router snapshot is not configured');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('workspace brain processor now must be a finite number');
  }
  if (
    errors.length > 0 ||
    missingTursoForRuntime ||
    agentLocalClient === undefined ||
    providerRegistry === undefined ||
    snapshot === undefined
  ) {
    return { ok: false, errors };
  }

  const agentLocalPorts = createAgentLocalPorts(agentLocalClient);
  const auditPersistence = createOperationAuditPersistence({
    tursoClient,
    localSmokeContextAssemblyPorts,
  });
  if (
    agentLocalPorts.structureJobWorkQueue === undefined ||
    agentLocalPorts.auditRecoveryQueue === undefined ||
    contextAssemblyPorts === undefined ||
    auditPersistence === undefined
  ) {
    return { ok: false, errors: ['workspace brain runtime ports are not configured'] };
  }

  return {
    ok: true,
    options: {
      workQueue: agentLocalPorts.structureJobWorkQueue,
      contextAssemblyPorts,
      providerRegistry,
      operationFlow: {
        snapshot,
        auditPersistence,
        auditRecoveryQueue: agentLocalPorts.auditRecoveryQueue,
        now: input.now,
        generatedBy: 'worker_runtime',
      },
    },
  };
}

function createOperationAuditPersistence(input: {
  tursoClient: ReturnType<typeof resolveWorkerTursoClient>;
  localSmokeContextAssemblyPorts: ReturnType<typeof createLocalSmokeContextAssemblyPorts>;
}): OperationAuditPersistencePort | undefined {
  if (input.localSmokeContextAssemblyPorts !== undefined) {
    return new InMemoryOperationAuditPersistencePort();
  }
  if (input.tursoClient === undefined) {
    return undefined;
  }
  return new OperationAuditSqlPersistenceAdapter(
    new TursoOperationAuditExecutor(input.tursoClient),
  );
}

function readProviderRegistry(value: unknown): OperationGenerationProviderRegistry | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof (value as { resolveProvider?: unknown }).resolveProvider === 'function'
    ? value as OperationGenerationProviderRegistry
    : undefined;
}

function readLocalModelProviderRegistry(
  result: ReturnType<typeof readLocalModelProviderConfigFromEnv>,
): OperationGenerationProviderRegistry | undefined {
  return result?.ok === true
    ? createLocalModelOperationProviderRegistry(result.config)
    : undefined;
}

function readProviderRegistryErrors(
  result: ReturnType<typeof readLocalModelProviderConfigFromEnv>,
): string[] {
  if (result?.ok === false) {
    return result.errors;
  }
  return ['workspace brain provider registry is not configured'];
}

function readOperationRouterSnapshot(
  value: unknown,
): StructureJobProcessorFlowInput['operationFlow']['snapshot'] | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as StructureJobProcessorFlowInput['operationFlow']['snapshot']
    : undefined;
}
