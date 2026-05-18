// Live product semantics for the AI Operation Router.
// Authority: docs/contracts/operation-return-contract.md
// Companion: docs/contracts/app-note-model.md, docs/contracts/data-model.md, docs/contracts/api-events.md

import {
  userAuthoredBlockOrigin,
  type BlockOrigin,
} from '../../../note-model/src/contract/noteContract.ts';
import {
  classifyOperationPolicy,
  type OperationPolicy,
  type OperationStatus,
  operationPolicies,
  operationStatuses,
  type SourceSpanContract,
  type StructureOperation,
  validateStructureOperation,
} from './operationContract.ts';

export const operationApplyActions = ['apply', 'propose', 'no_apply', 'reject'] as const;
export type OperationApplyAction = (typeof operationApplyActions)[number];

export const operationApplyEffects = [
  'create_semantic_unit',
  'create_relation',
  'create_memory_candidate',
  'insert_assist_block',
  'mark_stale',
  'no_op',
] as const;
export type OperationApplyEffect = (typeof operationApplyEffects)[number];

export const operationTargetTypes = ['block', 'section', 'semantic_unit', 'memory_candidate', 'assist_block'] as const;
export type OperationTargetType = (typeof operationTargetTypes)[number];

export const operationAuditPolicies = operationPolicies;
export const operationAuditStatuses = operationStatuses;

export interface OperationRouterBlockSnapshot {
  id: string;
  origin: BlockOrigin;
  sectionId?: string;
}

export interface OperationRouterIdSnapshot {
  id: string;
}

export interface OperationRouterSnapshot {
  blocks: readonly OperationRouterBlockSnapshot[];
  sections: readonly OperationRouterIdSnapshot[];
  semanticUnits: readonly OperationRouterIdSnapshot[];
  memoryCandidates: readonly OperationRouterIdSnapshot[];
  assistBlocks: readonly OperationRouterIdSnapshot[];
}

export interface RouteOperationOptions {
  confidenceThreshold?: number;
  generatedBy?: string;
  operationId?: string;
  operationIds?: readonly string[];
  sequence?: number;
  workspaceId?: string;
  noteId?: string;
  structureJobId?: string;
  now?: number;
}

export interface AiOperationAuditSourceSpanContract {
  targetType: 'operation';
  targetId: string;
  sourceBlockId: string;
  startOffset?: number;
  endOffset?: number;
  reason: string;
}

