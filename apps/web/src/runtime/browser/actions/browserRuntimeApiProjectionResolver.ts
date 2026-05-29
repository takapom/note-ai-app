import { parseNextOpenDigestInput } from '../../../noteSurface.ts';
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
  isProvenanceLookupApiIntent,
} from '../../actions/renderActionIntents.ts';
import { readString } from '../browserRuntimeDescriptor.ts';
import {
  readMemoryProjection,
  readProvenanceProjection,
} from '../browserRuntimePayload.ts';
import type { SuccessfulApiProjectionAction } from './browserRuntimeActionTypes.ts';

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
