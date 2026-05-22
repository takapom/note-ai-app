import type { WritingChromeViewModel } from '../viewModelTypes.ts';

interface WritingChromeProps {
  chrome: WritingChromeViewModel;
}

export function WritingChrome({ chrome }: WritingChromeProps) {
  return (
    <header className="ann-writing-chrome" data-region="writingChrome">
      <div className="ann-writing-chrome__left">
        {chrome.digestStatus === undefined ? null : (
          <p className="ann-writing-chrome__digest-status" data-digest-status-kind={chrome.digestStatusKind ?? 'unavailable'} role="status">{chrome.digestStatus}</p>
        )}
        <div className="ann-writing-chrome__status">
          {chrome.returnStatus === undefined ? null : <span className="ann-writing-chrome__return-status">{chrome.returnStatus}</span>}
          <span className="ann-writing-chrome__ai-status" data-save-status="visible">{chrome.aiStatusLabel}</span>
        </div>
      </div>
      <div className="ann-writing-chrome__actions" aria-label="ノート操作">
        <button type="button" className="ann-text-button ann-writing-chrome__share">共有</button>
        <button type="button" className="ann-icon-button ann-writing-chrome__more" aria-label="その他"><span aria-hidden="true">…</span></button>
      </div>
    </header>
  );
}
