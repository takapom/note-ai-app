import {
  type NoteSurfaceViewModel,
} from '../../noteSurface.ts';
import type {
  NoteSurfaceHtmlRenderEventDescriptor,
  NoteSurfaceHtmlRenderResult,
} from '../../noteSurfaceHtmlRenderer.ts';
import type {
  NoteSurfaceEventController,
  NoteSurfaceEventControllerResult,
} from '../../noteSurfaceEventController.ts';
import type {
  BrowserRuntimeProjectionMaps,
  NoteSurfaceDocumentInput,
} from './actions/browserRuntimeActionTypes.ts';

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
  onOpenDocumentProjection?(projection: {
    document: NoteSurfaceDocumentInput;
    projectionMaps?: BrowserRuntimeProjectionMaps;
  }): void;
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
