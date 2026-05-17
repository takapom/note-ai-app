// Live product semantics for the AI Operation Router.
// Authority: docs/contracts/operation-return-contract.md
// Companion: docs/contracts/app-note-model.md, docs/contracts/data-model.md, docs/contracts/api-events.md

import type { BlockOrigin } from '../../../note-model/src/contract/noteContract.ts';
import {
  classifyOperationPolicy,
  type OperationPolicy,
  type OperationStatus,
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
      operationId,
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
      operationId,
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
    operationId,
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

  const results = input.map((operation, index) =>
    routeOperation(operation, snapshot, {
      ...options,
      sequence: options.sequence === undefined ? index : options.sequence + index,
      ...(options.operationId === undefined
        ? {}
        : {
            operationId: isNonEmptyString(options.operationId)
              ? `${options.operationId.trim()}_${index}`
              : options.operationId,
          }),
    }),
  );

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
  auditRecord: AiOperationAuditRecordContract,
  now: number,
): OperationRevertResult {
  const errors: string[] = [];

  if (!isFiniteNumber(now)) {
    errors.push('now must be a finite number');
  }

  if (auditRecord.status !== 'applied' && auditRecord.status !== 'proposed') {
    errors.push(`operation status ${auditRecord.status} cannot be reverted`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      status: 'failed',
      errors,
      auditRecord: {
        ...auditRecord,
        status: 'failed',
        errors: [...auditRecord.errors, ...errors],
        updatedAt: isFiniteNumber(now) ? now : auditRecord.updatedAt,
      },
    };
  }

  return {
    ok: true,
    status: 'reverted',
    errors: [],
    auditRecord: {
      ...auditRecord,
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

  if (options.operationId !== undefined && !isNonEmptyString(options.operationId)) {
    errors.push('operationId must be a non-empty string when provided');
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
    } else if (block.origin !== 'user') {
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
  operationId: string;
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
    operationId: input.operationId,
    operationType: input.operationType,
    policy: 'blocked',
    status: 'rejected',
    errors: input.errors,
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
  operationId: string;
  operationType: string;
  policy: OperationPolicy;
  status: OperationStatus;
  errors: string[];
  options: RouteOperationOptions;
  now: number;
}): AiOperationAuditRecordContract | undefined {
  if (!isNonEmptyString(input.options.workspaceId)) {
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
    ...(target === undefined ? {} : { targetType: target.targetType, targetId: target.targetId }),
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
    sourceBlockId: span.blockId,
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

function resolveOperationId(options: RouteOperationOptions): string {
  if (isNonEmptyString(options.operationId)) {
    return options.operationId.trim();
  }
  const now = resolveNow(options);
  const sequence = resolveSequence(options);
  return `operation_${now}_${sequence}`;
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

function isConfidenceThreshold(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
