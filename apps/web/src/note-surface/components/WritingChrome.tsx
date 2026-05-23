import type { WritingChromeViewModel } from '../viewModelTypes.ts';

interface WritingChromeProps {
  chrome: WritingChromeViewModel;
  commandMenuOpen: boolean;
  shareStatus: string | undefined;
  onShareNote(): void;
  onToggleCommandMenu(): void;
  onManualOrganize(): void;
  onCreateNote(): void;
}

export function WritingChrome({
  chrome,
  commandMenuOpen,
  shareStatus,
  onShareNote,
  onToggleCommandMenu,
  onManualOrganize,
  onCreateNote,
}: WritingChromeProps) {
  return (
    <header className="ann-writing-chrome" data-region="writingChrome">
      <div className="ann-writing-chrome__left">
        {chrome.digestStatus === undefined ? null : (
          <p className="ann-writing-chrome__digest-status" data-digest-status-kind={chrome.digestStatusKind ?? 'unavailable'} role="status">{chrome.digestStatus}</p>
        )}
        <div className="ann-writing-chrome__status">
          {chrome.returnStatus === undefined ? null : <span className="ann-writing-chrome__return-status">{chrome.returnStatus}</span>}
          <span className="ann-writing-chrome__ai-status" data-save-status="visible">{chrome.aiStatusLabel}</span>
          {shareStatus === undefined ? null : <span className="ann-writing-chrome__share-status" role="status">{shareStatus}</span>}
        </div>
      </div>
      <div className="ann-writing-chrome__actions" aria-label="ノート操作">
        <button type="button" className="ann-text-button ann-writing-chrome__share" onClick={onShareNote}>共有</button>
        <div className="ann-writing-chrome__menu-anchor">
          <button type="button" className="ann-icon-button ann-writing-chrome__more" aria-label="その他" aria-expanded={commandMenuOpen} onClick={onToggleCommandMenu}><span aria-hidden="true">…</span></button>
          {commandMenuOpen ? (
            <div className="ann-writing-chrome__menu" role="menu" aria-label="その他の操作">
              <button type="button" role="menuitem" onClick={onManualOrganize}>このメモを整理</button>
              <button type="button" role="menuitem" onClick={onCreateNote}>新規メモ</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
