// Runtime adapter for routing generated AI operations.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/api-events.md

import {
  routeOperationList,
  type OperationListRouteResult,
  type OperationRouterSnapshot,
  type RouteOperationOptions,
} from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';

export interface RuntimeOperationRoutingInput {
  workspaceId: string;
  noteId: string;
  structureJobId: string;
  operationIdPrefix: string;
  aiResponse: unknown;
  snapshot: OperationRouterSnapshot;
  now: number;
  confidenceThreshold?: number;
  generatedBy?: string;
  sequenceStart?: number;
}

export interface RuntimeOperationRoutingResult extends OperationListRouteResult {
  operationIds: string[];
  routedThroughOperationRouter: boolean;
  directApplyResults: [];
}

export function routeGeneratedOperations(input: RuntimeOperationRoutingInput): RuntimeOperationRoutingResult {
  if (!Array.isArray(input.aiResponse)) {
    return withRuntimeBoundary(routeOperationList(input.aiResponse, input.snapshot));
  }

  const boundaryErrors = validateRuntimeRoutingInput(input);
  if (boundaryErrors.length > 0) {
    return blockedRuntimeRoutingResult(input.aiResponse.length, boundaryErrors);
  }

  const sequenceStart = input.sequenceStart ?? 0;
  const operationIds = createOperationIds(input.operationIdPrefix, input.aiResponse.length, sequenceStart);
  const routeOptions: RouteOperationOptions = {
    workspaceId: input.workspaceId.trim(),
    noteId: input.noteId.trim(),
    structureJobId: input.structureJobId.trim(),
    operationIds,
    now: input.now,
    sequence: sequenceStart,
    ...(input.generatedBy === undefined ? {} : { generatedBy: input.generatedBy.trim() }),
    ...(input.confidenceThreshold === undefined ? {} : { confidenceThreshold: input.confidenceThreshold }),
  };

  return withRuntimeBoundary(routeOperationList(input.aiResponse, input.snapshot, routeOptions), operationIds);
}

export function createOperationIds(
  operationIdPrefix: string,
  operationCount: number,
  sequenceStart = 0,
): string[] {
  if (
    !isStableRuntimeId(operationIdPrefix) ||
    !isNonNegativeInteger(operationCount) ||
    !isNonNegativeInteger(sequenceStart)
  ) {
    return [];
  }

  return Array.from({ length: operationCount }, (_, index) => `${operationIdPrefix.trim()}_${sequenceStart + index}`);
}

function validateRuntimeRoutingInput(input: RuntimeOperationRoutingInput): string[] {
  const errors: string[] = [];

  for (const field of ['workspaceId', 'noteId', 'structureJobId', 'operationIdPrefix'] as const) {
    if (!isStableRuntimeId(input[field])) {
      errors.push(`${field} must be a stable non-sentinel runtime id`);
    }
  }

  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  if (input.sequenceStart !== undefined && !isNonNegativeInteger(input.sequenceStart)) {
    errors.push('sequenceStart must be a finite non-negative integer when provided');
  }

  if (
    input.confidenceThreshold !== undefined &&
    (
      typeof input.confidenceThreshold !== 'number' ||
      !Number.isFinite(input.confidenceThreshold) ||
      input.confidenceThreshold < 0 ||
      input.confidenceThreshold > 1
    )
  ) {
    errors.push('confidenceThreshold must be a finite number between 0 and 1 when provided');
  }

  if (input.generatedBy !== undefined && !isStableRuntimeId(input.generatedBy)) {
    errors.push('generatedBy must be a stable non-sentinel runtime id when provided');
  }

  return errors;
}

function blockedRuntimeRoutingResult(operationCount: number, errors: string[]): RuntimeOperationRoutingResult {
  return {
    ok: false,
    policy: 'blocked',
    acceptedCount: 0,
    rejectedCount: operationCount,
    errors,
    results: [],
    auditRecords: [],
    applyResults: [],
    operationIds: [],
    routedThroughOperationRouter: false,
    directApplyResults: [],
  };
}

function withRuntimeBoundary(
  result: OperationListRouteResult,
  operationIds: string[] = [],
): RuntimeOperationRoutingResult {
  return {
    ...result,
    operationIds,
    routedThroughOperationRouter: true,
    directApplyResults: [],
  };
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
