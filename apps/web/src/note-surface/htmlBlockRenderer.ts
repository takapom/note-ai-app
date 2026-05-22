import type { NoteBlockViewModel, NoteSurfaceViewModel } from '../noteSurface.ts';
import type { NoteSurfaceHtmlRenderTarget } from './htmlRendererTypes.ts';
import { escapeAttribute, escapeHtml } from '../shared-ui/htmlEscape.ts';
import { renderBlockEditorActionLabel } from './htmlLabels.ts';

export function renderNoteHeader(model: NoteSurfaceViewModel): string {
  const header = model.noteSurface.noteHeader;

  return [
    '<header class="ann-note-header" data-component="note-header">',
    `<h1>${escapeHtml(header.title)}</h1>`,
    `<p data-note-description="effective">${escapeHtml(header.description.effective)}</p>`,
    '</header>',
  ].join('');
}

export function renderBlockEditorSurface(model: NoteSurfaceViewModel): string {
  const blocks = model.noteSurface.blocks
    .map(renderBlock)
    .join('');

  return [
    '<section class="ann-block-editor" data-component="block-editor" data-editor="block">',
    `<div class="ann-block-list" data-block-list="note">${blocks}</div>`,
    '</section>',
  ].join('');
}

function renderBlock(block: NoteBlockViewModel): string {
  const body = block.memoryCandidate !== undefined
    ? renderMemoryCandidateBlock(block)
    : block.aiAssist !== undefined
      ? renderAiAssistBlock(block)
      : renderUserBlockBody(block);
  const controls = block.memoryCandidate !== undefined || block.aiAssist !== undefined
    ? ''
    : renderBlockEditorControls(block);

  return [
    `<article class="ann-block ann-block--${escapeAttribute(block.type)}" data-block-id="${escapeAttribute(block.id)}" data-block-type="${escapeAttribute(block.type)}" data-block-origin="${escapeAttribute(block.origin)}" data-position="${block.position}" data-editor-state="${escapeAttribute(block.editor.state)}" data-editor-save-status="${escapeAttribute(block.editor.saveStatus)}" data-editor-layout-stability="block-identity">`,
    body,
    controls,
    renderBlockEditorStatus(block),
    '</article>',
  ].join('');
}

function renderUserBlockBody(block: NoteBlockViewModel): string {
  const text = block.editor.draftText ?? block.text;

  if (block.sectionBoundary !== undefined) {
    const level = block.sectionBoundary.level;
    const tag = `h${level}`;
    return [
      `<${tag} class="ann-block-text ann-heading" data-block-editor-content="true" data-editor-composition-state="idle" role="textbox" aria-readonly="false" contenteditable="true" data-section-level="${level}" data-section-title="${escapeAttribute(block.sectionBoundary.title)}">`,
      escapeHtml(text),
      `</${tag}>`,
    ].join('');
  }

  if (block.authoringIntent === 'quote') {
    return [
      '<blockquote class="ann-block-text ann-block-text--quote" data-block-editor-content="true" data-editor-composition-state="idle" role="textbox" aria-readonly="false" contenteditable="true" data-authoring-intent="quote">',
      escapeHtml(text),
      '</blockquote>',
    ].join('');
  }

  if (block.authoringIntent === 'bullet') {
    return [
      '<div class="ann-block-text ann-block-text--bullet" data-block-editor-content="true" data-editor-composition-state="idle" role="textbox" aria-readonly="false" contenteditable="true" data-authoring-intent="bullet">',
      escapeHtml(text),
      '</div>',
    ].join('');
  }

  return `<div class="ann-block-text" data-block-editor-content="true" data-editor-composition-state="idle" role="textbox" aria-readonly="false" contenteditable="true">${escapeHtml(text)}</div>`;
}

function renderAiAssistBlock(block: NoteBlockViewModel): string {
  const aiAssist = block.aiAssist;
  if (aiAssist === undefined) {
    return '';
  }

  const controls = aiAssist.actions
    .map((action) => renderInlineActionButton(
      action.id,
      action.id === 'edit' && aiAssist.editing ? '完了' : action.label,
      block.id,
      'ai_assist_block',
      aiAssist.actionStates[action.id] ?? 'idle',
    ))
    .join('');
  const sourceAvailability = aiAssist.sourceInspectable
    ? ''
    : '<p class="ann-ai-assist-block__source" data-source-available="false">出典なし</p>';
  const body = aiAssist.editing
    ? `<div class="ann-block-text" data-block-editor-content="true" data-editor-composition-state="idle" role="textbox" aria-readonly="false" contenteditable="true">${escapeHtml(block.text)}</div>`
    : `<div class="ann-block-text" role="document" aria-readonly="true">${escapeHtml(block.text)}</div>`;

  return [
    `<section class="ann-ai-assist-block" data-inline-ai-block="true" data-ai-assist-kind="${escapeAttribute(aiAssist.kind)}" data-block-origin="ai" data-editing="${aiAssist.editing}">`,
    `<div class="ann-inline-label" aria-label="AI由来">${escapeHtml(aiAssist.label)}</div>`,
    body,
    sourceAvailability,
    `<div class="ann-inline-actions" data-action-group="ai_assist">${controls}</div>`,
    aiAssist.editing
      ? '<p class="ann-ai-assist-block__hint">編集した提案はこのノート内の表示に反映されます。削除で提案を閉じられます。</p>'
      : '',
    '</section>',
  ].join('');
}

