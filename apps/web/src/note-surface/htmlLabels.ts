import type { BlockEditorAction, NoteBlockViewModel, NoteSurfaceViewModel } from '../noteSurface.ts';

export function renderBlockEditorActionLabel(action: BlockEditorAction, block?: NoteBlockViewModel): string {
  switch (action) {
    case 'edit_block':
      return '編集';
    case 'save_block':
      if (block?.editor.retryAction === 'save_block') {
        return '再試行';
      }
      return '保存';
    case 'cancel_edit':
      return 'キャンセル';
  }
}

export function renderReturnLayerActionLabel(action: 'defer_return_layer' | 'close_return_layer'): string {
  switch (action) {
    case 'defer_return_layer':
      return 'あとで見る';
    case 'close_return_layer':
      return '閉じる';
  }
}

export function renderReturnLayerEmptyLabel(
  emptyState: NoteSurfaceViewModel['quietWriting']['returnLayer']['emptyState'],
): string {
  switch (emptyState) {
    case 'unavailable':
      return '戻ってきた整理はまだありません';
    case 'load_failed':
      return '整理の取得に失敗しました';
    case 'invalid_body':
      return '整理データを読み取れませんでした';
    case 'no_items':
      return '整理項目はまだありません';
    case 'has_items':
      return '';
  }
}
