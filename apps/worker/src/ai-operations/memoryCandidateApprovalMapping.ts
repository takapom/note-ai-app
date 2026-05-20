// Maps accepted AI operation approval intent to memory-owned candidate approval input.
// Authority: docs/contracts/backend-runtime.md

import type { MemoryCandidateApprovalInput } from '../memory/memoryCandidateApprovalInput.ts';
import type { ApprovedOperationIntent } from './operationApprovalRuntimeHandlers.ts';

export function mapApprovedOperationIntentToMemoryCandidateApprovalInput(
  intent: ApprovedOperationIntent,
): MemoryCandidateApprovalInput {
  return {
    type: 'memory_candidate_from_accepted_operation',
    workspaceId: intent.workspaceId,
    operationId: intent.operationId,
    acceptedAt: intent.acceptedAt,
    auditRecord: {
      id: intent.auditRecord.id,
      workspaceId: intent.auditRecord.workspaceId,
      status: intent.auditRecord.status,
      ...(intent.auditRecord.noteId === undefined ? {} : { noteId: intent.auditRecord.noteId }),
      ...(intent.auditRecord.operationType === undefined
        ? {}
        : { operationType: intent.auditRecord.operationType }),
      ...(intent.auditRecord.policy === undefined ? {} : { policy: intent.auditRecord.policy }),
      ...(intent.auditRecord.operation === undefined ? {} : { operation: intent.auditRecord.operation }),
    },
  };
}
