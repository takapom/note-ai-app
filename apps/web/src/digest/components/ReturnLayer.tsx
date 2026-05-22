import type { ReturnLayerViewModel } from '../../note-surface/viewModelTypes.ts';

interface ReturnLayerProps {
  returnLayer: ReturnLayerViewModel;
  noteId: string;
  onContinueWriting(): void;
  onExpand(): void;
  onCollapse(): void;
  onClose(): void;
  onInspectSource(): void;
}

export function ReturnLayer({ returnLayer, noteId, onContinueWriting, onExpand, onCollapse, onClose, onInspectSource }: ReturnLayerProps) {
  if (!returnLayer.available) {
    return null;
  }

  if (!returnLayer.open) {
    const count = returnLayer.points.length;
    const summary = returnLayer.summary ?? (count === 0 ? renderReturnLayerEmptyLabel(returnLayer.emptyState) : `未整理だった論点を、${count}つにまとめました`);
    return (
      <section className="ann-return-layer ann-return-layer--inline" data-component="return-layer" data-open="false" data-available="true">
        <button type="button" className="ann-return-layer__toggle" data-note-id={noteId} onClick={onExpand}>
          <span className="ann-return-layer__label">{returnLayer.label}</span>
          <span className="ann-return-layer__toggle-summary">{summary}</span>
          {count === 0 ? null : <span className="ann-return-layer__count">{count}件</span>}
          <span className="ann-return-layer__chevron" aria-hidden="true">▾</span>
        </button>
      </section>
    );
  }

  return (
    <section className="ann-return-layer ann-return-layer--inline ann-return-layer--expanded" data-component="return-layer" data-open="true" data-available="true" role="region" aria-label={returnLayer.label}>
      <header className="ann-return-layer__header">
        <p className="ann-return-layer__label">{returnLayer.label}</p>
        {returnLayer.summary === undefined ? null : <h2 className="ann-return-layer__summary">{returnLayer.summary}</h2>}
        <button type="button" className="ann-return-layer__toggle ann-return-layer__toggle--expanded" aria-label="整理を閉じる" onClick={onCollapse}>▴</button>
      </header>
      {returnLayer.points.length === 0 ? <p className="ann-return-layer__empty">{renderReturnLayerEmptyLabel(returnLayer.emptyState)}</p> : null}
      <ol className="ann-return-layer__points">
        {returnLayer.points.map((point, index) => (
          <li className="ann-return-layer__point" data-digest-item-id={point.id} data-source-block-id={point.source?.blockId} data-source-note-id={point.source?.noteId} key={point.id}>
            <span className="ann-return-layer__point-index" aria-hidden="true">{index + 1}</span>
            <span className="ann-return-layer__point-title">{point.title}</span>
            {point.explanation.length === 0 ? null : <span className="ann-return-layer__point-explanation">{point.explanation}</span>}
            {point.sourceInspectable ? <button type="button" className="ann-text-button ann-return-layer__source" data-digest-item-id={point.id} onClick={onInspectSource}>出典</button> : null}
          </li>
        ))}
      </ol>
      <div className="ann-return-layer__actions">
        <button type="button" className="ann-text-button ann-return-layer__primary" data-note-id={noteId} onClick={onContinueWriting}>あとで見る</button>
        <button type="button" className="ann-text-button" data-note-id={noteId} onClick={onClose}>閉じる</button>
      </div>
    </section>
  );
}

function renderReturnLayerEmptyLabel(emptyState: ReturnLayerViewModel['emptyState']): string {
  switch (emptyState) {
    case 'load_failed':
      return '整理の取得に失敗しました';
    case 'invalid_body':
      return '整理データを読み取れませんでした';
    case 'unavailable':
      return '戻ってきた整理はまだありません';
    case 'no_items':
      return '新しく戻す整理はありません';
    case 'has_items':
      return '';
  }
}
