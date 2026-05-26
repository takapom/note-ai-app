import {
  createNoteSurfaceApiRequest,
  type NoteSurfaceApiIntentInput,
  type ProvenanceLookupInput,
} from '../../noteSurfaceApiIntents.ts';
import {
  createNoteSurfaceApiTransport,
  type NoteSurfaceApiFetchLike,
  type NoteSurfaceApiTransport,
  type NoteSurfaceApiTransportResult,
} from '../../noteSurfaceApiTransport.ts';

export interface NoteSurfaceApiClientOptions {
  apiBaseUrl: string | URL;
  fetchLike: NoteSurfaceApiFetchLike;
  workspaceId: string;
  userId?: string;
}

export interface NoteSurfaceApiClient {
  getNote(input: NoteSurfaceGetNoteInput): Promise<NoteSurfaceApiTransportResult>;
  createBlock(input: NoteSurfaceCreateBlockInput): Promise<NoteSurfaceApiTransportResult>;
  patchBlock(input: NoteSurfacePatchBlockInput): Promise<NoteSurfaceApiTransportResult>;
  deleteBlock(input: NoteSurfaceDeleteBlockInput): Promise<NoteSurfaceApiTransportResult>;
  leaveNote(input: NoteSurfaceLeaveNoteInput): Promise<NoteSurfaceApiTransportResult>;
  manualStructure(input: NoteSurfaceManualStructureInput): Promise<NoteSurfaceApiTransportResult>;
  getDigest(input: NoteSurfaceGetDigestInput): Promise<NoteSurfaceApiTransportResult>;
  lookupProvenanceSource(input: NoteSurfaceLookupProvenanceInput): Promise<NoteSurfaceApiTransportResult>;
  acceptOperation(input: NoteSurfaceOperationReviewInput): Promise<NoteSurfaceApiTransportResult>;
  dismissOperation(input: NoteSurfaceOperationReviewInput): Promise<NoteSurfaceApiTransportResult>;
  acceptMemory(input: NoteSurfaceMemoryReviewInput): Promise<NoteSurfaceApiTransportResult>;
  rejectMemory(input: NoteSurfaceMemoryReviewInput): Promise<NoteSurfaceApiTransportResult>;
  editMemory(input: NoteSurfaceMemoryEditInput): Promise<NoteSurfaceApiTransportResult>;
  holdMemory(input: NoteSurfaceMemoryReviewInput): Promise<NoteSurfaceApiTransportResult>;
  deleteMemory(input: NoteSurfaceMemoryReviewInput): Promise<NoteSurfaceApiTransportResult>;
}

export interface NoteSurfaceGetNoteInput {
  noteId: string;
}

export interface NoteSurfaceCreateBlockInput {
  noteId: string;
  content: string;
  afterBlockId?: string;
}

export interface NoteSurfacePatchBlockInput {
  noteId: string;
  blockId: string;
  content: string;
}

export interface NoteSurfaceDeleteBlockInput {
  noteId: string;
  blockId: string;
}

export interface NoteSurfaceLeaveNoteInput {
  noteId: string;
  cause?: 'note_close' | 'tab_switch' | 'app_leave' | 'note_closed' | 'tab_switched' | 'app_left';
}

export interface NoteSurfaceManualStructureInput {
  noteId: string;
}

export interface NoteSurfaceGetDigestInput {
  noteId: string;
}

export interface NoteSurfaceLookupProvenanceInput {
  provenance: ProvenanceLookupInput;
}

export interface NoteSurfaceOperationReviewInput {
  operationId: string;
}

export interface NoteSurfaceMemoryReviewInput {
  memoryId: string;
}

export interface NoteSurfaceMemoryEditInput {
  memoryId: string;
  content: string;
}

type IntentInputWithoutMetadata = NoteSurfaceApiIntentInput extends infer Intent
  ? Intent extends NoteSurfaceApiIntentInput
    ? Omit<Intent, 'workspaceId' | 'userId'>
    : never
  : never;

