// Worker use-case flow for generated AI operation routing.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md

import type { OperationAuditPersistencePort } from './operationAuditPort.ts';
import type { OperationAuditRecoveryQueuePort } from './operationAuditRecoveryQueue.ts';
import {
  noAuditRecovery,
  persistOperationAuditRecords,
  type OperationAuditPersistenceResult,
  type OperationAuditRecoveryResult,
} from './operationAuditPersistenceFlow.ts';
import {
  routeGeneratedOperations,
  type RuntimeOperationRoutingInput,
  type RuntimeOperationRoutingResult,
} from './operationRoutingAdapter.ts';

export interface CompletedStructureJobOperationGate {
  structureJobId: string;
  status: 'completed';
}

export interface OperationRoutingFlowInput extends RuntimeOperationRoutingInput {
  auditPersistence: OperationAuditPersistencePort;
  auditRecoveryQueue?: OperationAuditRecoveryQueuePort;
  completedStructureJobGate: CompletedStructureJobOperationGate;
}

export interface OperationRoutingFlowResult {
  routing: RuntimeOperationRoutingResult;
  auditPersistence: OperationAuditPersistenceResult;
  auditRecovery: OperationAuditRecoveryResult;
  directApplyResults: [];
}

export async function runOperationRoutingFlow(
  input: OperationRoutingFlowInput,
): Promise<OperationRoutingFlowResult> {
  const gateErrors = validateCompletedStructureJobOperationGate(
    input.completedStructureJobGate,
    input.structureJobId,
  );
  if (gateErrors.length > 0) {
    return {
      routing: {
        ok: false,
        policy: 'blocked',
        acceptedCount: 0,
        rejectedCount: 0,
        errors: gateErrors,
        results: [],
        auditRecords: [],
        applyResults: [],
        operationIds: [],
        routedThroughOperationRouter: false,
        directApplyResults: [],
      },
      auditPersistence: {
        attempted: false,
        ok: true,
        savedCount: 0,
        errors: [],
      },
      auditRecovery: noAuditRecovery(),
      directApplyResults: [],
    };
  }

  const routing = routeGeneratedOperations(input);

  if (routing.auditRecords.length === 0) {
    return {
      routing,
      auditPersistence: {
        attempted: false,
        ok: true,
        savedCount: 0,
        errors: [],
      },
      auditRecovery: noAuditRecovery(),
      directApplyResults: [],
    };
  }

  const { auditPersistence, auditRecovery } = await persistOperationAuditRecords({
    port: input.auditPersistence,
    records: routing.auditRecords,
    failedAt: input.now,
    ...(input.auditRecoveryQueue === undefined ? {} : { recoveryQueue: input.auditRecoveryQueue }),
  });

  return {
    routing,
    auditPersistence,
    auditRecovery,
    directApplyResults: [],
  };
}

function validateCompletedStructureJobOperationGate(
  gate: CompletedStructureJobOperationGate | unknown,
  expectedStructureJobId: string | undefined,
): string[] {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    return ['completedStructureJobGate is required'];
  }

  const record = gate as Partial<CompletedStructureJobOperationGate>;
  const errors: string[] = [];
  if (typeof record.structureJobId !== 'string' || record.structureJobId.trim().length === 0) {
    errors.push('completedStructureJobGate.structureJobId must be a non-empty string');
  } else if (expectedStructureJobId !== undefined && record.structureJobId !== expectedStructureJobId) {
    errors.push('completedStructureJobGate.structureJobId must match structureJobId');
  }
  if (record.status !== 'completed') {
    errors.push('completedStructureJobGate.status must be completed');
  }
  return errors;
}
