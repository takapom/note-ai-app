// Operation Router routing semantics.
// Authority: docs/contracts/operation-return-contract.md

import {
  classifyOperationPolicy,
  type OperationPolicy,
  type StructureOperation,
  validateStructureOperation,
} from './operationContract.ts';
import { createAuditRecord } from './operationRouterAudit.ts';
import { isRecord } from './operationRouterPrimitives.ts';
import {
  combineRoutePolicies,
  resolveConfidenceThreshold,
  resolveNow,
  resolveOperationId,
  validateOperationListRouteOptions,
  validateRouteOptions,
} from './operationRouterRouteOptions.ts';
import { validateOperationTargets } from './operationRouterTargetValidation.ts';
import type {
  OperationApplyEffect,
  OperationApplyResult,
  OperationListRouteResult,
  OperationRouteResult,
  OperationRouterSnapshot,
  RouteOperationOptions,
} from './operationRouterTypes.ts';

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

function validateConfidenceThreshold(operation: StructureOperation, threshold: number): string[] {
  if ('confidence' in operation && operation.confidence < threshold) {
    return [`confidence ${operation.confidence} is below threshold ${threshold}`];
  }
  return [];
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

function getOperationType(input: unknown): string {
  if (isRecord(input) && typeof input.type === 'string' && input.type.trim().length > 0) {
    return input.type;
  }
  return 'unknown';
}
