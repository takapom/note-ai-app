import type {
  AiAssistBlockActionIntent,
  BlockEditorAction,
  MemoryCandidateBlockActionIntent,
  NextOpenDigestSectionViewModel,
  NoteBlockViewModel,
  NoteSurfaceApiIntent,
  NoteSurfaceIntentEvent,
  NoteSurfaceViewModel,
} from './noteSurface.ts';
import type { NoteSurfaceApiIntentKind } from './noteSurfaceApiIntents.ts';

export type NoteSurfaceHtmlRenderTarget =
  | 'block_editor'
  | 'ai_assist_block'
  | 'memory_candidate_block'
  | 'next_open_digest'
  | 'provenance_popover';

export type NoteSurfaceHtmlAction =
  | BlockEditorAction
  | AiAssistBlockActionIntent['id']
  | MemoryCandidateBlockActionIntent['id']
  | 'expand_digest'
  | 'collapse_digest'
  | 'close_provenance';

export interface NoteSurfaceHtmlRenderEventDescriptor {
  action: NoteSurfaceHtmlAction;
  target: NoteSurfaceHtmlRenderTarget;
  label: string;
  dataAction: string;
  blockId?: string;
  noteId?: string;
  blockType?: NoteBlockViewModel['type'];
  digestSectionId?: NextOpenDigestSectionViewModel['id'];
  userIntent?: string;
  apiIntent: NoteSurfaceApiIntent | NoteSurfaceApiIntentKind | 'none';
  event?: NoteSurfaceIntentEvent;
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
  hiddenProfiling: false;
  automaticActiveMemory: false;
}

export interface NoteSurfaceHtmlRenderResult {
  html: string;
  events: readonly NoteSurfaceHtmlRenderEventDescriptor[];
}

