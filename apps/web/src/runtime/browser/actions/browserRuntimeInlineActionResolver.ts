import { readNoteSurfaceRenderActionDescriptor } from '../../actions/renderActionDescriptor.ts';
import type { InlineApiProjectionAction } from './browserRuntimeActionTypes.ts';

export function resolveInlineApiProjectionAction(eventDescriptor: unknown): InlineApiProjectionAction | undefined {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return undefined;
  }
  const { action, target, apiIntent, blockId } = descriptor;

  if (apiIntent === 'none' || blockId === undefined) {
    return undefined;
  }

  if (target === 'memory_candidate_block' || target === 'ai_assist_block') {
    return { action, target, blockId };
  }

  return undefined;
}
