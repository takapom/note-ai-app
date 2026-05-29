import {
  readNoteSurfaceRenderActionDescriptor,
  readNoteSurfaceRenderActionDescriptorRawString,
} from '../../actions/renderActionDescriptor.ts';
import type { LocalProjectionAction } from './browserRuntimeActionTypes.ts';

export function resolveLocalProjectionAction(eventDescriptor: unknown): LocalProjectionAction | undefined {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return undefined;
  }
  const { action, target, apiIntent } = descriptor;

  if (apiIntent !== 'none') {
    return undefined;
  }

  if (
    (action === 'expand_digest' || action === 'collapse_digest')
    && target === 'next_open_digest'
  ) {
    return { action, target };
  }

  if (
    (action === 'close_return_layer' || action === 'defer_return_layer')
    && target === 'return_layer'
  ) {
    return { action, target };
  }

  if (action === 'continue_writing' && target === 're_entry_surface') {
    const directionId = descriptor.directionId;
    return directionId === undefined
      ? { action, target }
      : { action, target, directionId };
  }

  if (
    (action === 'edit_block' || action === 'cancel_edit')
    && target === 'block_editor'
  ) {
    const blockId = descriptor.blockId;
    return blockId === undefined ? undefined : { action, target, blockId };
  }

  if (action === 'save_block' && target === 'block_editor') {
    const blockId = descriptor.blockId;
    const content = readNoteSurfaceRenderActionDescriptorRawString(eventDescriptor, 'content');
    return blockId === undefined || content === undefined ? undefined : { action, target, blockId, content };
  }

  if (action === 'edit' && target === 'ai_assist_block') {
    const blockId = descriptor.blockId;
    return blockId === undefined ? undefined : { action, target, blockId };
  }

  if (action === 'close_provenance' && target === 'provenance_popover') {
    return { action, target };
  }

  return undefined;
}