export class NoteSurfaceHtmlRendererError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid note surface view model for HTML rendering: ${errors.join('; ')}`);
    this.name = 'NoteSurfaceHtmlRendererError';
    this.errors = errors;
  }
}

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function renderNoteSurfaceHtml(model: NoteSurfaceViewModel): NoteSurfaceHtmlRenderResult {
  const validationErrors = validateRenderableNoteSurface(model);
  if (validationErrors.length > 0) {
    throw new NoteSurfaceHtmlRendererError(validationErrors);
  }

  const events = createRenderEvents(model);
  const surface = model.noteSurface;
  const html = [
    `<div class="ann-app-shell" data-layout="${escapeAttribute(model.appShell.layout)}">`,
    renderSidebar(model),
    renderTopBar(model),
    `<main class="ann-note-surface" data-region="noteSurface" data-surface="single-note" data-note-id="${escapeAttribute(surface.noteHeader.noteId)}">`,
    renderNoteHeader(model),
    renderNextOpenDigest(model),
    renderBlockEditorSurface(model),
    renderProvenancePopover(model),
    '</main>',
    '</div>',
  ].join('');

  return { html, events };
}

export function validateRenderableNoteSurface(model: NoteSurfaceViewModel): readonly string[] {
  const errors: string[] = [];

  if (model.appShell.kind !== 'AppShell' || model.appShell.layout !== 'single_note_surface') {
    errors.push('renderer only supports the single note surface AppShell');
  }
  if (model.noteSurface.kind !== 'NoteSurface') {
    errors.push('renderer requires one NoteSurface body');
  }
  if (model.excludedSurfaces.persistentChatPanel !== false) {
    errors.push('chat-first side surface is outside the MVP note surface renderer');
  }
  if (model.excludedSurfaces.aiModeSwitcher !== false) {
    errors.push('AI mode toggle surface is outside the MVP note surface renderer');
  }
  if (model.excludedSurfaces.externalIntegrationsDashboard !== false) {
    errors.push('external integrations dashboard is outside the MVP note surface renderer');
  }
  if (model.noteSurface.blockEditor.emitsAiProviderCall !== false) {
    errors.push('block editor render controls must not emit AI calls');
  }
  if (model.noteSurface.nextOpenDigest.emitsAiProviderCall !== false) {
    errors.push('digest render controls must not emit AI calls');
  }
  if (model.noteSurface.provenancePopover.emitsAiProviderCall !== false) {
    errors.push('provenance render controls must not emit AI calls');
  }

  for (const block of model.noteSurface.blocks) {
    if (block.aiAssist !== undefined) {
      if (block.aiAssist.emitsAiProviderCall !== false) {
        errors.push(`AI assist block ${block.id} must not emit AI calls during render`);
      }
      if (block.aiAssist.mutatesUserAuthoredBlock !== false) {
        errors.push(`AI assist block ${block.id} must not directly mutate user-authored blocks`);
      }
      for (const action of block.aiAssist.actions) {
        if (action.emitsAiProviderCall !== false || action.mutatesUserAuthoredBlock !== false) {
          errors.push(`AI assist action ${action.id} on block ${block.id} is not render-safe`);
        }
      }
    }

    if (block.memoryCandidate !== undefined) {
      if (
        block.memoryCandidate.emitsAiProviderCall !== false
        || block.memoryCandidate.hiddenProfiling !== false
        || block.memoryCandidate.automaticActiveMemory !== false
      ) {
        errors.push(`memory candidate block ${block.id} must stay review-only during render`);
      }
      for (const action of block.memoryCandidate.actions) {
        if (
          action.emitsAiProviderCall !== false
          || action.hiddenProfiling !== false
          || action.automaticActiveMemory !== false
        ) {
          errors.push(`memory candidate action ${action.id} on block ${block.id} is not render-safe`);
        }
      }
    }
  }

  return errors;
}

function renderSidebar(model: NoteSurfaceViewModel): string {
  const items = model.sidebar.items.map((item) => (
    `<li><button type="button" data-action="open_sidebar_item" data-sidebar-item="${escapeAttribute(item.id)}" aria-pressed="${item.active}">${escapeHtml(item.label)}</button></li>`
  )).join('');

  return `<aside class="ann-sidebar" data-region="sidebar"><nav aria-label="Workspace"><ul>${items}</ul></nav></aside>`;
}

function renderTopBar(model: NoteSurfaceViewModel): string {
  return [
    '<header class="ann-top-bar" data-region="topBar">',
    `<div class="ann-workspace-name">${escapeHtml(model.topBar.workspaceName)}</div>`,
    `<div class="ann-ai-status" data-ai-status="${escapeAttribute(model.topBar.aiStatus)}">${escapeHtml(model.topBar.aiStatus)}</div>`,
    '</header>',
  ].join('');
}

function renderNoteHeader(model: NoteSurfaceViewModel): string {
  const header = model.noteSurface.noteHeader;

  return [
    '<header class="ann-note-header" data-component="note-header">',
    `<h1>${escapeHtml(header.title)}</h1>`,
    `<p data-note-description="effective">${escapeHtml(header.description.effective)}</p>`,
    '</header>',
  ].join('');
}

function renderNextOpenDigest(model: NoteSurfaceViewModel): string {
  const digest = model.noteSurface.nextOpenDigest;
  const toggleAction = digest.expanded ? 'collapse_digest' : 'expand_digest';
  const sections = digest.expanded
    ? digest.sections.map(renderDigestSection).join('')
    : '';
  const emptyState = digest.sections.length === 0
    ? `<p class="ann-digest-empty" data-empty-state="${escapeAttribute(digest.emptyState)}">${escapeHtml(renderDigestEmptyLabel(digest.emptyState))}</p>`
    : '';

  return [
    `<section class="ann-next-open-digest" data-component="next-open-digest" data-available="${digest.available}" data-expanded="${digest.expanded}">`,
    '<header>',
    '<h2>Next open digest</h2>',
    `<button type="button" data-action="${toggleAction}" data-target="next_open_digest" aria-expanded="${digest.expanded}">${escapeHtml(digest.expanded ? 'Collapse' : 'Expand')}</button>`,
    '</header>',
    emptyState,
    sections,
    '</section>',
  ].join('');
}

function renderDigestSection(section: NextOpenDigestSectionViewModel): string {
  const items = section.items.map((item) => {
    const sourceAttrs = item.source === undefined
      ? ''
      : [
          item.source.blockId === undefined ? '' : ` data-source-block-id="${escapeAttribute(item.source.blockId)}"`,
          item.source.noteId === undefined ? '' : ` data-source-note-id="${escapeAttribute(item.source.noteId)}"`,
        ].join('');

    return `<li data-digest-item-id="${escapeAttribute(item.id)}"${sourceAttrs}>${escapeHtml(item.text)}</li>`;
  }).join('');

  return [
    `<section class="ann-digest-section" data-digest-section-id="${escapeAttribute(section.id)}">`,
    `<h3>${escapeHtml(section.label)}</h3>`,
    `<ul>${items}</ul>`,
    '</section>',
  ].join('');
}

function renderBlockEditorSurface(model: NoteSurfaceViewModel): string {
  const blocks = model.noteSurface.blocks.map(renderBlock).join('');

  return [
    '<section class="ann-block-editor" data-component="block-editor" data-editor="block">',
    `<div class="ann-block-editor-toolbar" data-emits-ai-provider-call="${model.noteSurface.blockEditor.emitsAiProviderCall}">`,
    `<span>${escapeHtml('Block editor')}</span>`,
    '</div>',
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
  const controls = renderBlockEditorControls(block);

  return [
    `<article class="ann-block ann-block--${escapeAttribute(block.type)}" data-block-id="${escapeAttribute(block.id)}" data-block-type="${escapeAttribute(block.type)}" data-block-origin="${escapeAttribute(block.origin)}" data-position="${block.position}" data-editor-state="${escapeAttribute(block.editor.state)}">`,
    body,
    controls,
    '</article>',
  ].join('');
}

function renderUserBlockBody(block: NoteBlockViewModel): string {
  if (block.sectionBoundary !== undefined) {
    const level = block.sectionBoundary.level;
    const tag = `h${level}`;
    return [
      `<${tag} class="ann-block-text ann-heading" data-section-level="${level}" data-section-title="${escapeAttribute(block.sectionBoundary.title)}">`,
      escapeHtml(block.text),
      `</${tag}>`,
    ].join('');
  }

  return `<div class="ann-block-text" data-block-editor-content="true" role="textbox" aria-readonly="false" contenteditable="true">${escapeHtml(block.text)}</div>`;
}

function renderAiAssistBlock(block: NoteBlockViewModel): string {
  const aiAssist = block.aiAssist;
  if (aiAssist === undefined) {
    return '';
  }

  const controls = aiAssist.actions
    .map((action) => renderInlineActionButton(action.id, action.label, block.id, 'ai_assist_block'))
    .join('');

  return [
    `<section class="ann-ai-assist-block" data-inline-ai-block="true" data-ai-assist-kind="${escapeAttribute(aiAssist.kind)}">`,
    `<div class="ann-inline-label">${escapeHtml(aiAssist.label)}</div>`,
    `<div class="ann-block-text" role="textbox" aria-readonly="false" contenteditable="true">${escapeHtml(block.text)}</div>`,
    `<div class="ann-inline-actions" data-action-group="ai_assist">${controls}</div>`,
    '</section>',
  ].join('');
}

function renderMemoryCandidateBlock(block: NoteBlockViewModel): string {
  const memoryCandidate = block.memoryCandidate;
  if (memoryCandidate === undefined) {
    return '';
  }

  const controls = memoryCandidate.actions
    .map((action) => renderInlineActionButton(action.id, action.label, block.id, 'memory_candidate_block'))
    .join('');

  return [
    '<section class="ann-memory-candidate-block" data-inline-memory-candidate="true">',
    `<div class="ann-inline-label">${escapeHtml(memoryCandidate.label)}</div>`,
    `<div class="ann-block-text" role="textbox" aria-readonly="false" contenteditable="true">${escapeHtml(block.text)}</div>`,
    `<div class="ann-inline-actions" data-action-group="memory_candidate">${controls}</div>`,
    '</section>',
  ].join('');
}

function renderBlockEditorControls(block: NoteBlockViewModel): string {
  const buttons = block.editor.actions
    .map((action) => renderInlineActionButton(action, renderBlockEditorActionLabel(action), block.id, 'block_editor'))
    .join('');

  return `<div class="ann-block-controls" data-action-group="block_editor">${buttons}</div>`;
}

function renderInlineActionButton(
  action: string,
  label: string,
  blockId: string,
  target: NoteSurfaceHtmlRenderTarget,
): string {
  return `<button type="button" data-action="${escapeAttribute(action)}" data-target="${escapeAttribute(target)}" data-block-id="${escapeAttribute(blockId)}">${escapeHtml(label)}</button>`;
}

function renderProvenancePopover(model: NoteSurfaceViewModel): string {
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
    '<h2>Source</h2>',
    '<button type="button" data-action="close_provenance" data-target="provenance_popover">Close</button>',
    '</header>',
    source?.title === undefined ? '' : `<p data-source-title="true">${escapeHtml(source.title)}</p>`,
    popover.reason === undefined ? '' : `<p data-provenance-reason="true">${escapeHtml(popover.reason)}</p>`,
    popover.boundedExcerpt === undefined ? '' : `<blockquote>${escapeHtml(popover.boundedExcerpt)}</blockquote>`,
    '</aside>',
  ].join('');
}

function createRenderEvents(model: NoteSurfaceViewModel): readonly NoteSurfaceHtmlRenderEventDescriptor[] {
  const events: NoteSurfaceHtmlRenderEventDescriptor[] = [];

  events.push({
    action: model.noteSurface.nextOpenDigest.expanded ? 'collapse_digest' : 'expand_digest',
    target: 'next_open_digest',
    label: model.noteSurface.nextOpenDigest.expanded ? 'Collapse' : 'Expand',
    dataAction: model.noteSurface.nextOpenDigest.expanded ? 'collapse_digest' : 'expand_digest',
    noteId: model.noteSurface.noteHeader.noteId,
    apiIntent: 'none',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  });

  for (const block of model.noteSurface.blocks) {
    for (const action of block.editor.actions) {
      events.push({
        action,
        target: 'block_editor',
        label: renderBlockEditorActionLabel(action),
        dataAction: action,
        noteId: model.noteSurface.noteHeader.noteId,
        blockId: block.id,
        blockType: block.type,
        apiIntent: action === 'save_block' && block.origin === 'user' && block.sectionBoundary === undefined
          ? 'block.update'
          : 'none',
        emitsAiProviderCall: false,
        mutatesUserAuthoredBlock: false,
        hiddenProfiling: false,
        automaticActiveMemory: false,
      });
    }

    if (block.memoryCandidate !== undefined) {
      for (const action of block.memoryCandidate.actions) {
        events.push(createMemoryCandidateEvent(block, action));
      }
      continue;
    }

    if (block.aiAssist !== undefined) {
      for (const action of block.aiAssist.actions) {
        events.push(createAiAssistEvent(block, action));
      }
    }
  }

  if (model.noteSurface.provenancePopover.open) {
    events.push({
      action: 'close_provenance',
      target: 'provenance_popover',
      label: 'Close',
      dataAction: 'close_provenance',
      noteId: model.noteSurface.noteHeader.noteId,
      apiIntent: 'none',
      emitsAiProviderCall: false,
      mutatesUserAuthoredBlock: false,
      hiddenProfiling: false,
      automaticActiveMemory: false,
    });
  }

  return events;
}

function createAiAssistEvent(
  block: NoteBlockViewModel,
  action: AiAssistBlockActionIntent,
): NoteSurfaceHtmlRenderEventDescriptor {
  return {
    action: action.id,
    target: 'ai_assist_block',
    label: action.label,
    dataAction: action.id,
    blockId: block.id,
    blockType: block.type,
    userIntent: action.userIntent,
    apiIntent: action.apiIntent,
    ...(action.event === undefined ? {} : { event: action.event }),
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  };
}

function createMemoryCandidateEvent(
  block: NoteBlockViewModel,
  action: MemoryCandidateBlockActionIntent,
): NoteSurfaceHtmlRenderEventDescriptor {
  return {
    action: action.id,
    target: 'memory_candidate_block',
    label: action.label,
    dataAction: action.id,
    blockId: block.id,
    blockType: block.type,
    userIntent: action.userIntent,
    apiIntent: action.apiIntent,
    ...(action.event === undefined ? {} : { event: action.event }),
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  };
}

function renderBlockEditorActionLabel(action: BlockEditorAction): string {
  switch (action) {
    case 'edit_block':
      return 'Edit';
    case 'save_block':
      return 'Save';
    case 'cancel_edit':
      return 'Cancel';
  }
}

function renderDigestEmptyLabel(emptyState: NoteSurfaceViewModel['noteSurface']['nextOpenDigest']['emptyState']): string {
  switch (emptyState) {
    case 'unavailable':
      return 'Digest unavailable';
    case 'no_items':
      return 'No digest items';
    case 'has_items':
      return '';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character);
}

function escapeAttribute(value: string | number | boolean): string {
  return escapeHtml(String(value));
}
