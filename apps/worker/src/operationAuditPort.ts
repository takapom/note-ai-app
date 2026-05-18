// Application/runtime persistence port for AI operation audit records.
// Authority: docs/contracts/operation-return-contract.md
// Companion: docs/contracts/data-model.md, docs/contracts/repository-topology.md

import {
  type AiOperationAuditRecordContract,
} from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';

export interface OperationAuditSaveResult {
  ok: boolean;
  errors: string[];
  record?: AiOperationAuditRecordContract;
}

export interface OperationAuditPersistencePort {
  save(record: AiOperationAuditRecordContract): Promise<OperationAuditSaveResult>;
}

export class InMemoryOperationAuditPersistencePort implements OperationAuditPersistencePort {
  private readonly records = new Map<string, AiOperationAuditRecordContract>();

  async save(record: AiOperationAuditRecordContract): Promise<OperationAuditSaveResult> {
    const errors = validateOperationAuditRecordForPersistence(record);

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const saved = cloneAuditRecord(record);
    if (this.records.has(saved.id)) {
      return {
        ok: false,
        errors: [`auditRecord.id ${saved.id} already exists`],
      };
    }

    this.records.set(saved.id, saved);

    return {
      ok: true,
      errors: [],
      record: cloneAuditRecord(saved),
    };
  }

  findById(id: string): AiOperationAuditRecordContract | undefined {
    const record = this.records.get(id);
    return record === undefined ? undefined : cloneAuditRecord(record);
  }

  list(): AiOperationAuditRecordContract[] {
    return Array.from(this.records.values(), cloneAuditRecord);
  }
}

export function validateOperationAuditRecordForPersistence(
  record: AiOperationAuditRecordContract | unknown,
): string[] {
  const errors: string[] = [];

  if (!isRecord(record)) {
    return ['auditRecord must be an object'];
  }

  validateRequiredTrimmedString(record.id, 'auditRecord.id', errors);
  validateRequiredTrimmedString(record.workspaceId, 'auditRecord.workspaceId', errors);
  validateRequiredTrimmedString(record.operationType, 'auditRecord.operationType', errors);
  validateRequiredTrimmedString(record.generatedBy, 'auditRecord.generatedBy', errors);

  for (const field of ['noteId', 'structureJobId', 'targetId'] as const) {
    const value = record[field];
    if (value !== undefined && !isNonEmptyString(value)) {
      errors.push(`auditRecord.${field} must be a non-empty string when provided`);
    } else if (typeof value === 'string' && value !== value.trim()) {
      errors.push(`auditRecord.${field} must be trimmed when provided`);
    }
  }

  if ((record.targetType === undefined) !== (record.targetId === undefined)) {
    errors.push('auditRecord targetType and targetId must be provided together');
  }

  if (!Array.isArray(record.errors)) {
    errors.push('auditRecord.errors must be an array');
  } else {
    for (const [index, error] of record.errors.entries()) {
      validateRequiredTrimmedString(error, `auditRecord.errors[${index}]`, errors);
    }
  }

  if (!Array.isArray(record.sourceSpans)) {
    errors.push('auditRecord.sourceSpans must be an array');
  } else {
    for (const [index, span] of record.sourceSpans.entries()) {
      validateSourceSpan(span, index, isNonEmptyString(record.id) ? record.id : undefined, errors);
    }
  }

  if (!Number.isFinite(record.createdAt)) {
    errors.push('auditRecord.createdAt must be a finite number');
  }
  if (!Number.isFinite(record.updatedAt)) {
    errors.push('auditRecord.updatedAt must be a finite number');
  }
  if (
    record.confidence !== undefined &&
    (typeof record.confidence !== 'number' || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1)
  ) {
    errors.push('auditRecord.confidence must be a finite number between 0 and 1 when provided');
  }

  return errors;
}

function validateSourceSpan(
  span: unknown,
  index: number,
  recordId: string | undefined,
  errors: string[],
): void {
  if (!isRecord(span)) {
    errors.push(`auditRecord.sourceSpans[${index}] must be an object`);
    return;
  }

  if (span.targetType !== 'operation') {
    errors.push(`auditRecord.sourceSpans[${index}].targetType must be operation`);
  }

  validateRequiredTrimmedString(span.targetId, `auditRecord.sourceSpans[${index}].targetId`, errors);
  if (recordId !== undefined && isNonEmptyString(span.targetId) && span.targetId !== recordId) {
    errors.push(`auditRecord.sourceSpans[${index}].targetId must match auditRecord.id`);
  }
  validateRequiredTrimmedString(span.sourceBlockId, `auditRecord.sourceSpans[${index}].sourceBlockId`, errors);
  validateRequiredTrimmedString(span.reason, `auditRecord.sourceSpans[${index}].reason`, errors);

  if (span.startOffset !== undefined && !isNonNegativeNumber(span.startOffset)) {
    errors.push(`auditRecord.sourceSpans[${index}].startOffset must be non-negative`);
  }
  if (span.endOffset !== undefined && !isNonNegativeNumber(span.endOffset)) {
    errors.push(`auditRecord.sourceSpans[${index}].endOffset must be non-negative`);
  }
  if (
    isNonNegativeNumber(span.startOffset) &&
    isNonNegativeNumber(span.endOffset) &&
    span.endOffset < span.startOffset
  ) {
    errors.push(`auditRecord.sourceSpans[${index}].endOffset must be greater than or equal to startOffset`);
  }
}

function cloneAuditRecord(record: AiOperationAuditRecordContract): AiOperationAuditRecordContract {
  return {
    ...record,
    errors: [...record.errors],
    sourceSpans: record.sourceSpans.map((span) => ({ ...span })),
  };
}

function validateRequiredTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (!isNonEmptyString(value)) {
    errors.push(`${field} must be a non-empty string`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
