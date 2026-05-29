import {
  createNoteSurfaceApiRequest,
  type NoteSurfaceApiIntentInput,
  type NoteSurfaceApiIntentKind,
  type NoteSurfaceWorkerRequestDescriptor,
} from '../../noteSurfaceApiIntents.ts';
import type {
  NoteSurfaceApiTransport,
  NoteSurfaceApiTransportResult,
} from '../../noteSurfaceApiTransport.ts';
import {
  normalizeNoteSurfaceRenderActionDescriptor,
  type NoteSurfaceRenderActionDescriptor,
} from './renderActionDescriptor.ts';
import { resolveRenderApiIntentKind } from './renderActionIntents.ts';
import type { NoteSurfaceHtmlRenderEventDescriptor } from '../../noteSurfaceHtmlRenderer.ts';

export type NoteSurfaceEventControllerApiIntent =
  | NoteSurfaceHtmlRenderEventDescriptor['apiIntent']
  | 'POST /notes/:noteId/blocks'
  | 'PATCH /blocks/:blockId'
  | 'DELETE /blocks/:blockId'
  | 'POST /notes/:noteId/structure/manual'
  | 'GET /notes/:noteId/digest'
  | 'POST /provenance/source';

export interface NoteSurfaceEventControllerDescriptor extends Omit<NoteSurfaceRenderActionDescriptor, 'apiIntent'> {
  apiIntent: NoteSurfaceEventControllerApiIntent;
}

export interface NoteSurfaceProvenanceActionInput {
  sourceSpanId: string;
  sourceBlockId: string;
  startOffset: number;
  endOffset: number;
}

export interface NoteSurfaceResolvedActionInput {
  operationId?: string;
  memoryId?: string;
  blockId?: string;
  content?: string;
  noteId?: string;
  provenance?: NoteSurfaceProvenanceActionInput;
}

export type NoteSurfaceResolveActionInput = (
  event: NoteSurfaceEventControllerDescriptor,
) => NoteSurfaceResolvedActionInput | undefined | Promise<NoteSurfaceResolvedActionInput | undefined>;

export interface NoteSurfaceEventControllerOptions {
  workspaceId: string;
  userId?: string;
  transport: NoteSurfaceApiTransport;
  resolveActionInput: NoteSurfaceResolveActionInput;
}

export type NoteSurfaceEventControllerStatus =
  | 'noop'
  | 'sent'
  | 'transport_error'
  | 'invalid_event'
  | 'invalid_mapping'
  | 'unsupported_intent'
  | 'request_rejected';

export interface NoteSurfaceEventControllerResult {
  ok: boolean;
  status: NoteSurfaceEventControllerStatus;
  request?: NoteSurfaceWorkerRequestDescriptor;
  transportResult?: NoteSurfaceApiTransportResult;
  errors: readonly string[];
}

export interface NoteSurfaceEventController {
  handleRenderEvent(eventDescriptor: unknown): Promise<NoteSurfaceEventControllerResult>;
}

export function createNoteSurfaceEventController(
  options: NoteSurfaceEventControllerOptions,
): NoteSurfaceEventController {
  return {
    async handleRenderEvent(eventDescriptor: unknown): Promise<NoteSurfaceEventControllerResult> {
      return handleNoteSurfaceRenderEvent(eventDescriptor, options);
    },
  };
}

