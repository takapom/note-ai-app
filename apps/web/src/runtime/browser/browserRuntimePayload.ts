import type { ProvenancePopoverInput } from '../../noteSurface.ts';
import { readNumber, readString, isPlainObject } from './browserRuntimeDescriptor.ts';

export function readProvenanceProjection(body: unknown): ProvenancePopoverInput | undefined {
  const candidate = unwrapResultBody(body);
  if (!isPlainObject(candidate)) {
    return undefined;
  }

  const source = isPlainObject(candidate.source) ? candidate.source : undefined;
  const excerpt = readString(candidate.excerpt);
  const sourceBlockId = readString(candidate.sourceBlockId) ?? readString(source?.sourceBlockId);
  const sourceNoteId = readString(candidate.sourceNoteId) ?? readString(source?.noteId);
  const sourceUnitId = readString(candidate.sourceUnitId) ?? readString(source?.sourceUnitId);
  const sourceTitle = readString(candidate.sourceTitle) ?? readString(source?.sourceTitle);
  const startOffset = readNumber(candidate.startOffset) ?? readNumber(source?.startOffset);
  const endOffset = readNumber(candidate.endOffset) ?? readNumber(source?.endOffset);
  const reason = readString(candidate.reason) ?? readString(source?.reason);

  if (excerpt === undefined && sourceBlockId === undefined && sourceNoteId === undefined) {
    return undefined;
  }

  return {
    open: true,
    ...(sourceBlockId === undefined ? {} : { sourceBlockId }),
    ...(sourceNoteId === undefined ? {} : { sourceNoteId }),
    ...(sourceUnitId === undefined ? {} : { sourceUnitId }),
    ...(sourceTitle === undefined ? {} : { sourceTitle }),
    ...(startOffset === undefined ? {} : { startOffset }),
    ...(endOffset === undefined ? {} : { endOffset }),
    ...(excerpt === undefined ? {} : { excerpt }),
    ...(reason === undefined ? {} : { reason }),
  };
}

export function readMemoryProjection(body: unknown): Record<string, unknown> | undefined {
  const candidate = unwrapResultBody(body);
  if (!isPlainObject(candidate)) {
    return undefined;
  }

  const memory = isPlainObject(candidate.memory) ? candidate.memory : candidate;
  if (!isPlainObject(memory)) {
    return undefined;
  }

  return readString(memory.id) !== undefined
    || readString(memory.status) !== undefined
    || readString(memory.content) !== undefined
    || readString(memory.reviewDecision) !== undefined
    ? memory
    : undefined;
}

export function unwrapResultBody(body: unknown): unknown {
  if (!isPlainObject(body)) {
    return undefined;
  }

  return isPlainObject(body.result) ? body.result : body;
}
