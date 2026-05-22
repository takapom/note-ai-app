// Operation Router option validation and route policy composition.
// Authority: docs/contracts/operation-return-contract.md

import type { OperationPolicy } from './operationContract.ts';
import type { RouteOperationOptions } from './operationRouterTypes.ts';
import {
  isConfidenceThreshold,
  isFiniteNumber,
  isNonEmptyString,
  isNonNegativeInteger,
} from './operationRouterPrimitives.ts';

export function validateRouteOptions(options: RouteOperationOptions): string[] {
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

export function validateOperationListRouteOptions(
  options: RouteOperationOptions,
  operationCount: number,
): string[] {
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

export function resolveOperationId(options: RouteOperationOptions): string | undefined {
  if (isNonEmptyString(options.operationId)) {
    return options.operationId.trim();
  }
  return undefined;
}

export function resolveNow(options: RouteOperationOptions): number {
  return isFiniteNumber(options.now) ? options.now : Date.now();
}

export function resolveSequence(options: RouteOperationOptions): number {
  return isNonNegativeInteger(options.sequence) ? options.sequence : 0;
}

export function resolveConfidenceThreshold(options: RouteOperationOptions): number {
  return isConfidenceThreshold(options.confidenceThreshold) ? options.confidenceThreshold : 0.5;
}

export function combineRoutePolicies(policies: readonly OperationPolicy[]): OperationPolicy {
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
