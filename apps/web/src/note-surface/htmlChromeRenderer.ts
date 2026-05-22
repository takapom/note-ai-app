import type { NoteSurfaceViewModel } from '../noteSurface.ts';
import { escapeAttribute, escapeHtml } from '../shared-ui/htmlEscape.ts';
import {
  renderInlineActionButton,
  renderReturnLayerActionButton,
  renderUiActionStateLabel,
} from './htmlBlockRenderer.ts';
import { renderReturnLayerActionLabel, renderReturnLayerEmptyLabel } from './htmlLabels.ts';

export function renderThinRail(rail: NoteSurfaceViewModel['quietWriting']['thinRail']): string {
  const thoughts = rail.recentThoughts.map((thought) => [
    '<li>',
    `<button type="button" class="ann-thin-rail__thought" data-action="open_recent_thought" data-target="thin_rail" data-note-id="${escapeAttribute(thought.id)}" aria-current="${thought.active ? 'true' : 'false'}">`,
    `<span class="ann-thin-rail__thought-title">${escapeHtml(thought.title)}</span>`,
    `<span class="ann-thin-rail__thought-meta">${escapeHtml(thought.updatedLabel)}</span>`,
    '</button>',
    '</li>',
  ].join('')).join('');

  return [
    '<aside class="ann-thin-rail" data-region="thinRail" aria-label="最近の思考">',
    `<div class="ann-thin-rail__workspace" data-workspace-name="true">${escapeHtml(rail.workspaceName)}</div>`,
    '<div class="ann-thin-rail__mark" aria-hidden="true">ANN</div>',
    '<nav class="ann-thin-rail__nav">',
    '<p class="ann-thin-rail__label">最近</p>',
    `<ul class="ann-thin-rail__list">${thoughts}</ul>`,
    '</nav>',
    '<div class="ann-thin-rail__tools" aria-label="ツール">',
    '<button type="button" class="ann-icon-button" data-action="open_search" data-target="thin_rail" aria-label="検索"><span class="ann-icon-button__glyph" aria-hidden="true">⌕</span></button>',
    '<button type="button" class="ann-icon-button" data-action="open_settings" data-target="thin_rail" aria-label="設定"><span class="ann-icon-button__glyph" aria-hidden="true">⚙</span></button>',
    '</div>',
    '</aside>',
  ].join('');
}

export function renderWritingChrome(chrome: NoteSurfaceViewModel['quietWriting']['writingChrome']): string {
  const digestStatus = chrome.digestStatus === undefined
    ? ''
    : `<p class="ann-writing-chrome__digest-status" data-digest-status-kind="${escapeAttribute(chrome.digestStatusKind ?? 'unavailable')}" role="status">${escapeHtml(chrome.digestStatus)}</p>`;

  return [
    '<header class="ann-writing-chrome" data-region="writingChrome">',
    '<div class="ann-writing-chrome__left">',
    digestStatus,
    '<div class="ann-writing-chrome__status">',
    chrome.returnStatus === undefined
      ? ''
      : `<span class="ann-writing-chrome__return-status">${escapeHtml(chrome.returnStatus)}</span>`,
    `<span class="ann-writing-chrome__ai-status" data-save-status="visible">${escapeHtml(chrome.aiStatusLabel)}</span>`,
    '</div>',
    '</div>',
    '<div class="ann-writing-chrome__actions" aria-label="ノート操作">',
    '<button type="button" class="ann-text-button ann-writing-chrome__share">共有</button>',
    '<button type="button" class="ann-icon-button ann-writing-chrome__more" aria-label="その他"><span aria-hidden="true">…</span></button>',
    '</div>',
    '</header>',
  ].join('');
}

export function renderReEntrySurface(
  reEntry: NoteSurfaceViewModel['quietWriting']['reEntrySurface'],
  noteId: string,
): string {
  if (!reEntry.visible || reEntry.directions.length === 0) {
    return '';
  }

  const directions = reEntry.directions.map((direction) => [
    '<li class="ann-re-entry__direction">',
    `<button type="button" class="ann-re-entry__direction-button" data-action="continue_writing" data-target="re_entry_surface" data-note-id="${escapeAttribute(noteId)}" data-direction-id="${escapeAttribute(direction.id)}">`,
    `<span class="ann-re-entry__direction-title">${escapeHtml(direction.title)}</span>`,
    `<span class="ann-re-entry__direction-summary">${escapeHtml(direction.summary)}</span>`,
    direction.sourceAvailable
      ? '<span class="ann-re-entry__direction-source" data-source-available="true">出典あり</span>'
      : '<span class="ann-re-entry__direction-source" data-source-available="false">出典なし</span>',
    '</button>',
    '</li>',
  ].join('')).join('');

  return [
    '<section class="ann-re-entry" data-component="re-entry-surface" data-visible="true">',
    `<h2 class="ann-re-entry__heading">${escapeHtml(reEntry.heading)}</h2>`,
    `<ol class="ann-re-entry__directions">${directions}</ol>`,
    `<button type="button" class="ann-text-button ann-re-entry__primary" data-action="continue_writing" data-target="re_entry_surface" data-note-id="${escapeAttribute(noteId)}">ここから続ける</button>`,
    '</section>',
  ].join('');
}

