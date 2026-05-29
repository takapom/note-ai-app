// Worker HTTP operation proposal approval route handlers.
// Authority: docs/contracts/api-events.md

import { mapApprovedOperationIntentToMemoryCandidateApprovalInput } from '../../ai-operations/memoryCandidateApprovalMapping.ts';
import {
  runOperationAcceptHandler,
  runOperationDismissHandler,
  type OperationApprovalRuntimeHandlerInput,
  type OperationApprovalRuntimeHandlerResult,
} from '../../ai-operations/operationApprovalRuntimeHandlers.ts';
import {
  prepareMemoryCandidateWriteIntent,
  runMemoryCandidateProposalBoundary,
  type MemoryCandidatePersistencePort,
  type MemoryCandidateProposalBoundaryResult,
} from '../../memory/memoryCandidateProposalBoundary.ts';
import { isStableRuntimeId } from './workerHttpRouteParsers.ts';
import { badRequest, mapOperationApprovalResult, notConfigured } from './workerHttpRouteResponses.ts';
import type {
  WorkerHttpRequest,
  WorkerHttpResponse,
  WorkerHttpRouterPorts,
} from './workerHttpRouterTypes.ts';

export async function runOperationApprovalRoute(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'operationApproval' | 'memoryCandidatePersistence'>,
  operationId: string,
  action: 'accept' | 'dismiss',
): Promise<WorkerHttpResponse> {
  const proposalPersistence = ports.operationApproval;
  if (proposalPersistence === undefined) {
    return notConfigured('operation proposal persistence port is not configured');
  }

  if (action === 'accept') {
    const preflight = await preflightMemoryCandidateProposalAccept(request, ports, operationId);
    if (preflight !== undefined) {
      return preflight;
    }
  }

  const input: OperationApprovalRuntimeHandlerInput = {
    proposalPersistence,
    workspaceId: request.workspaceId,
    operationId,
    now: request.now,
  };
  const result = action === 'accept'
    ? await runOperationAcceptHandler(input)
    : await runOperationDismissHandler(input);

  if (!result.ok || action === 'dismiss') {
    return mapOperationApprovalResult(result);
  }

  const memoryCandidate = await runAcceptedOperationMemoryCandidateBoundary(
    request,
    ports.memoryCandidatePersistence,
    result,
  );

  return mapOperationApprovalResult(result, memoryCandidate);
}

async function preflightMemoryCandidateProposalAccept(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'operationApproval' | 'memoryCandidatePersistence'>,
  operationId: string,
): Promise<WorkerHttpResponse | undefined> {
  const proposal = await ports.operationApproval?.findProposal({
    workspaceId: request.workspaceId,
    operationId,
  });
  if (
    proposal === undefined ||
    proposal.state !== 'pending' ||
    proposal.auditRecord.operationType !== 'create_memory_candidate'
  ) {
    return undefined;
  }

  if (!isStableRuntimeId(request.userId)) {
    return badRequest(['userId must be a stable non-sentinel runtime id for memory candidate proposal persistence']);
  }
  if (ports.memoryCandidatePersistence === undefined) {
    return notConfigured('memory candidate proposal persistence port is not configured');
  }

  const prepared = prepareMemoryCandidateWriteIntent({
    memoryCandidatePersistence: ports.memoryCandidatePersistence,
    workspaceId: request.workspaceId,
    userId: request.userId,
    approvalInput: mapApprovedOperationIntentToMemoryCandidateApprovalInput({
      type: 'operation_proposal_accepted',
      workspaceId: request.workspaceId,
      operationId,
      auditRecord: proposal.auditRecord,
      acceptedAt: request.now,
    }),
    now: request.now,
  });

  return prepared.ok ? undefined : badRequest(prepared.errors);
}

async function runAcceptedOperationMemoryCandidateBoundary(
  request: WorkerHttpRequest,
  memoryCandidatePersistence: MemoryCandidatePersistencePort | undefined,
  approval: OperationApprovalRuntimeHandlerResult,
): Promise<MemoryCandidateProposalBoundaryResult> {
  if (
    approval.approvedIntent === undefined ||
    approval.approvedIntent.auditRecord.operationType !== 'create_memory_candidate'
  ) {
    return { ok: true, errors: [] };
  }

  if (!isStableRuntimeId(request.userId)) {
    return {
      ok: false,
      errors: ['userId must be a stable non-sentinel runtime id for memory candidate proposal persistence'],
    };
  }

  if (memoryCandidatePersistence === undefined) {
    return {
      ok: false,
      errors: ['memory candidate proposal persistence port is not configured'],
    };
  }

  return runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence,
    workspaceId: request.workspaceId,
    userId: request.userId,
    approvalInput: mapApprovedOperationIntentToMemoryCandidateApprovalInput(approval.approvedIntent),
    now: request.now,
  });
}
