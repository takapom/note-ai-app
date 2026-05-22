import type { ThinRailViewModel } from '../viewModelTypes.ts';

interface ThinRailProps {
  rail: ThinRailViewModel;
  onOpenRecentThought(noteId: string): void;
}

export function ThinRail({ rail, onOpenRecentThought }: ThinRailProps) {
  return (
    <aside className="ann-thin-rail" data-region="thinRail" aria-label="最近の思考">
      <div className="ann-thin-rail__workspace" data-workspace-name="true">{rail.workspaceName}</div>
      <div className="ann-thin-rail__mark" aria-hidden="true">ANN</div>
      <nav className="ann-thin-rail__nav">
        <p className="ann-thin-rail__label">最近</p>
        <ul className="ann-thin-rail__list">
          {rail.recentThoughts.map((thought) => (
            <li key={thought.id}>
              <button type="button" className="ann-thin-rail__thought" aria-current={thought.active ? 'true' : 'false'} onClick={() => onOpenRecentThought(thought.id)}>
                <span className="ann-thin-rail__thought-title">{thought.title}</span>
                <span className="ann-thin-rail__thought-meta">{thought.updatedLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ann-thin-rail__tools" aria-label="ツール">
        <button type="button" className="ann-icon-button" aria-label="検索"><span className="ann-icon-button__glyph" aria-hidden="true">⌕</span></button>
        <button type="button" className="ann-icon-button" aria-label="設定"><span className="ann-icon-button__glyph" aria-hidden="true">⚙</span></button>
      </div>
    </aside>
  );
}
