// Operation Router audit record semantics.
// Authority: docs/contracts/operation-return-contract.md

import {
  classifyOperationPolicy,
  operationPolicies,
  operationStatuses,
  type OperationPolicy,
  type OperationStatus,
  type StructureOperation,
  validateStructureOperation,
} from './operationContract.ts';
import {
  type AiOperationAuditRecordContract,
  type AiOperationAuditSourceSpanContract,
  operationTargetTypes,
  type OperationRevertResult,
  type OperationTargetType,
  type RouteOperationOptions,
} from './operationRouterTypes.ts';
import {
  isConfidenceThreshold,
  isFiniteNumber,
  isNonEmptyString,
  isNonNegativeNumber,
  isOperationPolicy,
  isOperationStatus,
  isOperationTargetType,
  isRecord,
  validateRequiredTrimmedString,
} from './operationRouterPrimitives.ts';

export function validateOperationAuditRecordContract(
  auditRecord: AiOperationAuditRecordContract | unknown,
): string[] {
  const errors: string[] = [];
  const record = isRecord(auditRecord) ? auditRecord : undefined;

  if (!record) {
    return ['auditRecord must be an object'];
  }

  validateAuditRecordShape(record, errors);
  validateAuditRecordCollections(record, errors);
  validateAuditRecordNumbers(record, errors);

  return errors;
}

export function revertOperationAuditRecord(
  auditRecord: AiOperationAuditRecordContract | unknown,
  now: number,
): OperationRevertResult {
  const errors: string[] = [];
  errors.push(...validateAuditRecordForRevert(auditRecord));

  if (!isFiniteNumber(now)) {
    errors.push('now must be a finite number');
  }

  const record = isRecord(auditRecord) ? auditRecord as Partial<AiOperationAuditRecordContract> : undefined;

  if (record?.status !== 'applied' && record?.status !== 'proposed') {
    errors.push(`operation status ${String(record?.status)} cannot be reverted`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      status: 'failed',
      errors,
    };
  }

  const validRecord = auditRecord as AiOperationAuditRecordContract;

  return {
    ok: true,
    status: 'reverted',
    errors: [],
    auditRecord: {
      ...validRecord,
      status: 'reverted',
      updatedAt: now,
    },
  };
}

