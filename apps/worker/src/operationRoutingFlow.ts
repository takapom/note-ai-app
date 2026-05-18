// Worker use-case flow for generated AI operation routing.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md

import type { AiOperationAuditRecordContract } from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import type { OperationAuditPersistencePort } from './operationAuditPort.ts';
import type { OperationAuditRecoveryQueuePort } from './operationAuditRecoveryQueue.ts';
import {
  routeGeneratedOperations,
  type RuntimeOperationRoutingInput,
  type RuntimeOperationRoutingResult,
} from './operationRoutingAdapter.ts';

export interface CompletedStructureJobOperationGate {
  structureJobId: string;
  status: 'completed';
  providerSucceeded: true;
}

export interface OperationRoutingFlowInput extends RuntimeOperationRoutingInput {
  auditPersistence: OperationAuditPersistencePort;
  auditRecoveryQueue?: OperationAuditRecoveryQueuePort;
  completedStructureJobGate: CompletedStructureJobOperationGate;
}

export interface OperationAuditPersistenceResult {
  attempted: boolean;
  ok: boolean;
  savedCount: number;
  errors: string[];
}

export interface OperationRoutingFlowResult {
  routing: RuntimeOperationRoutingResult;
  auditPersistence: OperationAuditPersistenceResult;
  auditRecovery: OperationAuditRecoveryResult;
  directApplyResults: [];
}

export interface OperationAuditRecoveryResult {
  attempted: boolean;
  ok: boolean;
  enqueuedCount: number;
  errors: string[];
}

export async function runOperationRoutingFlow(
  input: OperationRoutingFlowInput,
): Promise<OperationRoutingFlowResult> {
  const gateErrors = validateCompletedStructureJobOperationGate(input.completedStructureJobGate);
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

  const { auditPersistence, auditRecovery } = await saveAuditRecords({
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
): string[] {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    return ['completedStructureJobGate is required'];
  }

  const record = gate as Partial<CompletedStructureJobOperationGate>;
  const errors: string[] = [];
  if (typeof record.structureJobId !== 'string' || record.structureJobId.trim().length === 0) {
    errors.push('completedStructureJobGate.structureJobId must be a non-empty string');
  }
  if (record.status !== 'completed') {
    errors.push('completedStructureJobGate.status must be completed');
  }
  if (record.providerSucceeded !== true) {
    errors.push('completedStructureJobGate.providerSucceeded must be true');
  }
  return errors;
}

async function saveAuditRecords(input: {
  port: OperationAuditPersistencePort;
  records: readonly AiOperationAuditRecordContract[];
  recoveryQueue?: OperationAuditRecoveryQueuePort;
  failedAt: number;
}): Promise<{
  auditPersistence: OperationAuditPersistenceResult;
  auditRecovery: OperationAuditRecoveryResult;
}> {
  let savedCount = 0;
  const persistenceErrors: string[] = [];
  const auditRecovery: OperationAuditRecoveryResult = noAuditRecovery();

  for (const record of input.records) {
    try {
      const saveResult = await input.port.save(record);

      if (saveResult.ok) {
        savedCount += 1;
      } else {
        const failureMessages = normalizePersistenceErrors(saveResult.errors);
        persistenceErrors.push(...failureMessages.map((error) => `audit ${record.id}: ${error}`));
        await enqueueAuditRecovery(input.recoveryQueue, auditRecovery, record, failureMessages.join('; '), input.failedAt);
      }
    } catch (error) {
      const failureMessage = toPersistenceErrorMessage(error);
      persistenceErrors.push(`audit ${record.id}: ${failureMessage}`);
      await enqueueAuditRecovery(input.recoveryQueue, auditRecovery, record, failureMessage, input.failedAt);
    }
  }

  return {
    auditPersistence: {
      attempted: true,
      ok: persistenceErrors.length === 0,
      savedCount,
      errors: persistenceErrors,
    },
    auditRecovery,
  };
}

async function enqueueAuditRecovery(
  queue: OperationAuditRecoveryQueuePort | undefined,
  result: OperationAuditRecoveryResult,
  record: AiOperationAuditRecordContract,
  failureMessage: string,
  failedAt: number,
): Promise<void> {
  if (queue === undefined) {
    return;
  }

  result.attempted = true;
  const enqueueResult = await queue.enqueue({
    operationId: record.id,
    workspaceId: record.workspaceId,
    ...(record.noteId === undefined ? {} : { noteId: record.noteId }),
    ...(record.structureJobId === undefined ? {} : { structureJobId: record.structureJobId }),
    auditRecord: record,
    failureMessage,
    failedAt,
  });

  if (enqueueResult.ok) {
    result.enqueuedCount += 1;
    return;
  }

  result.ok = false;
  result.errors.push(...enqueueResult.errors.map((error) => `audit ${record.id} recovery: ${error}`));
}

function noAuditRecovery(): OperationAuditRecoveryResult {
  return {
    attempted: false,
    ok: true,
    enqueuedCount: 0,
    errors: [],
  };
}

function toPersistenceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `audit persistence failed: ${error.message.trim()}`;
  }

  return 'audit persistence failed';
}

function normalizePersistenceErrors(errors: readonly string[]): string[] {
  const normalized = errors.filter((error) => error.trim().length > 0);
  return normalized.length > 0 ? normalized : ['audit persistence failed'];
}
