import type { NoteSurfaceViewModel } from '../../../noteSurface.ts';
import type { BlockUpdateProjectionAction } from '../actions/browserRuntimeActionTypes.ts';

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