export function createAuditRecord(input: {
  input: unknown;
  operation?: StructureOperation;
  operationId?: string;
  operationType: string;
  policy: OperationPolicy;
  status: OperationStatus;
  errors: string[];
  options: RouteOperationOptions;
  now: number;
}): AiOperationAuditRecordContract | undefined {
  if (!isNonEmptyString(input.options.workspaceId) || !isNonEmptyString(input.operationId)) {
    return undefined;
  }

  const confidence = getConfidence(input.operation ?? input.input);
  const target = input.operation === undefined ? undefined : getOperationTarget(input.operation);

  return {
    id: input.operationId,
    workspaceId: input.options.workspaceId.trim(),
    ...(isNonEmptyString(input.options.noteId) ? { noteId: input.options.noteId.trim() } : {}),
    ...(isNonEmptyString(input.options.structureJobId) ? { structureJobId: input.options.structureJobId.trim() } : {}),
    operationType: input.operationType,
    policy: input.policy,
    status: input.status,
    operation: input.input,
    errors: input.errors,
    sourceSpans: input.operation === undefined ? [] : mapAuditSourceSpans(input.operation, input.operationId),
    ...(confidence === undefined ? {} : { confidence }),
    ...(target === undefined ? {} : { targetType: target.targetType, targetId: target.targetId.trim() }),
    generatedBy: isNonEmptyString(input.options.generatedBy) ? input.options.generatedBy.trim() : 'ai',
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function validateAuditRecordShape(record: Record<string, unknown>, errors: string[]): void {
  validateRequiredTrimmedString(record, 'id', 'auditRecord.id', errors);
  validateRequiredTrimmedString(record, 'workspaceId', 'auditRecord.workspaceId', errors);
  validateRequiredTrimmedString(record, 'operationType', 'auditRecord.operationType', errors);
  validateRequiredTrimmedString(record, 'generatedBy', 'auditRecord.generatedBy', errors);

  if (!isOperationPolicy(record.policy)) {
    errors.push(`auditRecord.policy must be one of ${operationPolicies.join(', ')}`);
  }
  if (!isOperationStatus(record.status)) {
    errors.push(`auditRecord.status must be one of ${operationStatuses.join(', ')}`);
  }

  validateOptionalTrimmedIds(record, errors);

  if (record.targetType !== undefined && !isOperationTargetType(record.targetType)) {
    errors.push(`auditRecord.targetType must be one of ${operationTargetTypes.join(', ')}`);
  }
  if ((record.targetType === undefined) !== (record.targetId === undefined)) {
    errors.push('auditRecord targetType and targetId must be provided together');
  }
}

function validateOptionalTrimmedIds(record: Record<string, unknown>, errors: string[]): void {
  for (const field of ['noteId', 'structureJobId', 'targetId'] as const) {
    if (record[field] !== undefined && !isNonEmptyString(record[field])) {
      errors.push(`auditRecord.${field} must be a non-empty string when provided`);
    } else if (typeof record[field] === 'string' && record[field] !== record[field].trim()) {
      errors.push(`auditRecord.${field} must be trimmed when provided`);
    }
  }
}

function validateAuditRecordCollections(record: Record<string, unknown>, errors: string[]): void {
  if (!Array.isArray(record.errors)) {
    errors.push('auditRecord.errors must be an array');
  } else {
    for (const [index, error] of record.errors.entries()) {
      if (!isNonEmptyString(error)) {
        errors.push(`auditRecord.errors[${index}] must be a non-empty string`);
      } else if (error !== error.trim()) {
        errors.push(`auditRecord.errors[${index}] must be trimmed`);
      }
    }
  }

  if (!Array.isArray(record.sourceSpans)) {
    errors.push('auditRecord.sourceSpans must be an array');
  } else {
    for (const [index, span] of record.sourceSpans.entries()) {
      validateAuditSourceSpanContract(span, index, isNonEmptyString(record.id) ? record.id : undefined, errors);
    }
  }
}

function validateAuditRecordNumbers(record: Record<string, unknown>, errors: string[]): void {
  if (!isFiniteNumber(record.createdAt)) {
    errors.push('auditRecord.createdAt must be a finite number');
  }
  if (!isFiniteNumber(record.updatedAt)) {
    errors.push('auditRecord.updatedAt must be a finite number');
  }
  if (record.confidence !== undefined && !isConfidenceThreshold(record.confidence)) {
    errors.push('auditRecord.confidence must be a finite number between 0 and 1 when provided');
  }
}

function validateAuditRecordForRevert(auditRecord: unknown): string[] {
  const errors: string[] = [];
  const record = isRecord(auditRecord) ? auditRecord : undefined;

  if (!record) {
    return ['auditRecord must be an object'];
  }

  validateAuditRecordShape(record, errors);
  validateAuditRecordCollections(record, errors);
  validateAuditRecordNumbers(record, errors);
  validateRevertOperationPayload(record, errors);

  return errors;
}

function validateRevertOperationPayload(record: Record<string, unknown>, errors: string[]): void {
  if (!('operation' in record) || record.operation === undefined) {
    errors.push('auditRecord.operation is required');
    return;
  }

  const operationValidation = validateStructureOperation(record.operation);
  if (!operationValidation.ok) {
    errors.push(...operationValidation.errors.map((error) => `auditRecord.operation: ${error}`));
    return;
  }

  const operation = record.operation as StructureOperation;
  if (record.operationType !== operation.type) {
    errors.push('auditRecord.operationType must match auditRecord.operation.type');
  }
  if (isOperationPolicy(record.policy) && record.policy !== classifyOperationPolicy(operation)) {
    errors.push('auditRecord.policy must match auditRecord.operation policy');
  }
}

function validateAuditSourceSpanContract(
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
  validateRequiredTrimmedString(span, 'targetId', `auditRecord.sourceSpans[${index}].targetId`, errors);
  if (recordId !== undefined && isNonEmptyString(span.targetId) && span.targetId !== recordId) {
    errors.push(`auditRecord.sourceSpans[${index}].targetId must match auditRecord.id`);
  }
  validateRequiredTrimmedString(span, 'sourceBlockId', `auditRecord.sourceSpans[${index}].sourceBlockId`, errors);
  validateRequiredTrimmedString(span, 'reason', `auditRecord.sourceSpans[${index}].reason`, errors);
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

function mapAuditSourceSpans(
  operation: StructureOperation,
  operationId: string,
): AiOperationAuditSourceSpanContract[] {
  if (!('sourceSpans' in operation) || operation.sourceSpans === undefined) {
    return [];
  }

  return operation.sourceSpans.map((span) => ({
    targetType: 'operation',
    targetId: operationId,
    sourceBlockId: span.blockId.trim(),
    ...(span.startOffset === undefined ? {} : { startOffset: span.startOffset }),
    ...(span.endOffset === undefined ? {} : { endOffset: span.endOffset }),
    reason: operation.type,
  }));
}

function getOperationTarget(
  operation: StructureOperation,
): { targetType: OperationTargetType; targetId: string } | undefined {
  switch (operation.type) {
    case 'create_semantic_unit':
    case 'create_memory_candidate':
      return { targetType: 'section', targetId: operation.targetSectionId };
    case 'create_relation':
      return { targetType: 'semantic_unit', targetId: operation.toUnitId };
    case 'insert_assist_block':
      if (operation.position.afterBlockId !== undefined) {
        return { targetType: 'block', targetId: operation.position.afterBlockId };
      }
      if (operation.position.appendToSectionId !== undefined) {
        return { targetType: 'section', targetId: operation.position.appendToSectionId };
      }
      return undefined;
    case 'mark_stale':
      return { targetType: operation.targetType, targetId: operation.targetId };
    case 'no_op':
      return undefined;
  }
}

function getConfidence(input: unknown): number | undefined {
  if (isRecord(input) && typeof input.confidence === 'number' && Number.isFinite(input.confidence)) {
    return input.confidence;
  }
  return undefined;
}
