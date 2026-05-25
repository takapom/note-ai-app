// Operation Router target validation.
// Authority: docs/contracts/operation-return-contract.md

import { userAuthoredBlockOrigin } from '../../../note-model/src/contract/noteContract.ts';
import type { SourceSpanContract, StructureOperation } from './operationContract.ts';
import type { OperationRouterSnapshot } from './operationRouterTypes.ts';
import { hasId } from './operationRouterPrimitives.ts';

export function validateOperationTargets(
  operation: StructureOperation,
  snapshot: OperationRouterSnapshot,
  routedNoteId?: string,
): string[] {
  const errors: string[] = [];

  if ('sourceSpans' in operation && operation.sourceSpans !== undefined) {
    validateSourceSpansUseUserBlocks(operation.sourceSpans, snapshot, errors);
  }

  switch (operation.type) {
    case 'create_semantic_unit':
      if (!hasId(snapshot.sections, operation.targetSectionId)) {
        errors.push(`targetSectionId ${operation.targetSectionId} does not exist`);
      }
      break;
    case 'create_memory_candidate':
      if (!hasId(snapshot.sections, operation.targetSectionId)) {
        errors.push(`targetSectionId ${operation.targetSectionId} does not exist`);
      }
      break;
    case 'no_op':
      break;
    case 'create_relation':
      if (!hasId(snapshot.semanticUnits, operation.fromUnitId)) {
        errors.push(`fromUnitId ${operation.fromUnitId} does not exist`);
      }
      if (!hasId(snapshot.semanticUnits, operation.toUnitId)) {
        errors.push(`toUnitId ${operation.toUnitId} does not exist`);
      }
      break;
    case 'insert_assist_block':
      if (operation.position.afterBlockId !== undefined && !hasId(snapshot.blocks, operation.position.afterBlockId)) {
        errors.push(`position.afterBlockId ${operation.position.afterBlockId} does not exist`);
      }
      if (
        operation.position.appendToSectionId !== undefined &&
        !hasId(snapshot.sections, operation.position.appendToSectionId)
      ) {
        errors.push(`position.appendToSectionId ${operation.position.appendToSectionId} does not exist`);
      }
      break;
    case 'create_organized_note_version':
      if (!hasId(snapshot.notes, operation.targetNoteId)) {
        errors.push(`targetNoteId ${operation.targetNoteId} does not exist`);
      }
      if (routedNoteId !== undefined && operation.targetNoteId !== routedNoteId) {
        errors.push(`targetNoteId ${operation.targetNoteId} must match routed noteId ${routedNoteId}`);
      }
      for (const [index, entryId] of operation.sourceCaptureEntryIds.entries()) {
        if (!hasId(snapshot.captureEntries, entryId)) {
          errors.push(`sourceCaptureEntryIds[${index}] ${entryId} does not exist`);
        }
      }
      for (const [blockIndex, draft] of operation.organizedBlocks.entries()) {
        for (const [entryIndex, entryId] of draft.sourceCaptureEntryIds.entries()) {
          if (!hasId(snapshot.captureEntries, entryId)) {
            errors.push(`organizedBlocks[${blockIndex}].sourceCaptureEntryIds[${entryIndex}] ${entryId} does not exist`);
          }
        }
      }
      break;
    case 'mark_stale':
      validateStaleTargetExists(operation.targetType, operation.targetId, snapshot, errors);
      break;
  }

  return errors;
}

function validateSourceSpansUseUserBlocks(
  sourceSpans: readonly SourceSpanContract[],
  snapshot: OperationRouterSnapshot,
  errors: string[],
): void {
  for (const [index, span] of sourceSpans.entries()) {
    const block = snapshot.blocks.find((candidate) => candidate.id === span.blockId);
    if (!block) {
      errors.push(`sourceSpans[${index}].blockId ${span.blockId} does not exist`);
    } else if (block.origin !== userAuthoredBlockOrigin) {
      errors.push(`sourceSpans[${index}].blockId ${span.blockId} must reference a user-authored block`);
    }
  }
}

function validateStaleTargetExists(
  targetType: 'semantic_unit' | 'memory_candidate' | 'assist_block',
  targetId: string,
  snapshot: OperationRouterSnapshot,
  errors: string[],
): void {
  if (targetType === 'semantic_unit' && !hasId(snapshot.semanticUnits, targetId)) {
    errors.push(`target semantic_unit ${targetId} does not exist`);
  }
  if (targetType === 'memory_candidate' && !hasId(snapshot.memoryCandidates, targetId)) {
    errors.push(`target memory_candidate ${targetId} does not exist`);
  }
  if (targetType === 'assist_block' && !hasId(snapshot.assistBlocks, targetId)) {
    errors.push(`target assist_block ${targetId} does not exist`);
  }
}
