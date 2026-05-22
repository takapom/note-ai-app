// Shared validation primitives for Operation Router contracts.
// Authority: docs/contracts/operation-return-contract.md

import {
  type OperationPolicy,
  operationPolicies,
  type OperationStatus,
  operationStatuses,
} from './operationContract.ts';
import { operationTargetTypes, type OperationTargetType } from './operationRouterTypes.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isConfidenceThreshold(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

export function isOperationPolicy(value: unknown): value is OperationPolicy {
  return typeof value === 'string' && (operationPolicies as readonly string[]).includes(value);
}

export function isOperationStatus(value: unknown): value is OperationStatus {
  return typeof value === 'string' && (operationStatuses as readonly string[]).includes(value);
}

export function isOperationTargetType(value: unknown): value is OperationTargetType {
  return typeof value === 'string' && (operationTargetTypes as readonly string[]).includes(value);
}

export function validateRequiredTrimmedString(
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

export function hasId(values: readonly { id: string }[], id: string): boolean {
  return values.some((value) => value.id === id);
}