export interface AiOperationAuditRecordContract {
  id: string;
  workspaceId: string;
  noteId?: string;
  structureJobId?: string;
  operationType: string;
  policy: OperationPolicy;
  status: OperationStatus;
  operation: unknown;
  errors: string[];
  sourceSpans: AiOperationAuditSourceSpanContract[];
  confidence?: number;
  targetType?: OperationTargetType;
  targetId?: string;
  generatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export type OperationApplyResult =
  | {
      action: 'apply';
      effect: Exclude<OperationApplyEffect, 'create_memory_candidate' | 'insert_assist_block' | 'no_op'>;
      reason: string;
    }
  | {
      action: 'propose';
      effect: 'create_memory_candidate' | 'insert_assist_block';
      policy: 'inline' | 'review';
      reason: string;
    }
  | {
      action: 'no_apply';
      effect: OperationApplyEffect;
      reason: string;
    }
  | {
      action: 'reject';
      reason: string;
    };

export interface OperationRouteResult {
  ok: boolean;
  accepted: boolean;
  policy: OperationPolicy;
  status: OperationStatus;
  operation?: StructureOperation;
  errors: string[];
  auditRecord?: AiOperationAuditRecordContract;
  applyResult: OperationApplyResult;
}

export interface OperationListRouteResult {
  ok: boolean;
  policy: OperationPolicy;
  acceptedCount: number;
  rejectedCount: number;
  errors: string[];
  results: OperationRouteResult[];
  auditRecords: AiOperationAuditRecordContract[];
  applyResults: OperationApplyResult[];
}

export interface OperationRevertResult {
  ok: boolean;
  status: Extract<OperationStatus, 'reverted' | 'failed'>;
  errors: string[];
  auditRecord?: AiOperationAuditRecordContract;
}

export function routeOperation(
  input: unknown,
  snapshot: OperationRouterSnapshot,
  options: RouteOperationOptions = {},
): OperationRouteResult {
  const schemaResult = validateStructureOperation(input);
  const routeOptionErrors = validateRouteOptions(options);
  const operationId = resolveOperationId(options);
  const now = resolveNow(options);
  const operationType = getOperationType(input);

  if (!schemaResult.ok || routeOptionErrors.length > 0) {
    const operation = schemaResult.ok ? input as StructureOperation : undefined;
    return blockedRoute({
      input,
      ...(operationId === undefined ? {} : { operationId }),
      operationType: operation?.type ?? operationType,
      ...(operation === undefined ? {} : { operation }),
      errors: [...routeOptionErrors, ...(schemaResult.ok ? [] : schemaResult.errors)],
      options,
      now,
    });
  }

  const operation = input as StructureOperation;
  const confidenceErrors = validateConfidenceThreshold(operation, resolveConfidenceThreshold(options));
  const targetErrors = validateOperationTargets(operation, snapshot);
  const errors = [...confidenceErrors, ...targetErrors];

  if (errors.length > 0) {
    const noApplyForLowConfidence = confidenceErrors.length > 0 && targetErrors.length === 0;
    return blockedRoute({
      input,
      ...(operationId === undefined ? {} : { operationId }),
      operationType: operation.type,
      operation,
      errors,
      options,
      now,
      ...(noApplyForLowConfidence
        ? {
            applyResult: {
              action: 'no_apply',
              effect: operation.type,
              reason: 'operation confidence is below threshold',
            } as OperationApplyResult,
          }
        : {}),
    });
  }

  const policy = classifyOperationPolicy(operation);
  const auditRecord = createAuditRecord({
    input,
    operation,
    ...(operationId === undefined ? {} : { operationId }),
    operationType: operation.type,
    policy,
    status: 'proposed',
    errors: [],
    options,
    now,
  });

  return {
    ok: true,
    accepted: true,
    policy,
    status: 'proposed',
    operation,
    errors: [],
    ...(auditRecord === undefined ? {} : { auditRecord }),
    applyResult: createApplyResult(operation, policy),
  };
}

export function routeOperationList(
  input: unknown,
  snapshot: OperationRouterSnapshot,
  options: RouteOperationOptions = {},
): OperationListRouteResult {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      policy: 'blocked',
      acceptedCount: 0,
      rejectedCount: 0,
      errors: ['AI response must be an operation list'],
      results: [],
      auditRecords: [],
      applyResults: [],
    };
  }

  const listOptionErrors = validateOperationListRouteOptions(options, input.length);
  if (listOptionErrors.length > 0) {
    return {
      ok: false,
      policy: 'blocked',
      acceptedCount: 0,
      rejectedCount: input.length,
      errors: listOptionErrors,
      results: [],
      auditRecords: [],
      applyResults: [],
    };
  }

  const { operationId: _operationId, operationIds, ...listOptions } = options;
  const results = input.map((operation, index) => {
    const itemOperationId = operationIds?.[index];
    return routeOperation(operation, snapshot, {
      ...listOptions,
      sequence: options.sequence === undefined ? index : options.sequence + index,
      ...(itemOperationId === undefined ? {} : { operationId: itemOperationId }),
    });
  });

  const errors = results.flatMap((result, index) =>
    result.errors.map((error) => `operations[${index}]: ${error}`),
  );
  const acceptedCount = results.filter((result) => result.accepted).length;
  const rejectedCount = results.length - acceptedCount;

  return {
    ok: errors.length === 0,
    policy: errors.length === 0 ? combineRoutePolicies(results.map((result) => result.policy)) : 'blocked',
    acceptedCount,
    rejectedCount,
    errors,
    results,
    auditRecords: results.flatMap((result) => result.auditRecord === undefined ? [] : [result.auditRecord]),
    applyResults: results.map((result) => result.applyResult),
  };
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

function validateConfidenceThreshold(operation: StructureOperation, threshold: number): string[] {
  if ('confidence' in operation && operation.confidence < threshold) {
    return [`confidence ${operation.confidence} is below threshold ${threshold}`];
  }
  return [];
}

function validateRouteOptions(options: RouteOperationOptions): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(options.workspaceId)) {
    errors.push('workspaceId must be a non-empty string');
  }

  if (!isNonEmptyString(options.operationId)) {
    errors.push('operationId must be a non-empty string');
  }

  if (options.noteId !== undefined && !isNonEmptyString(options.noteId)) {
    errors.push('noteId must be a non-empty string when provided');
  }

  if (options.structureJobId !== undefined && !isNonEmptyString(options.structureJobId)) {
    errors.push('structureJobId must be a non-empty string when provided');
  }

  if (options.generatedBy !== undefined && !isNonEmptyString(options.generatedBy)) {
    errors.push('generatedBy must be a non-empty string when provided');
  }

  if (options.now !== undefined && !isFiniteNumber(options.now)) {
    errors.push('now must be a finite number when provided');
  }

  if (options.sequence !== undefined && !isNonNegativeInteger(options.sequence)) {
    errors.push('sequence must be a finite non-negative integer when provided');
  }

  if (options.confidenceThreshold !== undefined && !isConfidenceThreshold(options.confidenceThreshold)) {
    errors.push('confidenceThreshold must be a finite number between 0 and 1 when provided');
  }

  return errors;
}

