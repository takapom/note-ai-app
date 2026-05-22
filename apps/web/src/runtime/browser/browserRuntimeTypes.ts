import {
  createNextOpenDigestViewModel,
  createProvenancePopoverViewModel,
  parseNextOpenDigestInput,
  refreshQuietWritingProjection,
  resolveContinueWritingFocusBlockId,
  withInlineBlockActionState,
  withReturnLayerOpen,
  type NextOpenDigestInput,
  type NoteSurfaceViewModel,
  type ProvenancePopoverInput,
} from '../../noteSurface.ts';
import {
  renderNoteSurfaceHtml,
  type NoteSurfaceHtmlRenderEventDescriptor,
  type NoteSurfaceHtmlRenderResult,
} from '../../noteSurfaceHtmlRenderer.ts';
import type {
  NoteSurfaceEventController,
  NoteSurfaceEventControllerResult,
} from '../../noteSurfaceEventController.ts';

export type NoteSurfaceBrowserRuntimeRenderer = (
  model: NoteSurfaceViewModel,
) => NoteSurfaceHtmlRenderResult;

export type NoteSurfaceBrowserRuntimeActionHandler = (
  eventDescriptor: unknown,
) => Promise<NoteSurfaceBrowserRuntimeActionResult>;

export interface NoteSurfaceBrowserRuntimeHost {
  setHtml(html: string): void | Promise<void>;
  bindActionEvents(
    events: readonly NoteSurfaceHtmlRenderEventDescriptor[],
    handler: NoteSurfaceBrowserRuntimeActionHandler,
  ): void | Promise<void>;
  focusWritingBlock?(blockId?: string): void;
}

export interface NoteSurfaceBrowserRuntimeOptions {
  model: NoteSurfaceViewModel;
  render?: NoteSurfaceBrowserRuntimeRenderer;
  eventController: NoteSurfaceEventController;
  host: NoteSurfaceBrowserRuntimeHost;
}

export type NoteSurfaceBrowserRuntimeMountStatus =
  | 'mounted'
  | 'render_error'
  | 'host_error';

export interface NoteSurfaceBrowserRuntimeMountResult {
  ok: boolean;
  status: NoteSurfaceBrowserRuntimeMountStatus;
  html?: string;
  events?: readonly NoteSurfaceHtmlRenderEventDescriptor[];
  errors: readonly string[];
}

export type NoteSurfaceBrowserRuntimeActionStatus =
  | 'handled'
  | 'controller_error'
  | 'render_error'
  | 'host_error';

export interface NoteSurfaceBrowserRuntimeActionResult {
  ok: boolean;
  status: NoteSurfaceBrowserRuntimeActionStatus;
  controllerResult?: NoteSurfaceEventControllerResult;
  errors: readonly string[];
}

export interface NoteSurfaceBrowserRuntime {
  mount(): Promise<NoteSurfaceBrowserRuntimeMountResult>;
  handleAction(eventDescriptor: unknown): Promise<NoteSurfaceBrowserRuntimeActionResult>;
}
