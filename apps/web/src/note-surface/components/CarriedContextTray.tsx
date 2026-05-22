import type { CarriedContextTrayViewModel } from '../viewModelTypes.ts';

interface CarriedContextTrayProps {
  tray: CarriedContextTrayViewModel;
  onRemember(blockId: string): void;
  onReject(blockId: string): void;
}

export function CarriedContextTray({ tray, onRemember, onReject }: CarriedContextTrayProps) {
  if (tray.candidates.length === 0) {
    return <footer className="ann-carried-context-tray" data-component="carried-context-tray" data-visible="false" />;
  }

  return (
    <footer className="ann-carried-context-tray" data-component="carried-context-tray" data-visible="true" role="complementary">
      <p className="ann-carried-context-tray__label">{tray.label} <span className="ann-carried-context-tray__count">{tray.candidates.length}</span></p>
      <div className="ann-carried-context-tray__items">
        {tray.candidates.map((candidate) => (
          <article className="ann-carried-context-tray__item" data-inline-memory-candidate="true" key={candidate.id}>
            <p className="ann-carried-context-tray__statement">{candidate.statement}</p>
            {candidate.sourcePreview === undefined ? (
              <p className="ann-carried-context-tray__source" data-source-available="false">出典なし</p>
            ) : (
              <p className="ann-carried-context-tray__source">{candidate.sourcePreview}</p>
            )}
            <div className="ann-inline-actions" data-action-group="memory_candidate">
              <button type="button" data-action="remember" data-target="memory_candidate_block" data-block-id={candidate.id} onClick={() => onRemember(candidate.id)}>覚える</button>
              <button type="button" data-action="snooze" data-target="memory_candidate_block" data-block-id={candidate.id} onClick={() => onReject(candidate.id)}>保留</button>
              <button type="button" data-action="reject" data-target="memory_candidate_block" data-block-id={candidate.id} onClick={() => onReject(candidate.id)}>違う</button>
            </div>
          </article>
        ))}
      </div>
    </footer>
  );
}
