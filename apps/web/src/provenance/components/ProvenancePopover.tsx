import type { ProvenancePopoverViewModel } from '../../note-surface/viewModelTypes.ts';

interface ProvenancePopoverProps {
  popover: ProvenancePopoverViewModel;
  onClose(): void;
}

export function ProvenancePopover({ popover, onClose }: ProvenancePopoverProps) {
  if (!popover.open) {
    return <aside className="ann-provenance-popover" data-component="provenance-popover" data-open="false" />;
  }

  return (
    <aside
      className="ann-provenance-popover"
      data-component="provenance-popover"
      data-open="true"
      data-source-block-id={popover.source?.blockId}
      data-source-note-id={popover.source?.noteId}
      data-source-unit-id={popover.source?.unitId}
      data-source-start-offset={popover.source?.startOffset}
      data-source-end-offset={popover.source?.endOffset}
      role="dialog"
      aria-label="Source provenance"
    >
      <header>
        <h2>出典の確認</h2>
        <button type="button" data-action="close_provenance" data-target="provenance_popover" onClick={onClose}>閉じる</button>
      </header>
      {popover.source?.title === undefined ? null : <p data-source-title="true">{popover.source.title}</p>}
      {popover.reason === undefined ? null : <p data-provenance-reason="true">{popover.reason}</p>}
      {popover.boundedExcerpt === undefined ? null : <blockquote>{popover.boundedExcerpt}</blockquote>}
    </aside>
  );
}
