import {
  createNextOpenDigestViewModel,
  createNoteSurfaceViewModel,
  createProvenancePopoverViewModel,
  refreshQuietWritingProjection,
  type CreateNoteSurfaceViewModelOptions,
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
    case 'open_recent_thought':
      return createNoteSurfaceViewModel(
        action.document,
        createOpenRecentThoughtViewOptions(model, action.noteId),
      );
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

function createOpenRecentThoughtViewOptions(
  model: NoteSurfaceViewModel,
  noteId: string,
): CreateNoteSurfaceViewModelOptions {
  return {
    workspaceName: model.topBar.workspaceName,
    aiStatus: 'saved',
    recentThoughts: model.quietWriting.thinRail.recentThoughts.map((thought) => ({
      id: thought.id,
      title: thought.title,
      updatedLabel: thought.updatedLabel,
      active: thought.id === noteId,
    })),
    ...(model.quietWriting.thinRail.noteLibraryStatus === undefined
      ? {}
      : { noteLibraryStatus: model.quietWriting.thinRail.noteLibraryStatus }),
  };
}
