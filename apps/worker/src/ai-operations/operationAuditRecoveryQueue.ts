// Application/runtime recovery queue for operation audit persistence failures.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/repository-topology.md

import type { AiOperationAuditRecordContract } from '../../../../contexts/ai-operations/src/contract/operationRouterContract.ts';

export interface OperationAuditRecoveryQueuePayload {
  operationId: string;
  workspaceId: string;
  noteId?: string;
  structureJobId?: string;
  auditRecord: AiOperationAuditRecordContract;
  failureMessage: string;
  failedAt: number;
}

export interface OperationAuditRecoveryQueueResult {
  ok: boolean;
  errors: string[];
  item?: OperationAuditRecoveryQueuePayload;
}

export interface OperationAuditRecoveryQueuePort {
  enqueue(payload: OperationAuditRecoveryQueuePayload): Promise<OperationAuditRecoveryQueueResult>;
}

export class InMemoryOperationAuditRecoveryQueue implements OperationAuditRecoveryQueuePort {
  private readonly items: OperationAuditRecoveryQueuePayload[] = [];

  async enqueue(payload: OperationAuditRecoveryQueuePayload): Promise<OperationAuditRecoveryQueueResult> {
    const errors = validateOperationAuditRecoveryPayload(payload);

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const item = cloneRecoveryPayload(payload);
    this.items.push(item);

    return {
      ok: true,
      errors: [],
      item: cloneRecoveryPayload(item),
    };
  }

  list(): OperationAuditRecoveryQueuePayload[] {
    return this.items.map(cloneRecoveryPayload);
  }
}

export function validateOperationAuditRecoveryPayload(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return ['operation audit recovery payload must be an object'];
  }

  const errors: string[] = [];

  validateRequiredTrimmedString(payload.operationId, 'operationId', errors);
  validateRequiredTrimmedString(payload.workspaceId, 'workspaceId', errors);
  validateOptionalTrimmedString(payload.noteId, 'noteId', errors);
  validateOptionalTrimmedString(payload.structureJobId, 'structureJobId', errors);
  validateRequiredTrimmedString(payload.failureMessage, 'failureMessage', errors);

  if (typeof payload.failedAt !== 'number' || !Number.isFinite(payload.failedAt)) {
    errors.push('failedAt must be a finite number');
  }

  if (!isRecord(payload.auditRecord)) {
    errors.push('auditRecord must be an object');
    return errors;
  }
  if (!Array.isArray(payload.auditRecord.errors)) {
    errors.push('auditRecord.errors must be an array');
  }
  if (!Array.isArray(payload.auditRecord.sourceSpans)) {
    errors.push('auditRecord.sourceSpans must be an array');
  }

  validateRequiredAuditRecordMatch(
    payload.auditRecord.id,
    payload.operationId,
    'auditRecord.id',
    'operationId',
    errors,
  );
  validateRequiredAuditRecordMatch(
    payload.auditRecord.workspaceId,
    payload.workspaceId,
    'auditRecord.workspaceId',
    'workspaceId',
    errors,
  );
  validateOptionalAuditRecordMatch(
    payload.auditRecord.noteId,
    payload.noteId,
    'auditRecord.noteId',
    'noteId',
    errors,
  );
  validateOptionalAuditRecordMatch(
    payload.auditRecord.structureJobId,
    payload.structureJobId,
    'auditRecord.structureJobId',
    'structureJobId',
    errors,
  );

  return errors;
}

function validateRequiredAuditRecordMatch(
  actual: unknown,
  expected: unknown,
  actualField: string,
  expectedField: string,
  errors: string[],
): void {
  validateRequiredTrimmedString(actual, actualField, errors);

  if (isTrimmedNonEmptyString(actual) && isTrimmedNonEmptyString(expected) && actual !== expected) {
    errors.push(`${actualField} must match ${expectedField}`);
  }
}

function validateOptionalAuditRecordMatch(
  actual: unknown,
  expected: unknown,
  actualField: string,
  expectedField: string,
  errors: string[],
): void {
  validateOptionalTrimmedString(actual, actualField, errors);

  if (!isTrimmedNonEmptyString(actual) && !isTrimmedNonEmptyString(expected)) {
    return;
  }

  if (actual === undefined || expected === undefined) {
    errors.push(`${actualField} must match ${expectedField} when either is provided`);
    return;
  }

  if (isTrimmedNonEmptyString(actual) && isTrimmedNonEmptyString(expected) && actual !== expected) {
    errors.push(`${actualField} must match ${expectedField}`);
  }
}

function cloneRecoveryPayload(
  payload: OperationAuditRecoveryQueuePayload,
): OperationAuditRecoveryQueuePayload {
  return {
    operationId: payload.operationId,
    workspaceId: payload.workspaceId,
    ...(payload.noteId === undefined ? {} : { noteId: payload.noteId }),
    ...(payload.structureJobId === undefined ? {} : { structureJobId: payload.structureJobId }),
    auditRecord: cloneAuditRecord(payload.auditRecord),
    failureMessage: payload.failureMessage,
    failedAt: payload.failedAt,
  };
}

function cloneAuditRecord(record: AiOperationAuditRecordContract): AiOperationAuditRecordContract {
  return {
    ...record,
    errors: [...record.errors],
    sourceSpans: record.sourceSpans.map((span) => ({ ...span })),
  };
}

function validateRequiredTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed`);
  }
}

function validateOptionalTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string when provided`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed when provided`);
  }
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
