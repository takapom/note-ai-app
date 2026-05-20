// Worker runtime handlers for explicit AI operation proposal approval.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/repository-topology.md

import {
  type OperationProposalPersistencePort,
  type OperationProposalRecord,
  type RuntimeOperationAuditRecord,
} from './operationProposalPort.ts';

export interface OperationApprovalRuntimeHandlerInput {
  proposalPersistence: OperationProposalPersistencePort;
  workspaceId: string;
  operationId: string;
  now: number;
}

export interface ApprovedOperationIntent {
  type: 'operation_proposal_accepted';
  workspaceId: string;
  operationId: string;
  auditRecord: RuntimeOperationAuditRecord;
  acceptedAt: number;
}

export interface OperationApprovalRuntimeHandlerResult {
  ok: boolean;
  errors: string[];
  proposal?: OperationProposalRecord;
  approvedIntent?: ApprovedOperationIntent;
  activeProjectionMutations: [];
  directApplyResults: [];
  noteSotMutations: [];
  userAuthoredBlockMutations: [];
}

export async function runOperationAcceptHandler(
  input: OperationApprovalRuntimeHandlerInput,
): Promise<OperationApprovalRuntimeHandlerResult> {
  const lookup = await lookupPendingProposal(input);
  if (!lookup.ok) {
    return approvalResult({ errors: lookup.errors });
  }

  const update = await input.proposalPersistence.updateProposalState({
    workspaceId: input.workspaceId,
    operationId: input.operationId,
    state: 'accepted',
    now: input.now,
  });

  if (!update.ok || update.proposal === undefined) {
    return approvalResult({ errors: update.errors });
  }

  return approvalResult({
    errors: [],
    proposal: update.proposal,
    approvedIntent: {
      type: 'operation_proposal_accepted',
      workspaceId: update.proposal.workspaceId,
      operationId: update.proposal.operationId,
      auditRecord: update.proposal.auditRecord,
      acceptedAt: input.now,
    },
  });
}

export async function runOperationDismissHandler(
  input: OperationApprovalRuntimeHandlerInput,
): Promise<OperationApprovalRuntimeHandlerResult> {
  const lookup = await lookupPendingProposal(input);
  if (!lookup.ok) {
    return approvalResult({ errors: lookup.errors });
  }

  const update = await input.proposalPersistence.updateProposalState({
    workspaceId: input.workspaceId,
    operationId: input.operationId,
    state: 'dismissed',
    now: input.now,
  });

  if (!update.ok || update.proposal === undefined) {
    return approvalResult({ errors: update.errors });
  }

  return approvalResult({ errors: [], proposal: update.proposal });
}

async function lookupPendingProposal(input: OperationApprovalRuntimeHandlerInput): Promise<{
  ok: boolean;
  errors: string[];
  proposal?: OperationProposalRecord;
}> {
  const identityErrors = validateHandlerIdentity(input);
  if (identityErrors.length > 0) {
    return { ok: false, errors: identityErrors };
  }

  const proposal = await input.proposalPersistence.findProposal({
    workspaceId: input.workspaceId,
    operationId: input.operationId,
  });

  if (proposal === undefined) {
    return {
      ok: false,
      errors: [`operation proposal ${input.operationId} was not found in workspace ${input.workspaceId}`],
    };
  }

  const proposalErrors = validateWorkspaceScopedProposal(input, proposal);
  if (proposalErrors.length > 0) {
    return { ok: false, errors: proposalErrors };
  }

  if (proposal.state !== 'pending') {
    return {
      ok: false,
      errors: [`operation proposal ${input.operationId} is already ${proposal.state}`],
    };
  }

  return { ok: true, errors: [], proposal };
}

function validateHandlerIdentity(input: OperationApprovalRuntimeHandlerInput): string[] {
  const errors: string[] = [];

  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.operationId)) {
    errors.push('operationId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

function validateWorkspaceScopedProposal(
  input: OperationApprovalRuntimeHandlerInput,
  proposal: OperationProposalRecord,
): string[] {
  const errors: string[] = [];

  if (proposal.workspaceId !== input.workspaceId) {
    errors.push('proposal.workspaceId must match workspaceId');
  }
  if (proposal.operationId !== input.operationId) {
    errors.push('proposal.operationId must match operationId');
  }
  if (proposal.auditRecord.workspaceId !== input.workspaceId) {
    errors.push('proposal.auditRecord.workspaceId must match workspaceId');
  }
  if (proposal.auditRecord.id !== input.operationId) {
    errors.push('proposal.auditRecord.id must match operationId');
  }
  if (proposal.auditRecord.status !== 'proposed') {
    errors.push('proposal.auditRecord.status must be proposed');
  }
  if (proposal.auditRecord.policy !== 'inline' && proposal.auditRecord.policy !== 'review') {
    errors.push('proposal.auditRecord.policy must be inline or review');
  }
  if (
    proposal.auditRecord.operationType !== 'insert_assist_block' &&
    proposal.auditRecord.operationType !== 'create_memory_candidate'
  ) {
    errors.push('proposal.auditRecord.operationType must be insert_assist_block or create_memory_candidate');
  }

  return errors;
}

function approvalResult(
  partial: Pick<OperationApprovalRuntimeHandlerResult, 'errors'> &
    Partial<Omit<OperationApprovalRuntimeHandlerResult, 'ok' | 'errors' | 'activeProjectionMutations' | 'directApplyResults' | 'noteSotMutations' | 'userAuthoredBlockMutations'>>,
): OperationApprovalRuntimeHandlerResult {
  return {
    ok: partial.errors.length === 0,
    errors: partial.errors,
    ...(partial.proposal === undefined ? {} : { proposal: partial.proposal }),
    ...(partial.approvedIntent === undefined ? {} : { approvedIntent: partial.approvedIntent }),
    activeProjectionMutations: [],
    directApplyResults: [],
    noteSotMutations: [],
    userAuthoredBlockMutations: [],
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