export function createNoteSurfaceApiClient(options: NoteSurfaceApiClientOptions): NoteSurfaceApiClient {
  const transport = createNoteSurfaceApiTransport({
    baseUrl: options.apiBaseUrl,
    fetchLike: options.fetchLike,
  });

  return {
    getNote(input) {
      const errors = validatePathId('noteId', input.noteId);
      if (errors.length > 0) {
        return Promise.resolve({ ok: false, status: 0, errors });
      }

      return transport.send({
        method: 'GET',
        path: `/notes/${input.noteId}`,
        headers: createMetadataHeaders(options),
      });
    },
    createBlock(input) {
      return sendIntent(transport, options, {
        intent: 'block.create',
        noteId: input.noteId,
        content: input.content,
        ...(input.afterBlockId === undefined ? {} : { afterBlockId: input.afterBlockId }),
      });
    },
    patchBlock(input) {
      return sendIntent(transport, options, {
        intent: 'block.update',
        noteId: input.noteId,
        blockId: input.blockId,
        content: input.content,
      });
    },
    deleteBlock(input) {
      return sendIntent(transport, options, {
        intent: 'block.delete',
        noteId: input.noteId,
        blockId: input.blockId,
      });
    },
    leaveNote(input) {
      return sendIntent(transport, options, {
        intent: 'note.leave',
        noteId: input.noteId,
        ...(input.cause === undefined ? {} : { cause: input.cause }),
      });
    },
    manualStructure(input) {
      return sendIntent(transport, options, {
        intent: 'note.manual_structure',
        noteId: input.noteId,
      });
    },
    getDigest(input) {
      return sendIntent(transport, options, {
        intent: 'digest.read',
        noteId: input.noteId,
      });
    },
    lookupProvenanceSource(input) {
      return sendIntent(transport, options, {
        intent: 'provenance.lookup',
        provenance: input.provenance,
      });
    },
    acceptOperation(input) {
      return sendIntent(transport, options, {
        intent: 'ai_assist.accept',
        operationId: input.operationId,
      });
    },
    dismissOperation(input) {
      return sendIntent(transport, options, {
        intent: 'ai_assist.dismiss',
        operationId: input.operationId,
      });
    },
    acceptMemory(input) {
      return sendIntent(transport, options, {
        intent: 'memory.remember',
        memoryId: input.memoryId,
      });
    },
    rejectMemory(input) {
      return sendIntent(transport, options, {
        intent: 'memory.reject',
        memoryId: input.memoryId,
      });
    },
    editMemory(input) {
      return sendIntent(transport, options, {
        intent: 'memory.edit',
        memoryId: input.memoryId,
        content: input.content,
      });
    },
    holdMemory(input) {
      return sendIntent(transport, options, {
        intent: 'memory.snooze',
        memoryId: input.memoryId,
      });
    },
    deleteMemory(input) {
      return sendIntent(transport, options, {
        intent: 'memory.delete',
        memoryId: input.memoryId,
      });
    },
  };
}

async function sendIntent(
  transport: NoteSurfaceApiTransport,
  options: NoteSurfaceApiClientOptions,
  input: IntentInputWithoutMetadata,
): Promise<NoteSurfaceApiTransportResult> {
  const mapped = createNoteSurfaceApiRequest({
    ...input,
    workspaceId: options.workspaceId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
  });

  if (!mapped.ok || mapped.request === undefined) {
    return {
      ok: false,
      status: 0,
      errors: mapped.errors.length > 0
        ? mapped.errors
        : [mapped.unavailableReason ?? 'api intent is unavailable'],
    };
  }

  return transport.send(mapped.request);
}

function createMetadataHeaders(options: NoteSurfaceApiClientOptions): Record<string, string> {
  return {
    'X-Workspace-Id': options.workspaceId,
    ...(options.userId === undefined ? {} : { 'X-User-Id': options.userId }),
  };
}

function validatePathId(fieldName: string, value: unknown): readonly string[] {
  if (!isStableRuntimeId(value)) {
    return [`${fieldName} must be a stable non-sentinel runtime id`];
  }

  return [];
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
