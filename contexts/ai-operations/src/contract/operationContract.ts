// Live product semantics for AI operations.
// Authority: docs/contracts/operation-return-contract.md

import { aiBlockTypes, type AiBlockType } from '../../../note-model/src/contract/noteContract.ts';
import { memoryTypes, type MemoryType } from '../../../memory/src/contract/memoryContract.ts';

export const operationTypes = [
  'create_semantic_unit',
  'create_relation',
  'create_memory_candidate',
  'insert_assist_block',
  'mark_stale',
  'no_op',
] as const;
export type OperationType = (typeof operationTypes)[number];

export const forbiddenOperationTypes = [
  'rewrite_user_block',
  'send_external_message',
  'create_external_event',
  'delete_user_block',
  'modify_user_block_without_review',
] as const;
export type ForbiddenOperationType = (typeof forbiddenOperationTypes)[number];

export const operationPolicies = ['silent', 'inline', 'review', 'blocked'] as const;
export type OperationPolicy = (typeof operationPolicies)[number];

export const operationStatuses = ['proposed', 'applied', 'rejected', 'reverted', 'failed'] as const;
export type OperationStatus = (typeof operationStatuses)[number];

export const semanticUnitTypes = [
  'question',
  'decision',
  'claim',
  'hypothesis',
  'concern',
  'concept',
  'task',
  'evidence',
] as const;
export type SemanticUnitType = (typeof semanticUnitTypes)[number];

export const relationTypes = [
  'supports',
  'contradicts',
  'depends_on',
  'answers',
  'raises',
  'extends',
  'reframes',
  'duplicates',
] as const;
export type RelationType = (typeof relationTypes)[number];

export const assistBlockTypes = aiBlockTypes;
export type AssistBlockType = AiBlockType;

export const staleTargetTypes = ['semantic_unit', 'memory_candidate', 'assist_block'] as const;
export type StaleTargetType = (typeof staleTargetTypes)[number];

export interface SourceSpanContract {
  blockId: string;
  startOffset?: number;
  endOffset?: number;
}

export interface OperationPositionContract {
  afterBlockId?: string;
  appendToSectionId?: string;
}

export type StructureOperation =
  | {
      type: 'create_semantic_unit';
      targetSectionId: string;
      unitType: SemanticUnitType;
      content: string;
      summary: string;
      sourceSpans: SourceSpanContract[];
      confidence: number;
    }
  | {
      type: 'create_relation';
      fromUnitId: string;
      toUnitId: string;
      relationType: RelationType;
      reason: string;
      confidence: number;
    }
  | {
      type: 'create_memory_candidate';
      targetSectionId: string;
      memoryType: MemoryType;
      content: string;
      sourceSpans: SourceSpanContract[];
      confidence: number;
    }
  | {
      type: 'insert_assist_block';
      blockType: AssistBlockType;
      content: string;
      position: OperationPositionContract;
      sourceSpans: SourceSpanContract[];
      confidence: number;
    }
  | {
      type: 'mark_stale';
      targetType: StaleTargetType;
      targetId: string;
      reason: string;
      sourceSpans?: SourceSpanContract[];
    }
  | { type: 'no_op'; reason: string };

export interface OperationValidationResult {
  ok: boolean;
  policy: OperationPolicy;
  errors: string[];
}

export function classifyOperationPolicy(operation: StructureOperation | { type?: unknown }): OperationPolicy {
  switch (operation.type) {
    case 'create_semantic_unit':
    case 'create_relation':
    case 'mark_stale':
      return 'silent';
    case 'insert_assist_block':
      return 'inline';
    case 'create_memory_candidate':
      return 'review';
    case 'no_op':
      return 'silent';
    default:
      return 'blocked';
  }
}

