// Request parsing for the framework-neutral Worker HTTP boundary.
// Authority: docs/contracts/api-events.md

import type { NoteLeaveCause } from '../../scheduler/noteStructureRouteHandler.ts';
import type { ProvenanceLookupInput } from '../../note-model/provenanceLookupPort.ts';
import type { WorkerHttpRequest } from './workerHttpRouterTypes.ts';

export interface LatestBlockUpdateRouteInput {
  blockId: string;
  content: string;
}

export function validateBaseRequest(request: WorkerHttpRequest): string[] {
  const errors: string[] = [];
  if (!isStableRuntimeId(request.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(request.now)) {
    errors.push('now must be a finite number');
  }
  return errors;
}

export function parseProvenanceLookupRouteInput(
  request: WorkerHttpRequest,
): { ok: true; input: ProvenanceLookupInput } | { ok: false; errors: string[] } {
  if (!isRecord(request.body)) {
    return { ok: false, errors: ['body must be an object'] };
  }

  const sourceSpanId = request.body.sourceSpanId;
  const sourceBlockId = request.body.sourceBlockId;
  const startOffset = request.body.startOffset;
  const endOffset = request.body.endOffset;
  const errors: string[] = [];
  const sourceSpanIdIsValid = isStableRuntimeId(sourceSpanId);
  const sourceBlockIdIsValid = isStableRuntimeId(sourceBlockId);
  const startOffsetIsValid = isNonNegativeInteger(startOffset);
  const endOffsetIsValid = isNonNegativeInteger(endOffset);

  if (!sourceSpanIdIsValid) {
    errors.push('sourceSpanId must be a stable non-sentinel runtime id');
  }
  if (!sourceBlockIdIsValid) {
    errors.push('sourceBlockId must be a stable non-sentinel runtime id');
  }
  if (!startOffsetIsValid) {
    errors.push('startOffset must be a non-negative finite integer');
  }
  if (!endOffsetIsValid) {
    errors.push('endOffset must be a non-negative finite integer');
  }
  if (
    typeof startOffset === 'number' &&
    Number.isFinite(startOffset) &&
    typeof endOffset === 'number' &&
    Number.isFinite(endOffset) &&
    endOffset < startOffset
  ) {
    errors.push('endOffset must be greater than or equal to startOffset');
  }

  if (
    errors.length > 0 ||
    !sourceSpanIdIsValid ||
    !sourceBlockIdIsValid ||
    !startOffsetIsValid ||
    !endOffsetIsValid
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      workspaceId: request.workspaceId,
      sourceSpanId,
      sourceBlockId,
      startOffset,
      endOffset,
    },
  };
}

export function readNoteLeaveCause(body: unknown): { cause?: NoteLeaveCause } {
  if (!isRecord(body) || body.cause === undefined) {
    return {};
  }

  return { cause: body.cause as NoteLeaveCause };
}

export function parseLatestBlockUpdates(
  body: unknown,
): { ok: true; updates: LatestBlockUpdateRouteInput[] } | { ok: false; errors: string[] } {
  if (!isRecord(body) || body.latestBlockUpdates === undefined) {
    return { ok: true, updates: [] };
  }
  if (!Array.isArray(body.latestBlockUpdates)) {
    return { ok: false, errors: ['latestBlockUpdates must be an array'] };
  }

  const errors: string[] = [];
  const updates: LatestBlockUpdateRouteInput[] = [];
  const seenBlockIds = new Set<string>();

  body.latestBlockUpdates.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`latestBlockUpdates[${index}] must be an object`);
      return;
    }

    const blockId = entry.blockId;
    const content = entry.content;
    if (!isStableRuntimeId(blockId)) {
      errors.push(`latestBlockUpdates[${index}].blockId must be a stable non-sentinel runtime id`);
    }
    if (typeof content !== 'string' || content.trim() === '') {
      errors.push(`latestBlockUpdates[${index}].content must be a non-empty string`);
    }
    if (typeof blockId === 'string' && seenBlockIds.has(blockId)) {
      errors.push(`latestBlockUpdates[${index}].blockId must be unique`);
    }
    if (typeof blockId === 'string') {
      seenBlockIds.add(blockId);
    }
    if (isStableRuntimeId(blockId) && typeof content === 'string') {
      updates.push({ blockId, content });
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, updates };
}

export function isStableRuntimeId(value: unknown): value is string {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
