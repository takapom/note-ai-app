export * from './note-surface/html/htmlRendererTypes.ts';
export * from './note-surface/html/htmlValidation.ts';
import { renderNoteSurfaceHtml as renderNoteSurfaceHtmlImpl } from './note-surface/html/htmlRenderer.ts';
import type { NoteSurfaceViewModel } from './noteSurface.ts';
import type { NoteSurfaceHtmlRenderResult } from './note-surface/html/htmlRendererTypes.ts';

export function renderNoteSurfaceHtml(model: NoteSurfaceViewModel): NoteSurfaceHtmlRenderResult {
  return renderNoteSurfaceHtmlImpl(model);
}
