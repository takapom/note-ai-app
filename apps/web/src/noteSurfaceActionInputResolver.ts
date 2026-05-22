import type {
  NoteSurfaceEventControllerDescriptor,
  NoteSurfaceProvenanceActionInput,
  NoteSurfaceResolvedActionInput,
  NoteSurfaceResolveActionInput,
} from './noteSurfaceEventController.ts';

export type NoteSurfaceBlockActionInputLookup<T> =
  | Readonly<Record<string, T>>
  | ((blockId: string, event: NoteSurfaceEventControllerDescriptor) => T | undefined);

export type NoteSurfaceTargetActionInputLookup<T> =
  | Readonly<Record<string, T>>
  | ((target: string, event: NoteSurfaceEventControllerDescriptor) => T | undefined);

export type NoteSurfaceActiveNoteIdLookup =
  | string
  | ((event: NoteSurfaceEventControllerDescriptor) => string | undefined);

export interface NoteSurfaceActionInputResolverOptions {
  activeNoteId?: NoteSurfaceActiveNoteIdLookup;
  noteIdByTarget?: NoteSurfaceTargetActionInputLookup<string>;
  operationIdByBlockId?: NoteSurfaceBlockActionInputLookup<string>;
  memoryIdByBlockId?: NoteSurfaceBlockActionInputLookup<string>;
  provenanceByBlockId?: NoteSurfaceBlockActionInputLookup<NoteSurfaceProvenanceActionInput>;
  memoryEditContentByBlockId?: NoteSurfaceBlockActionInputLookup<unknown>;
}

export function createNoteSurfaceActionInputResolver(
  options: NoteSurfaceActionInputResolverOptions,
): NoteSurfaceResolveActionInput {
  return (event: NoteSurfaceEventControllerDescriptor): NoteSurfaceResolvedActionInput | undefined => {
    if (event.apiIntent === 'none' || isEditorNoopAction(event)) {
      return undefined;
    }

    if (isAiAssistOperationIntent(event.apiIntent)) {
      return readBlockString(options.operationIdByBlockId, event, 'operationId');
    }

    if (isBlockUpdateIntent(event.apiIntent)) {
      return readBlockUpdateInput(event);
    }

    if (isMemoryEditIntent(event.apiIntent)) {
      const resolved = readBlockString(options.memoryIdByBlockId, event, 'memoryId');
      const content = readMemoryEditContent(options.memoryEditContentByBlockId, event);
      return resolved === undefined && content === undefined
        ? undefined
        : {
            ...(resolved === undefined ? {} : resolved),
            ...(content === undefined ? {} : { content }),
          };
    }

    if (isMemoryReviewIntent(event.apiIntent)) {
      return readBlockString(options.memoryIdByBlockId, event, 'memoryId');
    }

    if (isDigestReadIntent(event.apiIntent)) {
      return readDigestNoteInput(options, event);
    }

    if (isProvenanceLookupIntent(event.apiIntent)) {
      return readProvenanceInput(options, event);
    }

    return undefined;
  };
}

function isEditorNoopAction(event: NoteSurfaceEventControllerDescriptor): boolean {
  return (
    event.target === 'block_editor'
    && (event.action === 'edit_block' || event.action === 'cancel_edit')
  );
}

function isAiAssistOperationIntent(apiIntent: string): boolean {
  return (
    apiIntent === 'POST /ai-operations/:operationId/accept'
    || apiIntent === 'POST /ai-operations/:operationId/dismiss'
    || apiIntent === 'ai_assist.accept'
    || apiIntent === 'ai_assist.dismiss'
  );
}

function isMemoryEditIntent(apiIntent: string): boolean {
  return apiIntent === 'POST /memory/:memoryId/edit' || apiIntent === 'memory.edit';
}

function isBlockUpdateIntent(apiIntent: string): boolean {
  return apiIntent === 'PATCH /blocks/:blockId' || apiIntent === 'block.update';
}

function isMemoryReviewIntent(apiIntent: string): boolean {
  return (
    apiIntent === 'POST /memory/:memoryId/accept'
    || apiIntent === 'POST /memory/:memoryId/reject'
    || apiIntent === 'POST /memory/:memoryId/delete'
    || apiIntent === 'POST /memory/:memoryId/hold'
    || apiIntent === 'memory.remember'
    || apiIntent === 'memory.reject'
    || apiIntent === 'memory.delete'
    || apiIntent === 'memory.snooze'
  );
}

function isDigestReadIntent(apiIntent: string): boolean {
  return apiIntent === 'GET /notes/:noteId/digest' || apiIntent === 'digest.read';
}

function isProvenanceLookupIntent(apiIntent: string): boolean {
  return apiIntent === 'POST /provenance/source' || apiIntent === 'provenance.lookup';
}

function readBlockString(
  lookup: NoteSurfaceBlockActionInputLookup<string> | undefined,
  event: NoteSurfaceEventControllerDescriptor,
  field: 'operationId' | 'memoryId',
): NoteSurfaceResolvedActionInput | undefined {
  const value = readBlockLookup(lookup, event);
  return typeof value === 'string' ? { [field]: value } : undefined;
}

function readMemoryEditContent(
  lookup: NoteSurfaceBlockActionInputLookup<unknown> | undefined,
  event: NoteSurfaceEventControllerDescriptor,
): string | undefined {
  const content = readBlockLookup(lookup, event);
  return typeof content === 'string' && content !== '' ? content : undefined;
}

function readBlockUpdateInput(
  event: NoteSurfaceEventControllerDescriptor,
): NoteSurfaceResolvedActionInput | undefined {
  if (event.blockId === undefined) {
    return undefined;
  }

  return {
    blockId: event.blockId,
    ...(event.noteId === undefined ? {} : { noteId: event.noteId }),
    ...(typeof event.content === 'string' ? { content: event.content } : {}),
  };
}

function readDigestNoteInput(
  options: NoteSurfaceActionInputResolverOptions,
  event: NoteSurfaceEventControllerDescriptor,
): NoteSurfaceResolvedActionInput | undefined {
  const noteId = event.noteId
    ?? readActiveNoteId(options.activeNoteId, event)
    ?? readTargetLookup(options.noteIdByTarget, event);

  return typeof noteId === 'string' ? { noteId } : undefined;
}

function readActiveNoteId(
  lookup: NoteSurfaceActiveNoteIdLookup | undefined,
  event: NoteSurfaceEventControllerDescriptor,
): string | undefined {
  return typeof lookup === 'function' ? lookup(event) : lookup;
}

function readProvenanceInput(
  options: NoteSurfaceActionInputResolverOptions,
  event: NoteSurfaceEventControllerDescriptor,
): NoteSurfaceResolvedActionInput | undefined {
  const provenance = readBlockLookup(options.provenanceByBlockId, event);
  return provenance === undefined ? undefined : { provenance };
}

function readBlockLookup<T>(
  lookup: NoteSurfaceBlockActionInputLookup<T> | undefined,
  event: NoteSurfaceEventControllerDescriptor,
): T | undefined {
  if (lookup === undefined || event.blockId === undefined) {
    return undefined;
  }

  return typeof lookup === 'function' ? lookup(event.blockId, event) : lookup[event.blockId];
}

function readTargetLookup<T>(
  lookup: NoteSurfaceTargetActionInputLookup<T> | undefined,
  event: NoteSurfaceEventControllerDescriptor,
): T | undefined {
  if (lookup === undefined) {
    return undefined;
  }

  return typeof lookup === 'function' ? lookup(event.target, event) : lookup[event.target];
}
