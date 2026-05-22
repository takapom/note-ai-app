export * from './note-surface/htmlRendererTypes.ts';
export * from './note-surface/htmlValidation.ts';
import { renderNoteSurfaceHtml as renderNoteSurfaceHtmlImpl } from './note-surface/htmlRenderer.ts';
import type { NoteSurfaceViewModel } from './noteSurface.ts';
import type { NoteSurfaceHtmlRenderResult } from './note-surface/htmlRendererTypes.ts';

export function renderNoteSurfaceHtml(model: NoteSurfaceViewModel): NoteSurfaceHtmlRenderResult {
  return renderNoteSurfaceHtmlImpl(model);
}