export function validateStructureOperation(input: unknown): OperationValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, policy: 'blocked', errors: ['operation must be an object'] };
  }

  const type = input.type;
  if (!isString(type)) {
    return { ok: false, policy: 'blocked', errors: ['operation.type is required'] };
  }

  if ((forbiddenOperationTypes as readonly string[]).includes(type)) {
    return { ok: false, policy: 'blocked', errors: [`operation type ${type} is forbidden in MVP`] };
  }

  if (!(operationTypes as readonly string[]).includes(type)) {
    return { ok: false, policy: 'blocked', errors: [`unknown operation type ${type}`] };
  }

  const policy = classifyOperationPolicy(input);

  switch (type) {
    case 'create_semantic_unit':
      requireNonEmptyString(errors, input.targetSectionId, 'targetSectionId');
      requireEnum(errors, input.unitType, semanticUnitTypes, 'unitType');
      requireNonEmptyString(errors, input.content, 'content');
      requireNonEmptyString(errors, input.summary, 'summary');
      requireSourceSpans(errors, input.sourceSpans);
      requireConfidence(errors, input.confidence);
      break;
    case 'create_relation':
      requireNonEmptyString(errors, input.fromUnitId, 'fromUnitId');
      requireNonEmptyString(errors, input.toUnitId, 'toUnitId');
      requireEnum(errors, input.relationType, relationTypes, 'relationType');
      requireNonEmptyString(errors, input.reason, 'reason');
      requireConfidence(errors, input.confidence);
      break;
    case 'create_memory_candidate':
      requireNonEmptyString(errors, input.targetSectionId, 'targetSectionId');
      requireEnum(errors, input.memoryType, memoryTypes, 'memoryType');
      requireNonEmptyString(errors, input.content, 'content');
      requireSourceSpans(errors, input.sourceSpans);
      requireConfidence(errors, input.confidence);
      break;
    case 'insert_assist_block':
      requireEnum(errors, input.blockType, assistBlockTypes, 'blockType');
      requireNonEmptyString(errors, input.content, 'content');
      requirePosition(errors, input.position);
      requireSourceSpans(errors, input.sourceSpans);
      requireConfidence(errors, input.confidence);
      break;
    case 'mark_stale':
      requireEnum(errors, input.targetType, staleTargetTypes, 'targetType');
      requireNonEmptyString(errors, input.targetId, 'targetId');
      requireNonEmptyString(errors, input.reason, 'reason');
      if (input.targetType === 'memory_candidate' || input.targetType === 'assist_block') {
        requireSourceSpans(errors, input.sourceSpans);
      }
      break;
    case 'no_op':
      requireNonEmptyString(errors, input.reason, 'reason');
      break;
  }

  return { ok: errors.length === 0, policy: errors.length === 0 ? policy : 'blocked', errors };
}

export function validateOperationList(input: unknown): OperationValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, policy: 'blocked', errors: ['AI response must be an operation list'] };
  }

  let policy: OperationPolicy = 'silent';
  const errors: string[] = [];

  for (const [index, operation] of input.entries()) {
    const result = validateStructureOperation(operation);
    if (result.errors.length > 0) {
      errors.push(...result.errors.map((error) => `operations[${index}]: ${error}`));
    }
    policy = combineOperationPolicies(policy, result.policy);
  }

  return { ok: errors.length === 0, policy: errors.length === 0 ? policy : 'blocked', errors };
}

export function shouldApplyOperation(operation: StructureOperation, confidenceThreshold = 0.5): boolean {
  if ('confidence' in operation && operation.confidence < confidenceThreshold) {
    return false;
  }
  return validateStructureOperation(operation).ok;
}

function requireNonEmptyString(errors: string[], value: unknown, field: string): void {
  if (!isString(value) || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function requireConfidence(errors: string[], value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }
}

function requireSourceSpans(errors: string[], value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('sourceSpans must contain at least one source span');
    return;
  }

  for (const [index, span] of value.entries()) {
    if (!isRecord(span) || !isNonEmptyString(span.blockId)) {
      errors.push(`sourceSpans[${index}].blockId is required`);
    }
    if (isRecord(span) && span.startOffset !== undefined && !isNonNegativeNumber(span.startOffset)) {
      errors.push(`sourceSpans[${index}].startOffset must be non-negative`);
    }
    if (isRecord(span) && span.endOffset !== undefined && !isNonNegativeNumber(span.endOffset)) {
      errors.push(`sourceSpans[${index}].endOffset must be non-negative`);
    }
    if (
      isRecord(span) &&
      isNonNegativeNumber(span.startOffset) &&
      isNonNegativeNumber(span.endOffset) &&
      span.endOffset < span.startOffset
    ) {
      errors.push(`sourceSpans[${index}].endOffset must be greater than or equal to startOffset`);
    }
  }
}

function requirePosition(errors: string[], value: unknown): void {
  if (!isRecord(value)) {
    errors.push('position is required');
    return;
  }
  if (!isNonEmptyString(value.afterBlockId) && !isNonEmptyString(value.appendToSectionId)) {
    errors.push('position requires afterBlockId or appendToSectionId');
  }
}

function requireEnum<T extends readonly string[]>(errors: string[], value: unknown, allowed: T, field: string): void {
  if (!isString(value) || !(allowed as readonly string[]).includes(value)) {
    errors.push(`${field} must be one of ${allowed.join(', ')}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function combineOperationPolicies(current: OperationPolicy, next: OperationPolicy): OperationPolicy {
  if (current === 'blocked' || next === 'blocked') {
    return 'blocked';
  }
  if (current === 'review' || next === 'review') {
    return 'review';
  }
  if (current === 'inline' || next === 'inline') {
    return 'inline';
  }
  return 'silent';
}
