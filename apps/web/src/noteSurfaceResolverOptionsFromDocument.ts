import type {
  BlockContract,
  NoteDocumentContract,
} from '../../../contexts/note-model/src/contract/noteContract.ts';
import { aiBlockTypes } from '../../../contexts/note-model/src/contract/noteContract.ts';
import type { NoteSurfaceActionInputResolverOptions } from './noteSurfaceActionInputResolver.ts';
import type { NoteSurfaceProvenanceActionInput } from './noteSurfaceEventController.ts';

export interface CreateNoteSurfaceResolverOptionsFromDocumentInput {
  document: unknown;
  activeNoteId?: string;
  operationIdByBlockId?: Readonly<Record<string, string>>;
  memoryIdByBlockId?: Readonly<Record<string, string>>;
  sourceSpanIdByBlockId?: Readonly<Record<string, string>>;
  memoryEditContentByBlockId?: Readonly<Record<string, unknown>>;
}

export type NoteSurfaceResolverOptionsFromDocumentResult =
  | {
      ok: true;
      options: NoteSurfaceActionInputResolverOptions;
    }
  | {
      ok: false;
      errors: readonly string[];
    };

export function createNoteSurfaceResolverOptionsFromDocument(
  input: CreateNoteSurfaceResolverOptionsFromDocumentInput,
): NoteSurfaceResolverOptionsFromDocumentResult {
  const validation = validateResolverDocument(input.document);
  if (!validation.ok) {
    return validation;
  }

  const document = validation.document;
  const operationIdByBlockId: Record<string, string> = {};
  const memoryIdByBlockId: Record<string, string> = {};
  const provenanceByBlockId: Record<string, NoteSurfaceProvenanceActionInput> = {};
  const memoryEditContentByBlockId: Record<string, unknown> = {};

  for (const block of document.blocks) {
    if (isMemoryCandidateBlock(block)) {
      assignCallerString(memoryIdByBlockId, block.id, input.memoryIdByBlockId?.[block.id]);
      assignCallerUnknown(memoryEditContentByBlockId, block.id, input.memoryEditContentByBlockId?.[block.id]);
    } else if (isAiAssistBlock(block)) {
      assignCallerString(operationIdByBlockId, block.id, input.operationIdByBlockId?.[block.id]);
    }

    const provenance = createProvenanceInput(block, input.sourceSpanIdByBlockId?.[block.id]);
    if (provenance !== undefined) {
      provenanceByBlockId[block.id] = provenance;
    }
  }

  return {
    ok: true,
    options: {
      activeNoteId: input.activeNoteId ?? document.note.id,
      ...(hasEntries(operationIdByBlockId) ? { operationIdByBlockId } : {}),
      ...(hasEntries(memoryIdByBlockId) ? { memoryIdByBlockId } : {}),
      ...(hasEntries(provenanceByBlockId) ? { provenanceByBlockId } : {}),
      ...(hasEntries(memoryEditContentByBlockId) ? { memoryEditContentByBlockId } : {}),
    },
  };
}

function assignCallerString(target: Record<string, string>, blockId: string, value: unknown): void {
  if (typeof value === 'string') {
    target[blockId] = value;
  }
}

function assignCallerUnknown(target: Record<string, unknown>, blockId: string, value: unknown): void {
  if (value !== undefined) {
    target[blockId] = value;
  }
}

function createProvenanceInput(
  block: BlockContract,
  sourceSpanId: string | undefined,
): NoteSurfaceProvenanceActionInput | undefined {
  if (sourceSpanId === undefined) {
    return undefined;
  }

  const sourceSpan = findFirstCompleteSourceSpan(block);
  if (sourceSpan === undefined) {
    return undefined;
  }

  return {
    sourceSpanId,
    sourceBlockId: sourceSpan.sourceBlockId,
    startOffset: sourceSpan.startOffset,
    endOffset: sourceSpan.endOffset,
  };
}

function findFirstCompleteSourceSpan(
  block: BlockContract,
): Pick<NoteSurfaceProvenanceActionInput, 'sourceBlockId' | 'startOffset' | 'endOffset'> | undefined {
  const annotations = asRecord(block.contentJson)?.annotations;
  if (!Array.isArray(annotations)) {
    return undefined;
  }

  for (const annotation of annotations) {
    const record = asRecord(annotation);
    if (
      record?.kind === 'source_span'
      && isNonEmptyString(record.sourceBlockId)
      && isNonNegativeInteger(record.startOffset)
      && isNonNegativeInteger(record.endOffset)
      && record.endOffset >= record.startOffset
    ) {
      return {
        sourceBlockId: record.sourceBlockId,
        startOffset: record.startOffset,
        endOffset: record.endOffset,
      };
    }
  }

  return undefined;
}

function isAiAssistBlock(block: BlockContract): boolean {
  return (aiBlockTypes as readonly string[]).includes(block.type);
}

function isMemoryCandidateBlock(block: BlockContract): boolean {
  return block.type === 'ai_memory_candidate';
}

function validateResolverDocument(
  document: unknown,
): { ok: true; document: NoteDocumentContract } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const record = asRecord(document);
  if (record === undefined) {
    return { ok: false, errors: ['document must be an object'] };
  }

  const note = asRecord(record.note);
  if (note === undefined) {
    errors.push('document.note must be an object');
  } else if (!isNonEmptyString(note.id)) {
    errors.push('document.note.id must be a non-empty string');
  }

  if (!Array.isArray(record.sections)) {
    errors.push('document.sections must be an array');
  }

  if (!Array.isArray(record.blocks)) {
    errors.push('document.blocks must be an array');
  } else {
    for (const [index, block] of record.blocks.entries()) {
      const blockRecord = asRecord(block);
      if (blockRecord === undefined) {
        errors.push(`document.blocks[${index}] must be an object`);
        continue;
      }
      if (!isNonEmptyString(blockRecord.id)) {
        errors.push(`document.blocks[${index}].id must be a non-empty string`);
      }
      if (typeof blockRecord.type !== 'string') {
        errors.push(`document.blocks[${index}].type must be a string`);
      }
      if (asRecord(blockRecord.contentJson) === undefined) {
        errors.push(`document.blocks[${index}].contentJson must be an object`);
      }
    }
  }

  return errors.length === 0
    ? { ok: true, document: record as unknown as NoteDocumentContract }
    : { ok: false, errors };
}

function hasEntries(record: object): boolean {
  return Object.keys(record).length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
