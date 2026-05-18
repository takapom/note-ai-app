// Worker use-case flow for generated AI operation routing.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md

import type { AiOperationAuditRecordContract } from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import type { OperationAuditPersistencePort } from './operationAuditPort.ts';
import {
  routeGeneratedOperations,
  type RuntimeOperationRoutingInput,
  type RuntimeOperationRoutingResult,
} from './operationRoutingAdapter.ts';

export interface OperationRoutingFlowInput extends RuntimeOperationRoutingInput {
  auditPersistence: OperationAuditPersistencePort;
}

export interface OperationAuditPersistenceResult {
  attempted: boolean;
  ok: boolean;
  savedCount: number;
  errors: string[];
}

export interface OperationRoutingFlowResult {
  routing: RuntimeOperationRoutingResult;
  auditPersistence: OperationAuditPersistenceResult;
  directApplyResults: [];
}

export async function runOperationRoutingFlow(
  input: OperationRoutingFlowInput,
): Promise<OperationRoutingFlowResult> {
  const routing = routeGeneratedOperations(input);

  if (routing.auditRecords.length === 0) {
    return {
      routing,
      auditPersistence: {
        attempted: false,
        ok: true,
        savedCount: 0,
        errors: [],
      },
      directApplyResults: [],
    };
  }

  const auditPersistence = await saveAuditRecords(input.auditPersistence, routing.auditRecords);

  return {
    routing,
    auditPersistence,
    directApplyResults: [],
  };
}

async function saveAuditRecords(
  port: OperationAuditPersistencePort,
  records: readonly AiOperationAuditRecordContract[],
): Promise<OperationAuditPersistenceResult> {
  let savedCount = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      const saveResult = await port.save(record);

      if (saveResult.ok) {
        savedCount += 1;
      } else {
        errors.push(...saveResult.errors.map((error) => `audit ${record.id}: ${error}`));
      }
    } catch (error) {
      errors.push(`audit ${record.id}: ${toPersistenceErrorMessage(error)}`);
    }
  }

  return {
    attempted: true,
    ok: errors.length === 0,
    savedCount,
    errors,
  };
}

function toPersistenceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `audit persistence failed: ${error.message.trim()}`;
  }

  return 'audit persistence failed';
}
