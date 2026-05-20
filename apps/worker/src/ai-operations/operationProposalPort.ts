// Application/runtime persistence port for proposed AI operations.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/repository-topology.md

export type OperationProposalState = 'pending' | 'accepted' | 'dismissed';

export interface RuntimeOperationAuditRecord {
  id: string;
  workspaceId: string;
  status: string;
  noteId?: string;
  structureJobId?: string;
  operationType?: string;
  policy?: string;
  operation?: unknown;
  errors?: readonly string[];
  sourceSpans?: readonly unknown[];
  confidence?: number;
  targetType?: string;
  targetId?: string;
  generatedBy?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface OperationProposalRecord {
  operationId: string;
  workspaceId: string;
  state: OperationProposalState;
  auditRecord: RuntimeOperationAuditRecord;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  dismissedAt?: number;
}

export interface OperationProposalSaveInput {
  operationId: string;
  workspaceId: string;
  auditRecord: RuntimeOperationAuditRecord | unknown;
  now: number;
}

export interface OperationProposalLookupInput {
  operationId: string;
  workspaceId: string;
}

export interface OperationProposalStateUpdateInput extends OperationProposalLookupInput {
  state: Exclude<OperationProposalState, 'pending'>;
  now: number;
}

export interface OperationProposalPortResult {
  ok: boolean;
  errors: string[];
  proposal?: OperationProposalRecord;
}

export interface OperationProposalPersistenceFlowResult extends OperationProposalPortResult {
  activeProjectionMutations: [];
  noteSotMutations: [];
}

export interface OperationProposalPersistencePort {
  saveProposal(input: OperationProposalSaveInput): Promise<OperationProposalPortResult>;
  findProposal(input: OperationProposalLookupInput): Promise<OperationProposalRecord | undefined>;
  updateProposalState(input: OperationProposalStateUpdateInput): Promise<OperationProposalPortResult>;
}

export class InMemoryOperationProposalPersistencePort implements OperationProposalPersistencePort {
  private readonly proposals = new Map<string, OperationProposalRecord>();

  async saveProposal(input: OperationProposalSaveInput): Promise<OperationProposalPortResult> {
    const errors = validateOperationProposalSaveInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const auditRecord = input.auditRecord as RuntimeOperationAuditRecord;
    const proposal: OperationProposalRecord = {
      operationId: input.operationId,
      workspaceId: input.workspaceId,
      state: 'pending',
      auditRecord: cloneAuditRecord(auditRecord),
      createdAt: input.now,
      updatedAt: input.now,
    };

    const key = proposalKey(proposal.workspaceId, proposal.operationId);
    if (this.proposals.has(key)) {
      return {
        ok: false,
        errors: [`operation proposal ${proposal.operationId} already exists in workspace ${proposal.workspaceId}`],
      };
    }

    this.proposals.set(key, cloneProposal(proposal));
    return { ok: true, errors: [], proposal: cloneProposal(proposal) };
  }

  async findProposal(input: OperationProposalLookupInput): Promise<OperationProposalRecord | undefined> {
    if (!isStableRuntimeId(input.workspaceId) || !isStableRuntimeId(input.operationId)) {
      return undefined;
    }

    const proposal = this.proposals.get(proposalKey(input.workspaceId, input.operationId));
    return proposal === undefined ? undefined : cloneProposal(proposal);
  }

  async updateProposalState(input: OperationProposalStateUpdateInput): Promise<OperationProposalPortResult> {
    const errors = validateOperationProposalStateUpdateInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const key = proposalKey(input.workspaceId, input.operationId);
    const current = this.proposals.get(key);
    if (current === undefined) {
      return {
        ok: false,
        errors: [`operation proposal ${input.operationId} was not found in workspace ${input.workspaceId}`],
      };
    }

    if (current.state !== 'pending') {
      return {
        ok: false,
        errors: [`operation proposal ${input.operationId} is already ${current.state}`],
      };
    }

    const updated: OperationProposalRecord = {
      ...current,
      state: input.state,
      updatedAt: input.now,
      ...(input.state === 'accepted' ? { acceptedAt: input.now } : { dismissedAt: input.now }),
    };

    this.proposals.set(key, cloneProposal(updated));
    return { ok: true, errors: [], proposal: cloneProposal(updated) };
  }

  listProposals(): OperationProposalRecord[] {
    return Array.from(this.proposals.values(), cloneProposal);
  }
}

export async function runOperationProposalPersistenceFlow(
  input: OperationProposalSaveInput & { proposalPersistence: OperationProposalPersistencePort },
): Promise<OperationProposalPersistenceFlowResult> {
  const result = await input.proposalPersistence.saveProposal({
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    auditRecord: input.auditRecord,
    now: input.now,
  });

  return {
    ...result,
    activeProjectionMutations: [],
    noteSotMutations: [],
  };
}

export function validateOperationProposalSaveInput(input: OperationProposalSaveInput): string[] {
  const errors = validateOperationProposalIdentity(input);

  if (!isRecord(input.auditRecord)) {
    errors.push('auditRecord must be an object');
    return errors;
  }

  if (input.auditRecord.id !== input.operationId) {
    errors.push('auditRecord.id must match operationId');
  }
  if (input.auditRecord.workspaceId !== input.workspaceId) {
    errors.push('auditRecord.workspaceId must match workspaceId');
  }
  if (input.auditRecord.status !== 'proposed') {
    errors.push('auditRecord.status must be proposed');
  }
  if (input.auditRecord.policy !== 'inline' && input.auditRecord.policy !== 'review') {
    errors.push('auditRecord.policy must be inline or review for proposal persistence');
  }
  if (
    input.auditRecord.operationType !== 'insert_assist_block' &&
    input.auditRecord.operationType !== 'create_memory_candidate'
  ) {
    errors.push('auditRecord.operationType must be insert_assist_block or create_memory_candidate for proposal persistence');
  }

  return errors;
}

function validateOperationProposalStateUpdateInput(input: OperationProposalStateUpdateInput): string[] {
  const errors = validateOperationProposalIdentity(input);
  if (input.state !== 'accepted' && input.state !== 'dismissed') {
    errors.push('state must be accepted or dismissed');
  }
  return errors;
}

function validateOperationProposalIdentity(input: {
  operationId: string;
  workspaceId: string;
  now: number;
}): string[] {
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

function proposalKey(workspaceId: string, operationId: string): string {
  return `${workspaceId}\u0000${operationId}`;
}

function cloneProposal(proposal: OperationProposalRecord): OperationProposalRecord {
  return {
    operationId: proposal.operationId,
    workspaceId: proposal.workspaceId,
    state: proposal.state,
    auditRecord: cloneAuditRecord(proposal.auditRecord),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    ...(proposal.acceptedAt === undefined ? {} : { acceptedAt: proposal.acceptedAt }),
    ...(proposal.dismissedAt === undefined ? {} : { dismissedAt: proposal.dismissedAt }),
  };
}

function cloneAuditRecord(record: RuntimeOperationAuditRecord): RuntimeOperationAuditRecord {
  return clonePlainValue(record) as RuntimeOperationAuditRecord;
}

function clonePlainValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clonePlainValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlainValue(entry)]));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
