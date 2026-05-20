import { OperationAuditSqlPersistenceAdapter } from '../../ai-operations/operationAuditSqlAdapter.ts';
import type { OperationGenerationProviderRegistry } from '../../ai-operations/operationGenerationProviderFlow.ts';
import { TursoOperationAuditExecutor } from '../../ai-operations/tursoOperationAuditExecutor.ts';
import type { StructureJobProcessorFlowInput } from '../../ai-operations/structure-job/structureJobProcessorFlow.ts';
import { createAgentLocalPorts } from './agentLocalPorts.ts';
import { createContextAssemblyPorts } from './contextAssemblyPorts.ts';
import { readTursoClient } from './workerTursoSqlExecutor.ts';
import type { WorkerRuntimePortEnv } from './workerRuntimePortEnv.ts';

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
  now: number;
}): WorkerWorkspaceBrainProcessorOptionsResult {
  const tursoClient = readTursoClient(input.env.TURSO) ?? readTursoClient(input.env.TURSO_CLIENT);
  const agentLocalClient = readTursoClient(input.agentLocalSql) ?? readTursoClient(input.env.AGENT_LOCAL_SQL);
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

  const agentLocalPorts = createAgentLocalPorts(agentLocalClient);
  const contextAssemblyPorts = createContextAssemblyPorts(tursoClient);
  if (
    agentLocalPorts.structureJobWorkQueue === undefined ||
    agentLocalPorts.auditRecoveryQueue === undefined ||
    contextAssemblyPorts === undefined
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
        auditPersistence: new OperationAuditSqlPersistenceAdapter(
          new TursoOperationAuditExecutor(tursoClient),
        ),
        auditRecoveryQueue: agentLocalPorts.auditRecoveryQueue,
        now: input.now,
        generatedBy: 'worker_runtime',
      },
    },
  };
}

function readProviderRegistry(value: unknown): OperationGenerationProviderRegistry | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof (value as { resolveProvider?: unknown }).resolveProvider === 'function'
    ? value as OperationGenerationProviderRegistry
    : undefined;
}

function readOperationRouterSnapshot(
  value: unknown,
): StructureJobProcessorFlowInput['operationFlow']['snapshot'] | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as StructureJobProcessorFlowInput['operationFlow']['snapshot']
    : undefined;
}
