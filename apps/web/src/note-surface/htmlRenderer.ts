import type { NoteSurfaceViewModel } from '../noteSurface.ts';
import {
  type NoteSurfaceHtmlRenderResult,
  NoteSurfaceHtmlRendererError,
} from './htmlRendererTypes.ts';
import { renderBlockEditorSurface, renderNoteHeader, renderProvenancePopover } from './htmlBlockRenderer.ts';
import {
  renderCarriedContextTray,
  renderHiddenDigestState,
  renderReEntrySurface,
  renderReturnLayer,
  renderThinRail,
  renderWritingChrome,
} from './htmlChromeRenderer.ts';
import { createRenderEvents } from './htmlRenderEvents.ts';
import { escapeAttribute } from '../shared-ui/htmlEscape.ts';
import { validateRenderableNoteSurface } from './htmlValidation.ts';

export function renderNoteSurfaceHtml(model: NoteSurfaceViewModel): NoteSurfaceHtmlRenderResult {
  const validationErrors = validateRenderableNoteSurface(model);
  if (validationErrors.length > 0) {
    throw new NoteSurfaceHtmlRendererError(validationErrors);
  }

  const events = createRenderEvents(model);
  const surface = model.noteSurface;
  const quietWriting = model.quietWriting;
  const html = [
    `<div class="ann-app ann-app-shell ann-app--quiet-writing" data-layout="${escapeAttribute(model.appShell.layout)}">`,
    renderThinRail(quietWriting.thinRail),
    '<div class="ann-main" data-region="main">',
    renderWritingChrome(quietWriting.writingChrome, surface.noteHeader.noteId),
    `<main class="ann-note-surface" data-region="noteSurface" data-surface="single-note" data-note-id="${escapeAttribute(surface.noteHeader.noteId)}">`,
    renderNoteHeader(model),
    renderReEntrySurface(quietWriting.reEntrySurface, surface.noteHeader.noteId),
    renderReturnLayer(quietWriting.returnLayer, surface.noteHeader.noteId),
    renderBlockEditorSurface(model),
    renderProvenancePopover(model),
    '</main>',
    renderCarriedContextTray(quietWriting.carriedContextTray),
    '</div>',
    renderHiddenDigestState(surface.nextOpenDigest),
    '</div>',
  ].join('');

  return { html, events };
}
