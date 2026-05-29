import {
  parseNextOpenDigestInput,
  validateNoteSurfaceDocument,
} from '../../../noteSurface.ts';
import type { NoteSurfaceEventControllerResult } from '../../../noteSurfaceEventController.ts';
import {
  readNoteSurfaceRenderActionDescriptor,
  readNoteSurfaceRenderActionDescriptorRawString,
} from '../../actions/renderActionDescriptor.ts';
import {
  isAiAssistProjectionResultApiIntent,
  isCanonicalRenderApiIntent,
  isDigestReadApiIntent,
  isMemoryEditApiIntent,
  isMemoryReviewApiIntent,
  isNoteReadApiIntent,
  isProvenanceLookupApiIntent,
} from '../../actions/renderActionIntents.ts';
import { readString } from '../browserRuntimeDescriptor.ts';
import {
  readMemoryProjection,
  readProvenanceProjection,
} from '../browserRuntimePayload.ts';
import type {
  BrowserRuntimeOpenNoteViewOptions,
  BrowserRuntimeProjectionMaps,
  NoteSurfaceDocumentInput,
  SuccessfulApiProjectionAction,
} from './browserRuntimeActionTypes.ts';

export function resolveSuccessfulApiProjectionAction(
  eventDescriptor: unknown,
  controllerResult: NoteSurfaceEventControllerResult,
): SuccessfulApiProjectionAction | undefined {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return undefined;
  }
  const { action, target, apiIntent } = descriptor;

  if (action === 'save_block' && target === 'block_editor' && isCanonicalRenderApiIntent(apiIntent, 'block.update')) {
    const blockId = descriptor.blockId;
    const content = readNoteSurfaceRenderActionDescriptorRawString(eventDescriptor, 'content');
    if (blockId === undefined || content === undefined) {
      return undefined;
    }

    return { action, target, blockId, content };
  }

  const body = controllerResult.transportResult?.body;

  if (
    action === 'open_recent_thought'
    && target === 'thin_rail'
    && isNoteReadApiIntent(apiIntent)
  ) {
    const noteId = descriptor.noteId;
    const projection = readOpenNoteProjection(body);
    if (noteId === undefined || projection === undefined) {
      return undefined;
    }

    return {
      action,
      target,
      noteId,
      document: projection.document,
      ...(projection.viewOptions === undefined ? {} : { viewOptions: projection.viewOptions }),
      ...(projection.projectionMaps === undefined ? {} : { projectionMaps: projection.projectionMaps }),
    };
  }

  if (
    action === 'read_digest'
    && target === 'next_open_digest'
    && isDigestReadApiIntent(apiIntent)
  ) {
    const digest = parseNextOpenDigestInput(body);
    return { action, target, digest: digest ?? { available: false, loadState: 'invalid_body' } };
  }

  if (
    action === 'inspect_source'
    && (target === 'ai_assist_block' || target === 'return_layer' || target === 'provenance_popover')
    && isProvenanceLookupApiIntent(apiIntent)
  ) {
    const provenance = readProvenanceProjection(body);
    return provenance === undefined
      ? undefined
      : { action: 'lookup_provenance', target: 'provenance_popover', provenance };
  }

  if (
    target === 'memory_candidate_block'
    && (isMemoryEditApiIntent(apiIntent) || isMemoryReviewApiIntent(apiIntent))
  ) {
    const blockId = descriptor.blockId;
    if (blockId === undefined) {
      return undefined;
    }

    const memory = readMemoryProjection(body);
    if (memory === undefined) {
      return undefined;
    }

    if (action === 'edit') {
      const content = readString(memory.content)
        ?? readNoteSurfaceRenderActionDescriptorRawString(eventDescriptor, 'content');
      return content === undefined ? undefined : { action, target, blockId, content };
    }

    if (
      action === 'remember'
      || action === 'reject'
      || action === 'delete'
      || action === 'snooze'
    ) {
      return { action, target, blockId };
    }
  }

  if (
    target === 'ai_assist_block'
    && (action === 'adopt' || action === 'delete')
    && isAiAssistProjectionResultApiIntent(apiIntent)
  ) {
    const aiBlockId = descriptor.blockId;
    return aiBlockId === undefined ? undefined : { action, target: 'ai_assist_block', blockId: aiBlockId };
  }

  return undefined;
}

function readOpenNoteProjection(body: unknown): {
  document: NoteSurfaceDocumentInput;
  viewOptions?: BrowserRuntimeOpenNoteViewOptions;
  projectionMaps?: BrowserRuntimeProjectionMaps;
} | undefined {
  const bodyRecord = readPlainRecord(body);
  const document = readNoteDocumentProjection(bodyRecord);
  if (bodyRecord === undefined || document === undefined) {
    return undefined;
  }

  const viewOptions = readOpenNoteViewOptions(readPlainRecord(bodyRecord.viewState));
  const projectionMaps = readProjectionMaps(readPlainRecord(bodyRecord.projectionMaps));

  return {
    document,
    ...(viewOptions === undefined ? {} : { viewOptions }),
    ...(projectionMaps === undefined ? {} : { projectionMaps }),
  };
}

