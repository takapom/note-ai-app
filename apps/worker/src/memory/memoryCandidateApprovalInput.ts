// Memory-owned approval input for accepted memory candidate proposals.
// Authority: docs/contracts/memory.md

export interface MemoryCandidateApprovalAuditRecord {
  id: string;
  workspaceId: string;
  status: string;
  noteId?: string;
  operationType?: string;
  policy?: string;
  operation?: unknown;
}

export interface MemoryCandidateApprovalInput {
  type: 'memory_candidate_from_accepted_operation';
  workspaceId: string;
  operationId: string;
  acceptedAt: number;
  auditRecord: MemoryCandidateApprovalAuditRecord;
}
