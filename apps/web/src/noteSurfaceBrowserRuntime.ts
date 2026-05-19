import type { NoteSurfaceViewModel } from './noteSurface.ts';
import {
  renderNoteSurfaceHtml,
  type NoteSurfaceHtmlRenderEventDescriptor,
  type NoteSurfaceHtmlRenderResult,
} from './noteSurfaceHtmlRenderer.ts';
import type {
  NoteSurfaceEventController,
  NoteSurfaceEventControllerResult,
} from './noteSurfaceEventController.ts';

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
  | 'controller_error';

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

export function createNoteSurfaceBrowserRuntime(
  options: NoteSurfaceBrowserRuntimeOptions,
): NoteSurfaceBrowserRuntime {
  const render = options.render ?? renderNoteSurfaceHtml;

  async function handleAction(
    eventDescriptor: unknown,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    try {
      const controllerResult = await options.eventController.handleRenderEvent(eventDescriptor);
      if (!controllerResult.ok) {
        return {
          ok: false,
          status: 'controller_error',
          controllerResult,
          errors: controllerResult.errors.length > 0
            ? controllerResult.errors
            : [`event controller returned ${controllerResult.status}`],
        };
      }

      return {
        ok: true,
        status: 'handled',
        controllerResult,
        errors: [],
      };
    } catch (error) {
      return {
        ok: false,
        status: 'controller_error',
        errors: toBoundaryErrors(error),
      };
    }
  }

  return {
    async mount(): Promise<NoteSurfaceBrowserRuntimeMountResult> {
      let rendered: NoteSurfaceHtmlRenderResult;
      try {
        rendered = render(options.model);
      } catch (error) {
        return {
          ok: false,
          status: 'render_error',
          errors: toBoundaryErrors(error),
        };
      }

      try {
        await options.host.setHtml(rendered.html);
        await options.host.bindActionEvents(rendered.events, handleAction);
      } catch (error) {
        return {
          ok: false,
          status: 'host_error',
          errors: toBoundaryErrors(error),
        };
      }

      return {
        ok: true,
        status: 'mounted',
        html: rendered.html,
        events: rendered.events,
        errors: [],
      };
    },
    handleAction,
  };
}

function toBoundaryErrors(error: unknown): readonly string[] {
  if (error instanceof Error) {
    const structuredErrors = readStructuredErrors(error);
    return structuredErrors.length > 0 ? structuredErrors : [error.message];
  }

  return [String(error)];
}

function readStructuredErrors(error: Error): readonly string[] {
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((entry): entry is string => typeof entry === 'string');
}
