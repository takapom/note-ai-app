import type { FocusEvent } from 'react';
import type { NoteBlockViewModel } from '../../note-surface/viewModelTypes.ts';

interface AiAssistBlockProps {
  block: NoteBlockViewModel;
  onInspectSource(): void;
  onToggleEditing(): void;
  onDelete(): void;
}

export function AiAssistBlock({ block, onInspectSource, onToggleEditing, onDelete }: AiAssistBlockProps) {
  const aiAssist = block.aiAssist;
  if (aiAssist === undefined) {
    return null;
  }

  return (
    <section className="ann-ai-assist-block" data-inline-ai-block="true" data-ai-assist-kind={aiAssist.kind} data-block-origin="ai" data-editing={aiAssist.editing}>
      <div className="ann-inline-label" aria-label="整理由来">{aiAssist.label}</div>
      {aiAssist.editing ? (
        <div className="ann-block-text" data-block-editor-content="true" data-editor-composition-state="idle" role="textbox" aria-readonly="false" contentEditable suppressContentEditableWarning onFocus={placeCaretAtEnd}>
          {block.text}
        </div>
      ) : (
        <div className="ann-block-text" role="document" aria-readonly="true">{block.text}</div>
      )}
      <div className="ann-inline-actions" data-action-group="ai_assist">
        {aiAssist.sourceInspectable ? <button type="button" data-action="inspect_source" data-target="ai_assist_block" data-block-id={block.id} onClick={onInspectSource}>出典</button> : null}
        <button type="button" data-action="edit" data-target="ai_assist_block" data-block-id={block.id} onClick={onToggleEditing}>{aiAssist.editing ? '完了' : '編集'}</button>
        <button type="button" data-action="delete" data-target="ai_assist_block" data-block-id={block.id} onClick={onDelete}>削除</button>
      </div>
      {aiAssist.editing ? <p className="ann-ai-assist-block__hint">編集した提案はこのノート内の表示に反映されます。削除で提案を閉じられます。</p> : null}
    </section>
  );
}

function placeCaretAtEnd(event: FocusEvent<HTMLDivElement>): void {
  const selection = window.getSelection();
  if (selection === null) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(event.currentTarget);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