export function renderReturnLayer(
  returnLayer: NoteSurfaceViewModel['quietWriting']['returnLayer'],
  noteId: string,
): string {
  if (!returnLayer.available) {
    return '';
  }

  if (!returnLayer.open) {
    const count = returnLayer.points.length;
    const summary = returnLayer.summary ?? (count === 0
      ? renderReturnLayerEmptyLabel(returnLayer.emptyState)
      : `未整理だった論点を、${count}つにまとめました`);

    return [
      '<section class="ann-return-layer ann-return-layer--inline" data-component="return-layer" data-open="false" data-available="true">',
      `<button type="button" class="ann-return-layer__toggle" data-action="expand_digest" data-target="next_open_digest" data-note-id="${escapeAttribute(noteId)}">`,
      `<span class="ann-return-layer__label">${escapeHtml(returnLayer.label)}</span>`,
      `<span class="ann-return-layer__toggle-summary">${escapeHtml(summary)}</span>`,
      count === 0 ? '' : `<span class="ann-return-layer__count">${count}件</span>`,
      '<span class="ann-return-layer__chevron" aria-hidden="true">▾</span>',
      '</button>',
      '</section>',
    ].join('');
  }

  const points = returnLayer.points.map((point, index) => {
    const sourceAttrs = point.source === undefined
      ? ''
      : [
          point.source.blockId === undefined ? '' : ` data-source-block-id="${escapeAttribute(point.source.blockId)}"`,
          point.source.noteId === undefined ? '' : ` data-source-note-id="${escapeAttribute(point.source.noteId)}"`,
        ].join('');
    const sourceState = point.sourceInspectable && point.source?.blockId !== undefined
      ? `<button type="button" class="ann-text-button ann-return-layer__source" data-action="inspect_source" data-target="return_layer" data-block-id="${escapeAttribute(point.source.blockId)}" data-digest-item-id="${escapeAttribute(point.id)}">出典</button>`
      : '';
    const explanation = point.explanation.length === 0
      ? ''
      : `<span class="ann-return-layer__point-explanation">${escapeHtml(point.explanation)}</span>`;

    return [
      `<li class="ann-return-layer__point" data-digest-item-id="${escapeAttribute(point.id)}"${sourceAttrs}>`,
      `<span class="ann-return-layer__point-index" aria-hidden="true">${index + 1}</span>`,
      `<span class="ann-return-layer__point-title">${escapeHtml(point.title)}</span>`,
      explanation,
      sourceState,
      '</li>',
    ].join('');
  }).join('');

  const emptyState = returnLayer.points.length === 0
    ? `<p class="ann-return-layer__empty">${escapeHtml(renderReturnLayerEmptyLabel(returnLayer.emptyState))}</p>`
    : '';

  return [
    `<section class="ann-return-layer ann-return-layer--inline ann-return-layer--expanded" data-component="return-layer" data-open="true" data-available="true" role="region" aria-label="${escapeAttribute(returnLayer.label)}">`,
    '<header class="ann-return-layer__header">',
    `<p class="ann-return-layer__label">${escapeHtml(returnLayer.label)}</p>`,
    returnLayer.summary === undefined ? '' : `<h2 class="ann-return-layer__summary">${escapeHtml(returnLayer.summary)}</h2>`,
    `<button type="button" class="ann-return-layer__toggle ann-return-layer__toggle--expanded" data-action="collapse_digest" data-target="next_open_digest" data-note-id="${escapeAttribute(noteId)}" aria-label="整理を閉じる">▴</button>`,
    '</header>',
    emptyState,
    `<ol class="ann-return-layer__points">${points}</ol>`,
    '<div class="ann-return-layer__actions">',
    renderReturnLayerActionButton('defer_return_layer', 'あとで見る', noteId, returnLayer.actions.defer, true),
    renderReturnLayerActionButton('close_return_layer', '閉じる', noteId, returnLayer.actions.close, false),
    '</div>',
    '</section>',
  ].join('');
}

export function renderCarriedContextTray(tray: NoteSurfaceViewModel['quietWriting']['carriedContextTray']): string {
  if (tray.candidates.length === 0) {
    return '<footer class="ann-carried-context-tray" data-component="carried-context-tray" data-visible="false"></footer>';
  }

  const items = tray.candidates.map((candidate) => [
    '<article class="ann-carried-context-tray__item" data-inline-memory-candidate="true">',
    `<p class="ann-carried-context-tray__statement">${escapeHtml(candidate.statement)}</p>`,
    candidate.sourcePreview === undefined
      ? '<p class="ann-carried-context-tray__source" data-source-available="false">出典なし</p>'
      : `<p class="ann-carried-context-tray__source">${escapeHtml(candidate.sourcePreview)}</p>`,
    candidate.actionState === 'idle'
      ? ''
      : `<p class="ann-carried-context-tray__state" data-action-state="${escapeAttribute(candidate.actionState)}">${escapeHtml(renderUiActionStateLabel(candidate.actionState))}</p>`,
    '<div class="ann-inline-actions" data-action-group="memory_candidate">',
    renderInlineActionButton('remember', '覚える', candidate.id, 'memory_candidate_block', candidate.actionState),
    renderInlineActionButton('snooze', '保留', candidate.id, 'memory_candidate_block', candidate.actionState),
    renderInlineActionButton('reject', '違う', candidate.id, 'memory_candidate_block', candidate.actionState),
    '</div>',
    '</article>',
  ].join('')).join('');

  return [
    '<footer class="ann-carried-context-tray" data-component="carried-context-tray" data-visible="true" role="complementary">',
    `<p class="ann-carried-context-tray__label">${escapeHtml(tray.label)} <span class="ann-carried-context-tray__count">${tray.candidates.length}</span></p>`,
    `<div class="ann-carried-context-tray__items">${items}</div>`,
    '</footer>',
  ].join('');
}

export function renderHiddenDigestState(digest: NoteSurfaceViewModel['noteSurface']['nextOpenDigest']): string {
  return [
    `<section class="ann-next-open-digest ann-next-open-digest--hidden" data-component="next-open-digest" data-available="${digest.available}" data-expanded="${digest.expanded}" aria-hidden="true"></section>`,
  ].join('');
}
