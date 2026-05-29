import type { ChangeEvent } from 'react';
import type { ThinRailViewModel } from '../viewModelTypes.ts';

interface ThinRailProps {
  rail: ThinRailViewModel;
  searchOpen: boolean;
  searchQuery: string;
  settingsOpen: boolean;
  onCreateNote(): void;
  onOpenRecentThought(noteId: string): void;
  onToggleSearch(): void;
  onSearchQueryChange(query: string): void;
  onToggleSettings(): void;
}

export function ThinRail({
  rail,
  searchOpen,
  searchQuery,
  settingsOpen,
  onCreateNote,
  onOpenRecentThought,
  onToggleSearch,
  onSearchQueryChange,
  onToggleSettings,
}: ThinRailProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange(event.currentTarget.value);
  };

  return (
    <aside className="ann-thin-rail" data-region="thinRail" aria-label="最近の思考">
      <div className="ann-thin-rail__workspace-row">
        <div className="ann-thin-rail__workspace" data-workspace-name="true">{rail.workspaceName}</div>
        <button type="button" className="ann-icon-button ann-thin-rail__new-note" aria-label="新規メモ" onClick={onCreateNote}>+</button>
      </div>
      <div className="ann-thin-rail__mark" aria-hidden="true">ANN</div>
      <nav className="ann-thin-rail__nav">
        <p className="ann-thin-rail__label">最近</p>
        {rail.noteLibraryStatus === undefined ? null : (
          <p
            className="ann-thin-rail__status"
            data-note-library-state={rail.noteLibraryStatus.state}
            role="status"
          >
            {rail.noteLibraryStatus.label}
          </p>
        )}
        {searchOpen ? (
          <label className="ann-thin-rail__search">
            <span className="ann-visually-hidden">メモを検索</span>
            <input
              className="ann-thin-rail__search-input"
              type="search"
              value={searchQuery}
              placeholder="メモを検索"
              onChange={handleSearchChange}
              autoFocus
            />
          </label>
        ) : null}
        <ul className="ann-thin-rail__list">
          {rail.recentThoughts.length === 0 ? (
            <li className="ann-thin-rail__empty">一致するメモはありません</li>
          ) : rail.recentThoughts.map((thought) => (
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
        <button type="button" className="ann-icon-button" aria-label="検索" aria-pressed={searchOpen} onClick={onToggleSearch}><span className="ann-icon-button__glyph" aria-hidden="true">⌕</span></button>
        <button type="button" className="ann-icon-button" aria-label="設定" aria-pressed={settingsOpen} onClick={onToggleSettings}><span className="ann-icon-button__glyph" aria-hidden="true">⚙</span></button>
      </div>
    </aside>
  );
}