export async function handleNoteSurfaceRenderEvent(
  eventDescriptor: unknown,
  options: NoteSurfaceEventControllerOptions,
): Promise<NoteSurfaceEventControllerResult> {
  const normalized = normalizeEventDescriptor(eventDescriptor);
  if (!normalized.ok) {
    return {
      ok: false,
      status: 'invalid_event',
      errors: normalized.errors,
    };
  }

  if (normalized.event.apiIntent === 'none') {
    return {
      ok: true,
      status: 'noop',
      errors: [],
    };
  }

  const optionErrors = validateControllerOptions(options);
  if (optionErrors.length > 0) {
    return {
      ok: false,
      status: 'invalid_mapping',
      errors: optionErrors,
    };
  }

  const intent = resolveRenderApiIntentKind(normalized.event.apiIntent);
  if (intent === undefined) {
    return {
      ok: false,
      status: 'unsupported_intent',
      errors: [`unsupported apiIntent: ${normalized.event.apiIntent}`],
    };
  }

  let resolved: NoteSurfaceResolvedActionInput | undefined;
  try {
    resolved = await options.resolveActionInput(normalized.event);
  } catch (error) {
    return {
      ok: false,
      status: 'invalid_mapping',
      errors: [`resolveActionInput failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const input = createApiIntentInput(intent, normalized.event.apiIntent, resolved, options);
  if (!input.ok) {
    return {
      ok: false,
      status: 'invalid_mapping',
      errors: input.errors,
    };
  }

  const mapped = createNoteSurfaceApiRequest(input.value);
  if (!mapped.ok || mapped.request === undefined) {
    return {
      ok: false,
      status: mapped.errors.length > 0 ? 'invalid_mapping' : 'request_rejected',
      errors: mapped.errors.length > 0
        ? mapped.errors
        : [mapped.unavailableReason ?? `request rejected for apiIntent: ${normalized.event.apiIntent}`],
    };
  }

  let transportResult: NoteSurfaceApiTransportResult;
  try {
    transportResult = await options.transport.send(mapped.request);
  } catch (error) {
    return {
      ok: false,
      status: 'transport_error',
      request: mapped.request,
      errors: [`transport failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  return {
    ok: transportResult.ok,
    status: transportResult.ok ? 'sent' : 'transport_error',
    request: mapped.request,
    transportResult,
    errors: transportResult.errors,
  };
}

function normalizeEventDescriptor(
  eventDescriptor: unknown,
): { ok: true; event: NoteSurfaceEventControllerDescriptor } | { ok: false; errors: readonly string[] } {
  const normalized = normalizeNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (!normalized.ok) {
    return normalized;
  }
  return {
    ok: true,
    event: {
      ...normalized.descriptor,
      apiIntent: normalized.descriptor.apiIntent as NoteSurfaceEventControllerApiIntent,
    },
  };
}

function createApiIntentInput(
  intent: NoteSurfaceApiIntentKind,
  apiIntent: string,
  resolved: NoteSurfaceResolvedActionInput | undefined,
  options: NoteSurfaceEventControllerOptions,
): { ok: true; value: NoteSurfaceApiIntentInput } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const base = {
    intent,
    workspaceId: options.workspaceId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
  };

  switch (intent) {
    case 'ai_assist.accept':
    case 'ai_assist.dismiss': {
      const operationId = requireResolvedString(resolved, 'operationId', apiIntent, errors);
      if (operationId === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          operationId,
        },
      };
    }
    case 'memory.remember':
    case 'memory.reject':
    case 'memory.delete':
    case 'memory.snooze': {
      const memoryId = requireResolvedString(resolved, 'memoryId', apiIntent, errors);
      if (memoryId === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          memoryId,
        },
      };
    }
    case 'memory.edit': {
      const memoryId = requireResolvedString(resolved, 'memoryId', apiIntent, errors);
      const content = requireResolvedString(resolved, 'content', apiIntent, errors);
      if (memoryId === undefined || content === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          memoryId,
          content,
        },
      };
    }
    case 'block.update': {
      const noteId = requireResolvedString(resolved, 'noteId', apiIntent, errors);
      const blockId = requireResolvedString(resolved, 'blockId', apiIntent, errors);
      const content = requireResolvedString(resolved, 'content', apiIntent, errors);
      if (noteId === undefined || blockId === undefined || content === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          noteId,
          blockId,
          content,
        },
      };
    }
    case 'block.create': {
      const noteId = requireResolvedString(resolved, 'noteId', apiIntent, errors);
      const content = requireResolvedString(resolved, 'content', apiIntent, errors);
      if (noteId === undefined || content === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          noteId,
          content,
        },
      };
    }
    case 'block.delete': {
      const noteId = requireResolvedString(resolved, 'noteId', apiIntent, errors);
      const blockId = requireResolvedString(resolved, 'blockId', apiIntent, errors);
      if (noteId === undefined || blockId === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          noteId,
          blockId,
        },
      };
    }
    case 'digest.read': {
      const noteId = requireResolvedString(resolved, 'noteId', apiIntent, errors);
      if (noteId === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          noteId,
        },
      };
    }
    case 'provenance.lookup': {
      if (resolved?.provenance === undefined) {
        return { ok: false, errors: [`provenance is required for apiIntent ${apiIntent}`] };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          provenance: resolved.provenance,
        },
      };
    }
    case 'note.leave': {
      const noteId = requireResolvedString(resolved, 'noteId', apiIntent, errors);
      if (noteId === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          noteId,
        },
      };
    }
    case 'note.manual_structure': {
      const noteId = requireResolvedString(resolved, 'noteId', apiIntent, errors);
      if (noteId === undefined) {
        return { ok: false, errors };
      }
      return {
        ok: true,
        value: {
          ...base,
          intent,
          noteId,
        },
      };
    }
  }
}

function validateControllerOptions(options: NoteSurfaceEventControllerOptions): string[] {
  const errors: string[] = [];
  if (!isStableRuntimeId(options.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (options.userId !== undefined && !isStableRuntimeId(options.userId)) {
    errors.push('userId must be a stable non-sentinel runtime id');
  }
  if (typeof options.resolveActionInput !== 'function') {
    errors.push('resolveActionInput must be a function');
  }
  if (asRecord(options.transport) === undefined || typeof options.transport.send !== 'function') {
    errors.push('transport must implement send');
  }
  return errors;
}

function requireResolvedString(
  resolved: NoteSurfaceResolvedActionInput | undefined,
  field: keyof Pick<NoteSurfaceResolvedActionInput, 'operationId' | 'memoryId' | 'blockId' | 'content' | 'noteId'>,
  apiIntent: string,
  errors: string[],
): string | undefined {
  const value = resolved?.[field];
  if (typeof value !== 'string' || value === '') {
    errors.push(`${field} is required for apiIntent ${apiIntent}`);
    return undefined;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
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