function validateOperationListRouteOptions(options: RouteOperationOptions, operationCount: number): string[] {
  const errors: string[] = [];

  if (options.sequence !== undefined && !isNonNegativeInteger(options.sequence)) {
    errors.push('sequence must be a finite non-negative integer when provided');
  }

  if (!Array.isArray(options.operationIds)) {
    errors.push('operationIds must be an array for operation list routing');
    return errors;
  }

  if (options.operationIds.length !== operationCount) {
    errors.push('operationIds length must match operation list length');
  }

  const seen = new Set<string>();
  for (const [index, operationId] of options.operationIds.entries()) {
    if (!isNonEmptyString(operationId)) {
      errors.push(`operationIds[${index}] must be a non-empty string`);
      continue;
    }

    const normalized = operationId.trim();
    if (seen.has(normalized)) {
      errors.push(`operationIds[${index}] duplicates another operation id`);
    }
    seen.add(normalized);
  }

  return errors;
}

export function validateOperationAuditRecordContract(auditRecord: AiOperationAuditRecordContract | unknown): string[] {
  const errors: string[] = [];
  const record = isRecord(auditRecord) ? auditRecord : undefined;

  if (!record) {
    return ['auditRecord must be an object'];
  }

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

  for (const field of ['noteId', 'structureJobId', 'targetId'] as const) {
    if (record[field] !== undefined && !isNonEmptyString(record[field])) {
      errors.push(`auditRecord.${field} must be a non-empty string when provided`);
    } else if (typeof record[field] === 'string' && record[field] !== record[field].trim()) {
      errors.push(`auditRecord.${field} must be trimmed when provided`);
    }
  }

  if (record.targetType !== undefined && !isOperationTargetType(record.targetType)) {
    errors.push(`auditRecord.targetType must be one of ${operationTargetTypes.join(', ')}`);
  }
  if ((record.targetType === undefined) !== (record.targetId === undefined)) {
    errors.push('auditRecord targetType and targetId must be provided together');
  }

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

  if (!isFiniteNumber(record.createdAt)) {
    errors.push('auditRecord.createdAt must be a finite number');
  }
  if (!isFiniteNumber(record.updatedAt)) {
    errors.push('auditRecord.updatedAt must be a finite number');
  }
  if (record.confidence !== undefined && !isConfidenceThreshold(record.confidence)) {
    errors.push('auditRecord.confidence must be a finite number between 0 and 1 when provided');
  }

  return errors;
}

