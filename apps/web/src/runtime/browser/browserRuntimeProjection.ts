import {
  createNextOpenDigestViewModel,
  createProvenancePopoverViewModel,
  refreshQuietWritingProjection,
  withReturnLayerActionState,
  withReturnLayerOpen,
  type NoteSurfaceViewModel,
} from '../../noteSurface.ts';
import type {
  LocalProjectionAction,
  SuccessfulApiProjectionAction,
  BlockUpdateProjectionAction,
} from './browserRuntimeActions.ts';
import { readDescriptorRawString } from './browserRuntimeDescriptor.ts';

export function applyLocalProjectionAction(
  model: NoteSurfaceViewModel,
  action: LocalProjectionAction,
): NoteSurfaceViewModel {
  switch (action.action) {
    case 'expand_digest':
    case 'collapse_digest':
      return withReturnLayerOpen(model, action.action === 'expand_digest');
    case 'close_return_layer':
    case 'defer_return_layer':
      return withReturnLayerOpen(model, false);
    case 'continue_writing':
      return withReturnLayerOpen(model, false);
    case 'edit_block':
    case 'cancel_edit':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => (
            block.id === action.blockId
              ? {
                  ...block,
                  editor: {
                    actions: block.editor.actions,
                    state: action.action === 'edit_block' ? 'editing' : 'idle',
                    saveStatus: action.action === 'edit_block' ? 'dirty' : 'saved',
                    statusMessage: action.action === 'edit_block' ? '未保存の変更' : '保存済み',
                  },
                }
              : block
          )),
        },
      };
    case 'edit':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => (
            block.id === action.blockId && block.aiAssist !== undefined
              ? {
                  ...block,
                  ...(action.content !== undefined && block.aiAssist.editing
                    ? { text: action.content }
                    : {}),
                  aiAssist: {
                    ...block.aiAssist,
                    editing: !block.aiAssist.editing,
                  },
                }
              : block
          )),
        },
      };
    case 'save_block':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => {
            if (block.id !== action.blockId) {
              return block;
            }

            return {
              ...block,
              text: action.content,
              editor: {
                actions: block.editor.actions,
                state: 'idle',
                saveStatus: 'saved',
                statusMessage: 'Saved',
              },
              ...(block.sectionBoundary === undefined
                ? {}
                : {
                    sectionBoundary: {
                      ...block.sectionBoundary,
                      title: action.content,
                    },
                  }),
            };
          }),
          sectionBoundaries: model.noteSurface.sectionBoundaries.map((boundary) => (
            boundary.blockId === action.blockId
              ? { ...boundary, title: action.content }
              : boundary
          )),
        },
      };
    case 'close_provenance':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          provenancePopover: {
            ...model.noteSurface.provenancePopover,
            open: false,
          },
        },
      };
  }
}

export function enrichLocalProjectionAction(
  model: NoteSurfaceViewModel,
  action: LocalProjectionAction | undefined,
  eventDescriptor: unknown,
): LocalProjectionAction | undefined {
  if (action?.action !== 'edit' || action.target !== 'ai_assist_block') {
    return action;
  }

  const block = model.noteSurface.blocks.find((candidate) => candidate.id === action.blockId);
  if (block?.aiAssist?.editing !== true) {
    return action;
  }

  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return action;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const content = readDescriptorRawString(source, dataset, 'content');
  return content === undefined ? action : { ...action, content };
}

export function applyEditorSaveStarted(
  model: NoteSurfaceViewModel,
  action: BlockUpdateProjectionAction,
): NoteSurfaceViewModel {
  return {
    ...model,
    noteSurface: {
      ...model.noteSurface,
      blocks: model.noteSurface.blocks.map((block) => (
        block.id === action.blockId
          ? {
              ...block,
              editor: {
                actions: block.editor.actions,
                state: 'editing',
                saveStatus: 'saving',
                statusMessage: '保存中',
                draftText: action.content,
              },
            }
          : block
      )),
    },
  };
}

export function applyEditorSaveFailed(
  model: NoteSurfaceViewModel,
  action: BlockUpdateProjectionAction,
  errors: readonly string[],
): NoteSurfaceViewModel {
  return {
    ...model,
    noteSurface: {
      ...model.noteSurface,
      blocks: model.noteSurface.blocks.map((block) => (
        block.id === action.blockId
          ? {
              ...block,
              editor: {
                ...block.editor,
                state: 'editing',
                saveStatus: 'error',
                statusMessage: errors[0] ?? '保存に失敗しました',
                retryAction: 'save_block',
                draftText: action.content,
              },
            }
          : block
      )),
    },
  };
}

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
