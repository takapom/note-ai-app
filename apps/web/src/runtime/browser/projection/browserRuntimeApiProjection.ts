import {
  createNextOpenDigestViewModel,
  createProvenancePopoverViewModel,
  refreshQuietWritingProjection,
  type NoteSurfaceViewModel,
} from '../../../noteSurface.ts';
import type { SuccessfulApiProjectionAction } from '../actions/browserRuntimeActionTypes.ts';
import { applyLocalProjectionAction } from './browserRuntimeLocalProjection.ts';

export function applySuccessfulApiProjectionAction(
  model: NoteSurfaceViewModel,
  action: SuccessfulApiProjectionAction,
): NoteSurfaceViewModel {
  switch (action.action) {
    case 'expand_digest':
    case 'collapse_digest':
    case 'close_return_layer':
    case 'defer_return_layer':
    case 'continue_writing':
    case 'edit_block':
    case 'cancel_edit':
    case 'save_block':
    case 'close_provenance':
      return applyLocalProjectionAction(model, action);
    case 'read_digest':
      return refreshQuietWritingProjection({
        ...model,
        noteSurface: {
          ...model.noteSurface,
          nextOpenDigest: createNextOpenDigestViewModel(action.digest, true),
        },
      });
    case 'lookup_provenance':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          provenancePopover: createProvenancePopoverViewModel(action.provenance),
        },
      };
    case 'remember':
    case 'reject':
    case 'delete':
    case 'snooze':
    case 'adopt':
      return refreshQuietWritingProjection({
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.filter((block) => block.id !== action.blockId),
          sectionBoundaries: model.noteSurface.sectionBoundaries.filter((boundary) => (
            boundary.blockId !== action.blockId
          )),
        },
      });
    case 'edit':
      if (action.target === 'ai_assist_block') {
        return applyLocalProjectionAction(model, action);
      }

      return refreshQuietWritingProjection({
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => (
            block.id === action.blockId
              ? {
                  ...block,
                  text: action.content,
                  editor: {
                    ...block.editor,
                    state: 'idle',
                  },
                }
              : block
          )),
        },
      });
  }
}
