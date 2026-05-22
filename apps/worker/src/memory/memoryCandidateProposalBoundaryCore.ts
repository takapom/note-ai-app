// Runtime boundary for accepted memory candidate operation proposals.
// Authority: docs/contracts/memory.md

import { validateMemoryItem } from '../../../../contexts/memory/src/contract/memoryContract.ts';
import {
  cloneWriteIntent,
  isCreateMemoryCandidateOperation,
  mapCreateMemoryCandidateOperationToMemory,
  validateBoundaryInput,
  validateCreateMemoryCandidateOperation,
  validateMemoryCandidateApprovalInputScope,
} from './memoryCandidateProposalHelpers.ts';
import { validateMemoryCandidateWriteIntent } from './memoryCandidatePersistencePorts.ts';
import type {
  MemoryCandidateProposalBoundaryInput,
  MemoryCandidateProposalBoundaryResult,
  MemoryCandidateWriteIntent,
} from './memoryCandidateProposalTypes.ts';

export async function runMemoryCandidateProposalBoundary(
  input: MemoryCandidateProposalBoundaryInput,
): Promise<MemoryCandidateProposalBoundaryResult> {
  const prepared = prepareMemoryCandidateWriteIntent(input);
  if (!prepared.ok) {
    return { ok: false, errors: prepared.errors };
  }
  if (prepared.writeIntent === undefined) {
    return { ok: true, errors: [] };
  }

  const persisted = await input.memoryCandidatePersistence.saveMemoryCandidate(prepared.writeIntent);
  return {
    ok: persisted.ok,
    errors: persisted.errors,
    ...(persisted.memory === undefined ? {} : { memory: persisted.memory }),
    ...(persisted.ok ? { writeIntent: cloneWriteIntent(prepared.writeIntent) } : {}),
  };
}

export function prepareMemoryCandidateWriteIntent(
  input: MemoryCandidateProposalBoundaryInput,
): { ok: true; writeIntent?: MemoryCandidateWriteIntent } | { ok: false; errors: string[] } {
  const inputErrors = validateBoundaryInput(input);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }

  if (input.approvalInput === undefined) {
    return { ok: true };
  }

  const intentErrors = validateMemoryCandidateApprovalInputScope(input);
  if (intentErrors.length > 0) {
    return { ok: false, errors: intentErrors };
  }

  if (input.approvalInput.auditRecord.operationType !== 'create_memory_candidate') {
    return { ok: true };
  }

  const operation = input.approvalInput.auditRecord.operation;
  const operationErrors = validateCreateMemoryCandidateOperation(operation);
  if (operationErrors.length > 0 || !isCreateMemoryCandidateOperation(operation)) {
    return {
      ok: false,
      errors: operationErrors.length > 0
        ? operationErrors.map((error) => `approvalInput.auditRecord.operation: ${error}`)
        : ['approvalInput.auditRecord.operation must be create_memory_candidate'],
    };
  }

  const memory = mapCreateMemoryCandidateOperationToMemory({
    workspaceId: input.workspaceId,
    userId: input.userId,
    operationId: input.approvalInput.operationId,
    operation,
    now: input.now,
    ...(input.approvalInput.auditRecord.noteId === undefined
      ? {}
      : { noteId: input.approvalInput.auditRecord.noteId }),
  });
  const memoryValidation = validateMemoryItem(memory);
  if (!memoryValidation.valid) {
    return {
      ok: false,
      errors: memoryValidation.errors.map((error) => `memory candidate: ${error}`),
    };
  }

  const writeIntent = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    sourceOperationId: input.approvalInput.operationId,
    memory,
  };
  const writeIntentErrors = validateMemoryCandidateWriteIntent(writeIntent);
  if (writeIntentErrors.length > 0) {
    return {
      ok: false,
      errors: writeIntentErrors.map((error) => `memory candidate: ${error}`),
    };
  }

  return { ok: true, writeIntent };
}
