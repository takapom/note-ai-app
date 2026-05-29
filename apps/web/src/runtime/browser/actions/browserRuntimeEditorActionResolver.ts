import {
  readNoteSurfaceRenderActionDescriptor,
  readNoteSurfaceRenderActionDescriptorRawString,
} from '../../actions/renderActionDescriptor.ts';
import { isCanonicalRenderApiIntent } from '../../actions/renderActionIntents.ts';
import type { BlockUpdateProjectionAction } from './browserRuntimeActionTypes.ts';

export function resolveBlockUpdateProjectionAction(eventDescriptor: unknown): BlockUpdateProjectionAction | undefined {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return undefined;
  }
  const { action, target, apiIntent } = descriptor;

  if (action !== 'save_block' || target !== 'block_editor' || !isCanonicalRenderApiIntent(apiIntent, 'block.update')) {
    return undefined;
  }

  const blockId = descriptor.blockId;
  const content = readNoteSurfaceRenderActionDescriptorRawString(eventDescriptor, 'content');
  return blockId === undefined || content === undefined
    ? undefined
    : { action, target, blockId, content };
}

export function isInputCompositionSaveBlocked(eventDescriptor: unknown): boolean {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return false;
  }
  const { action, target } = descriptor;
  const state = descriptor.inputCompositionState;

  return action === 'save_block'
    && target === 'block_editor'
    && (state === 'active' || state === 'pending');
}