function validateAuditRecordForRevert(auditRecord: unknown): string[] {
  const errors: string[] = [];
  const record = isRecord(auditRecord) ? auditRecord : undefined;

  if (!record) {
    return ['auditRecord must be an object'];
  }

  validateRequiredTrimmedString(record, 'id', 'auditRecord.id', errors);
  validateRequiredTrimmedString(record, 'workspaceId', 'auditRecord.workspaceId', errors);
  validateRequiredTrimmedString(record, 'operationType', 'auditRecord.operationType', errors);
  if (!isOperationPolicy(record.policy)) {
    errors.push(`auditRecord.policy must be one of ${operationPolicies.join(', ')}`);
  }
  if (!('operation' in record) || record.operation === undefined) {
    errors.push('auditRecord.operation is required');
  } else {
    const operationValidation = validateStructureOperation(record.operation);
    if (!operationValidation.ok) {
      errors.push(...operationValidation.errors.map((error) => `auditRecord.operation: ${error}`));
    } else {
      const operation = record.operation as StructureOperation;
      if (record.operationType !== operation.type) {
        errors.push('auditRecord.operationType must match auditRecord.operation.type');
      }
      if (isOperationPolicy(record.policy) && record.policy !== classifyOperationPolicy(operation)) {
        errors.push('auditRecord.policy must match auditRecord.operation policy');
      }
    }
  }
  validateRequiredTrimmedString(record, 'generatedBy', 'auditRecord.generatedBy', errors);
  for (const field of ['noteId', 'structureJobId', 'targetId'] as const) {
    if (record[field] !== undefined && !isNonEmptyString(record[field])) {
      errors.push(`auditRecord.${field} must be a non-empty string when provided`);
    }
    if (typeof record[field] === 'string' && record[field] !== record[field].trim()) {
      errors.push(`auditRecord.${field} must be trimmed when provided`);
    }
  }
  if (record.targetType !== undefined && !isOperationTargetType(record.targetType)) {
    errors.push(`auditRecord.targetType must be one of ${operationTargetTypes.join(', ')}`);
  }
  if ((record.targetType === undefined) !== (record.targetId === undefined)) {
    errors.push('auditRecord targetType and targetId must be provided together');
  }
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
      if (!isRecord(span)) {
        errors.push(`auditRecord.sourceSpans[${index}] must be an object`);
        continue;
      }

      if (span.targetType !== 'operation') {
        errors.push(`auditRecord.sourceSpans[${index}].targetType must be operation`);
      }
      validateRequiredTrimmedString(span, 'targetId', `auditRecord.sourceSpans[${index}].targetId`, errors);
      if (isNonEmptyString(record.id) && isNonEmptyString(span.targetId) && span.targetId !== record.id) {
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
  }
  if (!isFiniteNumber(record.createdAt)) {
    errors.push('auditRecord.createdAt must be a finite number');
  }
  if (!isFiniteNumber(record.updatedAt)) {
    errors.push('auditRecord.updatedAt must be a finite number');
  }
  if (record.confidence !== undefined && !isConfidenceThreshold(record.confidence)) {
    errors.push('auditRecord.confidence must be a finite number between 0 and 1 when provided');
  }

  return errors;
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

function validateOperationTargets(operation: StructureOperation, snapshot: OperationRouterSnapshot): string[] {
  const errors: string[] = [];

  if ('sourceSpans' in operation && operation.sourceSpans !== undefined) {
    validateSourceSpansUseUserBlocks(operation.sourceSpans, snapshot, errors);
  }

  switch (operation.type) {
    case 'create_semantic_unit':
      if (!hasId(snapshot.sections, operation.targetSectionId)) {
        errors.push(`targetSectionId ${operation.targetSectionId} does not exist`);
      }
      break;
    case 'create_memory_candidate':
      if (!hasId(snapshot.sections, operation.targetSectionId)) {
        errors.push(`targetSectionId ${operation.targetSectionId} does not exist`);
      }
      break;
    case 'no_op':
      break;
    case 'create_relation':
      if (!hasId(snapshot.semanticUnits, operation.fromUnitId)) {
        errors.push(`fromUnitId ${operation.fromUnitId} does not exist`);
      }
      if (!hasId(snapshot.semanticUnits, operation.toUnitId)) {
        errors.push(`toUnitId ${operation.toUnitId} does not exist`);
      }
      break;
    case 'insert_assist_block':
      if (operation.position.afterBlockId !== undefined && !hasId(snapshot.blocks, operation.position.afterBlockId)) {
        errors.push(`position.afterBlockId ${operation.position.afterBlockId} does not exist`);
      }
      if (
        operation.position.appendToSectionId !== undefined &&
        !hasId(snapshot.sections, operation.position.appendToSectionId)
      ) {
        errors.push(`position.appendToSectionId ${operation.position.appendToSectionId} does not exist`);
      }
      break;
    case 'mark_stale':
      validateStaleTargetExists(operation.targetType, operation.targetId, snapshot, errors);
      break;
  }

  return errors;
}

function validateSourceSpansUseUserBlocks(
  sourceSpans: readonly SourceSpanContract[],
  snapshot: OperationRouterSnapshot,
  errors: string[],
): void {
  for (const [index, span] of sourceSpans.entries()) {
    const block = snapshot.blocks.find((candidate) => candidate.id === span.blockId);
    if (!block) {
      errors.push(`sourceSpans[${index}].blockId ${span.blockId} does not exist`);
    } else if (block.origin !== userAuthoredBlockOrigin) {
      errors.push(`sourceSpans[${index}].blockId ${span.blockId} must reference a user-authored block`);
    }
  }
}

function validateStaleTargetExists(
  targetType: 'semantic_unit' | 'memory_candidate' | 'assist_block',
  targetId: string,
  snapshot: OperationRouterSnapshot,
  errors: string[],
): void {
  if (targetType === 'semantic_unit' && !hasId(snapshot.semanticUnits, targetId)) {
    errors.push(`target semantic_unit ${targetId} does not exist`);
  }
  if (targetType === 'memory_candidate' && !hasId(snapshot.memoryCandidates, targetId)) {
    errors.push(`target memory_candidate ${targetId} does not exist`);
  }
  if (targetType === 'assist_block' && !hasId(snapshot.assistBlocks, targetId)) {
    errors.push(`target assist_block ${targetId} does not exist`);
  }
}

function createApplyResult(operation: StructureOperation, policy: OperationPolicy): OperationApplyResult {
  switch (operation.type) {
    case 'create_semantic_unit':
    case 'create_relation':
    case 'mark_stale':
      return {
        action: 'apply',
        effect: operation.type,
        reason: 'silent policy operation is safe to apply through the runtime boundary',
      };
    case 'insert_assist_block':
      return {
        action: 'propose',
        effect: 'insert_assist_block',
        policy: 'inline',
        reason: 'inline assist block requires UI/runtime insertion boundary',
      };
    case 'create_memory_candidate':
      return {
        action: 'propose',
        effect: 'create_memory_candidate',
        policy: 'review',
        reason: 'memory candidate requires user or policy review before activation',
      };
    case 'no_op':
      return {
        action: 'no_apply',
        effect: 'no_op',
        reason: operation.reason,
      };
    default:
      return {
        action: 'no_apply',
        effect: 'no_op',
        reason: `unsupported policy ${policy}`,
      };
  }
}

function blockedRoute(input: {
  input: unknown;
  operationId?: string;
  operationType: string;
  operation?: StructureOperation;
  errors: string[];
  options: RouteOperationOptions;
  now: number;
  applyResult?: OperationApplyResult;
}): OperationRouteResult {
  const auditRecord = createAuditRecord({
    input: input.input,
    ...(input.operation === undefined ? {} : { operation: input.operation }),
    ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
    operationType: input.operationType.trim(),
    policy: 'blocked',
    status: 'rejected',
    errors: input.errors.map((error) => error.trim()),
    options: input.options,
    now: input.now,
  });

  return {
    ok: false,
    accepted: false,
    policy: 'blocked',
    status: 'rejected',
    ...(input.operation === undefined ? {} : { operation: input.operation }),
    errors: input.errors,
    ...(auditRecord === undefined ? {} : { auditRecord }),
    applyResult: input.applyResult ?? { action: 'reject', reason: input.errors.join('; ') },
  };
}

function createAuditRecord(input: {
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
    default:
      return undefined;
  }
}

function getOperationType(input: unknown): string {
  if (isRecord(input) && typeof input.type === 'string' && input.type.trim().length > 0) {
    return input.type;
  }
  return 'unknown';
}

function getConfidence(input: unknown): number | undefined {
  if (isRecord(input) && typeof input.confidence === 'number' && Number.isFinite(input.confidence)) {
    return input.confidence;
  }
  return undefined;
}

function resolveOperationId(options: RouteOperationOptions): string | undefined {
  if (isNonEmptyString(options.operationId)) {
    return options.operationId.trim();
  }
  return undefined;
}

function resolveNow(options: RouteOperationOptions): number {
  return isFiniteNumber(options.now) ? options.now : Date.now();
}

function resolveSequence(options: RouteOperationOptions): number {
  return isNonNegativeInteger(options.sequence) ? options.sequence : 0;
}

function resolveConfidenceThreshold(options: RouteOperationOptions): number {
  return isConfidenceThreshold(options.confidenceThreshold) ? options.confidenceThreshold : 0.5;
}

function combineRoutePolicies(policies: readonly OperationPolicy[]): OperationPolicy {
  if (policies.some((policy) => policy === 'blocked')) {
    return 'blocked';
  }
  if (policies.some((policy) => policy === 'review')) {
    return 'review';
  }
  if (policies.some((policy) => policy === 'inline')) {
    return 'inline';
  }
  return 'silent';
}

function hasId(values: readonly { id: string }[], id: string): boolean {
  return values.some((value) => value.id === id);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isConfidenceThreshold(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isOperationPolicy(value: unknown): value is OperationPolicy {
  return typeof value === 'string' && (operationPolicies as readonly string[]).includes(value);
}

function isOperationStatus(value: unknown): value is OperationStatus {
  return typeof value === 'string' && (operationStatuses as readonly string[]).includes(value);
}

function isOperationTargetType(value: unknown): value is OperationTargetType {
  return typeof value === 'string' && (operationTargetTypes as readonly string[]).includes(value);
}

function validateRequiredTrimmedString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): void {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string`);
  } else if (value !== value.trim()) {
    errors.push(`${path} must be trimmed`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
