import {
  withReturnLayerOpen,
  type NoteSurfaceViewModel,
} from '../../../noteSurface.ts';
import type { LocalProjectionAction } from '../actions/browserRuntimeActionTypes.ts';
import { readDescriptorRawString } from '../browserRuntimeDescriptor.ts';

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
  if (action?.action !== 'edit') {
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