function renderMemoryCandidateBlock(block: NoteBlockViewModel): string {
  const memoryCandidate = block.memoryCandidate;
  if (memoryCandidate === undefined) {
    return '';
  }

  const trayActionState = resolveMemoryBlockActionState(memoryCandidate.actionStates);
  const controls = memoryCandidate.actions
    .map((action) => renderInlineActionButton(
      action.id,
      action.label,
      block.id,
      'memory_candidate_block',
      memoryCandidate.actionStates[action.id] ?? trayActionState,
    ))
    .join('');

  return [
    '<section class="ann-memory-candidate-block" data-inline-memory-candidate="true" data-block-origin="ai">',
    `<div class="ann-inline-label" aria-label="AI由来">${escapeHtml(memoryCandidate.label)}</div>`,
    `<div class="ann-block-text" role="textbox" aria-readonly="false" contenteditable="true">${escapeHtml(block.text)}</div>`,
    block.sourcePreview === undefined
      ? ''
      : `<p class="ann-memory-candidate-block__source">${escapeHtml(block.sourcePreview)}</p>`,
    trayActionState === 'idle'
      ? ''
      : `<p class="ann-memory-candidate-block__state" data-action-state="${escapeAttribute(trayActionState)}">${escapeHtml(renderUiActionStateLabel(trayActionState))}</p>`,
    `<div class="ann-inline-actions" data-action-group="memory_candidate">${controls}</div>`,
    '</section>',
  ].join('');
}

function renderBlockEditorControls(block: NoteBlockViewModel): string {
  const buttons = block.editor.actions
    .map((action) => renderInlineActionButton(action, renderBlockEditorActionLabel(action, block), block.id, 'block_editor'))
    .join('');

  return `<div class="ann-block-controls" data-action-group="block_editor">${buttons}</div>`;
}

function renderBlockEditorStatus(block: NoteBlockViewModel): string {
  const retryAttrs = block.editor.retryAction === undefined
    ? ' data-retry-available="false"'
    : ` data-retry-available="true" data-retry-action="${escapeAttribute(block.editor.retryAction)}"`;

  return [
    `<div class="ann-block-status" data-editor-status-region="fixed" data-editor-layout-stability="status-reserved" data-editor-save-status="${escapeAttribute(block.editor.saveStatus)}"${retryAttrs} aria-live="polite" aria-atomic="true">`,
    `<span data-editor-status-message="true">${escapeHtml(block.editor.statusMessage)}</span>`,
    '</div>',
  ].join('');
}

export function renderInlineActionButton(
  action: string,
  label: string,
  blockId: string,
  target: NoteSurfaceHtmlRenderTarget,
  actionState: 'idle' | 'pending' | 'failed' = 'idle',
): string {
  const disabled = actionState === 'pending' ? ' disabled' : '';
  return `<button type="button" data-action="${escapeAttribute(action)}" data-target="${escapeAttribute(target)}" data-block-id="${escapeAttribute(blockId)}" data-action-state="${escapeAttribute(actionState)}"${disabled}>${escapeHtml(label)}</button>`;
}

export function renderReturnLayerActionButton(
  action: 'defer_return_layer' | 'close_return_layer',
  label: string,
  noteId: string,
  actionState: 'idle' | 'pending' | 'failed',
  primary: boolean,
): string {
  const className = primary ? 'ann-text-button ann-return-layer__primary' : 'ann-text-button';
  const disabled = actionState === 'pending' ? ' disabled' : '';
  return `<button type="button" class="${className}" data-action="${escapeAttribute(action)}" data-target="return_layer" data-note-id="${escapeAttribute(noteId)}" data-action-state="${escapeAttribute(actionState)}"${disabled}>${escapeHtml(label)}</button>`;
}

export function renderUiActionStateLabel(actionState: 'idle' | 'pending' | 'failed'): string {
  switch (actionState) {
    case 'idle':
      return '';
    case 'pending':
      return '処理中';
    case 'failed':
      return '失敗しました';
  }
}

function resolveMemoryBlockActionState(
  actionStates: Partial<Record<string, 'idle' | 'pending' | 'failed'>>,
): 'idle' | 'pending' | 'failed' {
  const values = Object.values(actionStates);
  if (values.some((state) => state === 'failed')) {
    return 'failed';
  }

  if (values.some((state) => state === 'pending')) {
    return 'pending';
  }

  return 'idle';
}

export function renderProvenancePopover(model: NoteSurfaceViewModel): string {
  const popover = model.noteSurface.provenancePopover;
  if (!popover.open) {
    return '<aside class="ann-provenance-popover" data-component="provenance-popover" data-open="false"></aside>';
  }

  const source = popover.source;
  const sourceAttrs = source === undefined
    ? ''
    : [
        source.blockId === undefined ? '' : ` data-source-block-id="${escapeAttribute(source.blockId)}"`,
        source.noteId === undefined ? '' : ` data-source-note-id="${escapeAttribute(source.noteId)}"`,
        source.unitId === undefined ? '' : ` data-source-unit-id="${escapeAttribute(source.unitId)}"`,
        source.startOffset === undefined ? '' : ` data-source-start-offset="${source.startOffset}"`,
        source.endOffset === undefined ? '' : ` data-source-end-offset="${source.endOffset}"`,
      ].join('');

  return [
    `<aside class="ann-provenance-popover" data-component="provenance-popover" data-open="true"${sourceAttrs} role="dialog" aria-label="Source provenance">`,
    '<header>',
    '<h2>出典の確認</h2>',
    '<button type="button" data-action="close_provenance" data-target="provenance_popover">閉じる</button>',
    '</header>',
    source?.title === undefined ? '' : `<p data-source-title="true">${escapeHtml(source.title)}</p>`,
    popover.reason === undefined ? '' : `<p data-provenance-reason="true">${escapeHtml(popover.reason)}</p>`,
    popover.boundedExcerpt === undefined ? '' : `<blockquote>${escapeHtml(popover.boundedExcerpt)}</blockquote>`,
    '</aside>',
  ].join('');
}
