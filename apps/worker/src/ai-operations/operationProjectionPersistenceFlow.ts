// Worker use-case flow for persisting Operation Router projection effects.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/repository-topology.md

import type {
  AiOperationAuditRecordContract,
  OperationListRouteResult,
  OperationRouteResult,
} from '../../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import {
  runOperationProposalPersistenceFlow,
  type OperationProposalPersistenceFlowResult,
  type OperationProposalPersistencePort,
} from './operationProposalPort.ts';
import {
  isActiveProjectionEffect,
  type OperationProjectionPersistencePort,
  type OperationProjectionWriteIntent,
} from './operationProjectionPort.ts';

export interface OperationProjectionPersistenceFlowInput {
  routing: OperationListRouteResult;
  projectionPersistence: OperationProjectionPersistencePort;
  proposalPersistence: OperationProposalPersistencePort;
  now: number;
}

export interface OperationProjectionPersistenceSummary {
  attempted: boolean;
  ok: boolean;
  savedCount: number;
  errors: string[];
}

export interface OperationProposalPersistenceSummary {
  attempted: boolean;
  ok: boolean;
  savedCount: number;
  errors: string[];
  results: OperationProposalPersistenceFlowResult[];
}

export interface OperationProjectionPersistenceFlowResult {
  routing: OperationListRouteResult;
  projectionPersistence: OperationProjectionPersistenceSummary;
  proposalPersistence: OperationProposalPersistenceSummary;
  activeProjectionWriteIntents: OperationProjectionWriteIntent[];
  directApplyResults: [];
  noteSotMutations: [];
  userAuthoredBlockMutations: [];
}

export async function runOperationProjectionPersistenceFlow(
  input: OperationProjectionPersistenceFlowInput,
): Promise<OperationProjectionPersistenceFlowResult> {
  const projectionPersistence = noProjectionPersistence();
  const proposalPersistence = noProposalPersistence();
  const activeProjectionWriteIntents: OperationProjectionWriteIntent[] = [];

  for (const [index, routeResult] of input.routing.results.entries()) {
    const applyResult = routeResult.applyResult;

    if (applyResult.action === 'apply') {
      projectionPersistence.attempted = true;
      const intent = createActiveProjectionWriteIntent(routeResult, input.now);

      if (intent === undefined) {
        projectionPersistence.errors.push(`operations[${index}]: missing active projection audit record`);
        continue;
      }

      try {
        const saveResult = await input.projectionPersistence.saveActiveProjection(intent);
        if (saveResult.ok) {
          projectionPersistence.savedCount += 1;
          activeProjectionWriteIntents.push(saveResult.intent ?? intent);
        } else {
          projectionPersistence.errors.push(
            ...normalizePersistenceErrors(
              saveResult.errors,
              'projection persistence failed',
              'projection persistence unavailable',
            ).map((error) => `projection ${intent.operationId}: ${error}`),
          );
        }
      } catch (error) {
        projectionPersistence.errors.push(
          `projection ${intent.operationId}: ${toPersistenceErrorMessage(error, 'projection persistence unavailable')}`,
        );
      }
      continue;
    }

    if (applyResult.action === 'propose') {
      proposalPersistence.attempted = true;
      const auditRecord = routeResult.auditRecord;

      if (auditRecord === undefined) {
        proposalPersistence.errors.push(`operations[${index}]: missing proposal audit record`);
        continue;
      }

      try {
        const proposalResult = await runOperationProposalPersistenceFlow({
          proposalPersistence: input.proposalPersistence,
          operationId: auditRecord.id,
          workspaceId: auditRecord.workspaceId,
          auditRecord,
          now: input.now,
        });
        proposalPersistence.results.push(proposalResult);

        if (proposalResult.ok) {
          proposalPersistence.savedCount += 1;
        } else {
          proposalPersistence.errors.push(
            ...normalizePersistenceErrors(
              proposalResult.errors,
              'proposal persistence failed',
              'proposal persistence unavailable',
            ).map((error) => `proposal ${auditRecord.id}: ${error}`),
          );
        }
      } catch (error) {
        proposalPersistence.errors.push(
          `proposal ${auditRecord.id}: ${toPersistenceErrorMessage(error, 'proposal persistence unavailable')}`,
        );
      }
    }
  }

  projectionPersistence.ok = projectionPersistence.errors.length === 0;
  proposalPersistence.ok = proposalPersistence.errors.length === 0;

  return {
    routing: input.routing,
    projectionPersistence,
    proposalPersistence,
    activeProjectionWriteIntents,
    directApplyResults: [],
    noteSotMutations: [],
    userAuthoredBlockMutations: [],
  };
}

function createActiveProjectionWriteIntent(
  routeResult: OperationRouteResult,
  now: number,
): OperationProjectionWriteIntent | undefined {
  const auditRecord = routeResult.auditRecord;
  const applyResult = routeResult.applyResult;

  if (
    auditRecord === undefined ||
    applyResult.action !== 'apply' ||
    !isActiveProjectionEffect(applyResult.effect)
  ) {
    return undefined;
  }

  return {
    operationId: auditRecord.id,
    workspaceId: auditRecord.workspaceId,
    effect: applyResult.effect,
    reason: applyResult.reason,
    auditRecord: cloneAuditRecord(auditRecord),
    operation: cloneUnknown(auditRecord.operation),
    createdAt: now,
    updatedAt: now,
  };
}

function noProjectionPersistence(): OperationProjectionPersistenceSummary {
  return {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
  };
}

function noProposalPersistence(): OperationProposalPersistenceSummary {
  return {
    attempted: false,
    ok: true,
    savedCount: 0,
    errors: [],
    results: [],
  };
}

function normalizePersistenceErrors(
  errors: readonly string[],
  fallbackMessage: string,
  unavailableMessage: string,
): string[] {
  const normalized = errors
    .map((error) => normalizePersistenceError(error, unavailableMessage))
    .filter((error) => error.trim().length > 0);
  return normalized.length > 0 ? normalized : [fallbackMessage];
}

function toPersistenceErrorMessage(error: unknown, unavailableMessage: string): string {
  if (error instanceof Error) {
    return unavailableMessage;
  }

  return normalizePersistenceError(error, unavailableMessage);
}

function normalizePersistenceError(error: unknown, unavailableMessage: string): string {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.length === 0 || isVolatileInfrastructureDetail(trimmed)) {
      return unavailableMessage;
    }
    return trimmed;
  }

  return unavailableMessage;
}

function isVolatileInfrastructureDetail(message: string): boolean {
  return /\b(sql|sqlite|libsql|turso|database|db|store|executor|connection|network|timeout|provider|auth0|clerk|token|secret)\b/i.test(message);
}

function cloneAuditRecord(record: AiOperationAuditRecordContract): AiOperationAuditRecordContract {
  return {
    ...record,
    operation: cloneUnknown(record.operation),
    errors: [...record.errors],
    sourceSpans: record.sourceSpans.map((span) => ({ ...span })),
  };
}

function cloneUnknown<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
