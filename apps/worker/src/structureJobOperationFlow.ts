// Worker orchestration for completed structure job operation routing.
// Authority: docs/contracts/ai-structuring-lifecycle.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/api-events.md

import type { OperationRouterSnapshot } from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import type { StructureJobContract } from '../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import type { OperationAuditPersistencePort } from './operationAuditPort.ts';
import {
  runOperationRoutingFlow,
  type OperationRoutingFlowResult,
} from './operationRoutingFlow.ts';

export interface StructureJobOperationFlowInput {
  structureJob: StructureJobContract;
  aiResponse?: unknown;
  providerError?: unknown;
  snapshot: OperationRouterSnapshot;
  auditPersistence: OperationAuditPersistencePort;
  now: number;
  generatedBy?: string;
  confidenceThreshold?: number;
  sequenceStart?: number;
}

export interface StructureJobOperationFlowResult {
  attempted: boolean;
  ok: boolean;
  reason: 'job_not_completed' | 'provider_failed' | 'routed';
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
      errors: [`structure job status ${input.structureJob.status} is not completed`],
      directApplyResults: [],
      noteSotMutations: [],
    };
  }

  if (input.providerError !== undefined) {
    return {
      attempted: false,
      ok: false,
      reason: 'provider_failed',
      errors: [toProviderErrorMessage(input.providerError)],
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
    completedStructureJobGate: {
      structureJobId: input.structureJob.id,
      status: 'completed',
      providerSucceeded: true,
    },
    now: input.now,
    ...(input.generatedBy === undefined ? {} : { generatedBy: input.generatedBy }),
    ...(input.confidenceThreshold === undefined ? {} : { confidenceThreshold: input.confidenceThreshold }),
    ...(input.sequenceStart === undefined ? {} : { sequenceStart: input.sequenceStart }),
  });

  return {
    attempted: true,
    ok: routingFlow.routing.ok && routingFlow.auditPersistence.ok,
    reason: 'routed',
    errors: [...routingFlow.routing.errors, ...routingFlow.auditPersistence.errors],
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

function toProviderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `operation generation failed: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `operation generation failed: ${error.trim()}`;
  }

  return 'operation generation failed';
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
