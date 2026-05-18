// Worker orchestration for completed structure job operation routing.
// Authority: docs/contracts/ai-structuring-lifecycle.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/api-events.md

import type { OperationRouterSnapshot } from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import type { StructureJobContract } from '../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import type { OperationAuditPersistencePort } from './operationAuditPort.ts';
import type { OperationAuditRecoveryQueuePort } from './operationAuditRecoveryQueue.ts';
import {
  runOperationRoutingFlow,
  type OperationRoutingFlowResult,
} from './operationRoutingFlow.ts';

export interface StructureJobOperationFlowInput {
  structureJob: StructureJobContract;
  aiResponse?: unknown;
  snapshot: OperationRouterSnapshot;
  auditPersistence: OperationAuditPersistencePort;
  auditRecoveryQueue?: OperationAuditRecoveryQueuePort;
  now: number;
  generatedBy?: string;
  confidenceThreshold?: number;
  sequenceStart?: number;
}

export interface StructureJobOperationFlowResult {
  attempted: boolean;
  ok: boolean;
  reason: 'job_not_completed' | 'routed';
  errors: string[];
  routingFlow?: OperationRoutingFlowResult;
  directApplyResults: [];
  noteSotMutations: [];
}

export async function runStructureJobOperationFlow(
  input: StructureJobOperationFlowInput,
): Promise<StructureJobOperationFlowResult> {
  if (input.structureJob.status !== 'completed') {
    return {
      attempted: false,
      ok: true,
      reason: 'job_not_completed',
      errors: [],
      directApplyResults: [],
      noteSotMutations: [],
    };
  }

  const operationIdPrefix = createStructureJobOperationIdPrefix(input.structureJob.id);
  const routingFlow = await runOperationRoutingFlow({
    workspaceId: input.structureJob.workspaceId,
    noteId: input.structureJob.noteId,
    structureJobId: input.structureJob.id,
    operationIdPrefix,
    aiResponse: input.aiResponse,
    snapshot: input.snapshot,
    auditPersistence: input.auditPersistence,
    ...(input.auditRecoveryQueue === undefined ? {} : { auditRecoveryQueue: input.auditRecoveryQueue }),
    completedStructureJobGate: {
      structureJobId: input.structureJob.id,
      status: 'completed',
    },
    now: input.now,
    ...(input.generatedBy === undefined ? {} : { generatedBy: input.generatedBy }),
    ...(input.confidenceThreshold === undefined ? {} : { confidenceThreshold: input.confidenceThreshold }),
    ...(input.sequenceStart === undefined ? {} : { sequenceStart: input.sequenceStart }),
  });

  return {
    attempted: true,
    ok: routingFlow.routing.ok && routingFlow.auditPersistence.ok && routingFlow.auditRecovery.ok,
    reason: 'routed',
    errors: [
      ...routingFlow.routing.errors,
      ...routingFlow.auditPersistence.errors,
      ...routingFlow.auditRecovery.errors,
    ],
    routingFlow,
    directApplyResults: [],
    noteSotMutations: [],
  };
}

export function createStructureJobOperationIdPrefix(structureJobId: string): string {
  if (!isStableRuntimeId(structureJobId)) {
    return structureJobId;
  }

  return `operation_${structureJobId}`;
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}
