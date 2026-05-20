// Worker use-case flow for persisting Operation Router audit records.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/cloudflare-agents-turso.md

import type { AiOperationAuditRecordContract } from '../../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import type { OperationAuditPersistencePort } from './operationAuditPort.ts';
import type { OperationAuditRecoveryQueuePort } from './operationAuditRecoveryQueue.ts';

export interface OperationAuditPersistenceResult {
  attempted: boolean;
  ok: boolean;
  savedCount: number;
  errors: string[];
}

export interface OperationAuditRecoveryResult {
  attempted: boolean;
  ok: boolean;
  enqueuedCount: number;
  errors: string[];
}

export async function persistOperationAuditRecords(input: {
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

export function noAuditRecovery(): OperationAuditRecoveryResult {
  return {
    attempted: false,
    ok: true,
    enqueuedCount: 0,
    errors: [],
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
  result.errors.push(...normalizeRecoveryErrors(enqueueResult.errors).map((error) => `audit ${record.id} recovery: ${error}`));
}

function toPersistenceErrorMessage(error: unknown): string {
  return normalizeInfrastructureFailure(error, 'audit persistence unavailable');
}

function normalizePersistenceErrors(errors: readonly string[]): string[] {
  const normalized = errors
    .map((error) => normalizePersistenceError(error))
    .filter((error) => error.trim().length > 0);
  return normalized.length > 0 ? normalized : ['audit persistence failed'];
}

function normalizeRecoveryErrors(errors: readonly string[]): string[] {
  const normalized = errors
    .map((error) => normalizeRecoveryError(error))
    .filter((error) => error.trim().length > 0);
  return normalized.length > 0 ? normalized : ['audit recovery enqueue failed'];
}

function normalizeRecoveryError(error: unknown): string {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length === 0) {
      return 'audit recovery enqueue unavailable';
    }
    if (isValidationFailureMessage(trimmed)) {
      return trimmed;
    }
    return 'audit recovery enqueue unavailable';
  }

  return 'audit recovery enqueue unavailable';
}

function normalizePersistenceError(error: unknown): string {
  if (typeof error === 'string' && isVolatileInfrastructureDetail(error)) {
    return 'audit persistence unavailable';
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return normalizeInfrastructureFailure(error, 'audit persistence unavailable');
}

function normalizeInfrastructureFailure(error: unknown, stableMessage: string): string {
  if (error instanceof Error) {
    return stableMessage;
  }

  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length === 0 || isVolatileInfrastructureDetail(trimmed)) {
      return stableMessage;
    }
    return trimmed;
  }

  return stableMessage;
}

function isVolatileInfrastructureDetail(message: string): boolean {
  return /\b(sql|sqlite|libsql|turso|database|db|executor|connection|network|timeout|provider|auth0|clerk|token|secret)\b/i.test(message);
}

function isValidationFailureMessage(message: string): boolean {
  return /\b(must|required|match|invalid|provided|finite|non-empty|trimmed)\b/i.test(message);
}