function readNoteDocumentProjection(body: Record<string, unknown> | undefined): NoteSurfaceDocumentInput | undefined {
  if (body === undefined) {
    return undefined;
  }

  const document = body.document;
  if (validateNoteSurfaceDocument(document).length > 0) {
    return undefined;
  }

  return document as NoteSurfaceDocumentInput;
}

function readOpenNoteViewOptions(
  viewState: Record<string, unknown> | undefined,
): BrowserRuntimeOpenNoteViewOptions | undefined {
  if (viewState === undefined) {
    return undefined;
  }

  const nextOpenDigest = parseNextOpenDigestInput(viewState.nextOpenDigest);
  const sourceSpanIdByBlockId = readStringRecord(viewState.sourceSpanIdByBlockId);
  const viewOptions: BrowserRuntimeOpenNoteViewOptions = {
    ...readOptionalStringField(viewState, 'workspaceName'),
    ...readAiStatusField(viewState.aiStatus),
    ...(sourceSpanIdByBlockId === undefined ? {} : { sourceSpanIdByBlockId }),
    ...readOptionalBooleanField(viewState, 'inlineAiProjectionsVisible'),
    ...readOptionalBooleanField(viewState, 'memoryCandidatesVisible'),
    ...readOptionalBooleanField(viewState, 'returnLayerVisible'),
    ...(nextOpenDigest === undefined ? {} : { nextOpenDigest }),
    ...readOptionalBooleanField(viewState, 'expandedDigest'),
  };

  return Object.keys(viewOptions).length === 0 ? undefined : viewOptions;
}

function readProjectionMaps(
  projectionMaps: Record<string, unknown> | undefined,
): BrowserRuntimeProjectionMaps | undefined {
  if (projectionMaps === undefined) {
    return undefined;
  }

  const memoryEditContentByBlockId = readPlainRecord(projectionMaps.memoryEditContentByBlockId);
  const maps: BrowserRuntimeProjectionMaps = {
    ...readOptionalStringField(projectionMaps, 'activeNoteId'),
    ...readOptionalStringRecordField(projectionMaps, 'operationIdByBlockId'),
    ...readOptionalStringRecordField(projectionMaps, 'memoryIdByBlockId'),
    ...readOptionalStringRecordField(projectionMaps, 'sourceSpanIdByBlockId'),
    ...(memoryEditContentByBlockId === undefined ? {} : { memoryEditContentByBlockId }),
  };

  return Object.keys(maps).length === 0 ? undefined : maps;
}

function readOptionalStringField<K extends 'workspaceName' | 'activeNoteId'>(
  source: Record<string, unknown>,
  field: K,
): { [P in K]?: string } {
  const value = source[field];
  return typeof value === 'string' && value.trim() !== '' ? { [field]: value } as { [P in K]?: string } : {};
}

function readOptionalBooleanField<K extends 'inlineAiProjectionsVisible' | 'memoryCandidatesVisible' | 'returnLayerVisible' | 'expandedDigest'>(
  source: Record<string, unknown>,
  field: K,
): { [P in K]?: boolean } {
  const value = source[field];
  return typeof value === 'boolean' ? { [field]: value } as { [P in K]?: boolean } : {};
}

function readAiStatusField(value: unknown): Pick<BrowserRuntimeOpenNoteViewOptions, 'aiStatus'> {
  return value === 'saved' || value === 'structuring' || value === 'updated' || value === 'failed'
    ? { aiStatus: value }
    : {};
}

function readOptionalStringRecordField<K extends 'operationIdByBlockId' | 'memoryIdByBlockId' | 'sourceSpanIdByBlockId'>(
  source: Record<string, unknown>,
  field: K,
): { [P in K]?: Readonly<Record<string, string>> } {
  const value = readStringRecord(source[field]);
  return value === undefined ? {} : { [field]: value } as { [P in K]?: Readonly<Record<string, string>> };
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  const record = readPlainRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const entries = Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function readPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function resolveDigestReadFailureProjectionAction(
  eventDescriptor: unknown,
): SuccessfulApiProjectionAction | undefined {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return undefined;
  }
  const { action, target, apiIntent } = descriptor;

  return action === 'read_digest'
    && target === 'next_open_digest'
    && isDigestReadApiIntent(apiIntent)
    ? { action, target, digest: { available: false, loadState: 'transport_failed' } }
    : undefined;
}
