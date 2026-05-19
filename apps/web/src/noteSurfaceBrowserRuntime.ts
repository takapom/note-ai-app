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

export function createNoteSurfaceBrowserRuntime(
  options: NoteSurfaceBrowserRuntimeOptions,
): NoteSurfaceBrowserRuntime {
  const render = options.render ?? renderNoteSurfaceHtml;
  let currentModel = options.model;

  async function handleAction(
    eventDescriptor: unknown,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    const localAction = resolveLocalProjectionAction(eventDescriptor);
    if (localAction !== undefined) {
      currentModel = applyLocalProjectionAction(currentModel, localAction);
      return renderCurrentModel();
    }

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

  async function renderCurrentModel(): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    let rendered: NoteSurfaceHtmlRenderResult;
    try {
      rendered = render(currentModel);
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
      status: 'handled',
      errors: [],
    };
  }

  return {
    async mount(): Promise<NoteSurfaceBrowserRuntimeMountResult> {
      let rendered: NoteSurfaceHtmlRenderResult;
      try {
        rendered = render(currentModel);
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

type LocalProjectionAction =
  | { action: 'expand_digest' | 'collapse_digest'; target: 'next_open_digest' }
  | { action: 'edit_block' | 'cancel_edit'; target: 'block_editor'; blockId: string }
  | { action: 'close_provenance'; target: 'provenance_popover' };

function resolveLocalProjectionAction(eventDescriptor: unknown): LocalProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent') ?? 'none';

  if (apiIntent !== 'none') {
    return undefined;
  }

  if (
    (action === 'expand_digest' || action === 'collapse_digest')
    && target === 'next_open_digest'
  ) {
    return { action, target };
  }

  if (
    (action === 'edit_block' || action === 'cancel_edit')
    && target === 'block_editor'
  ) {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    return blockId === undefined ? undefined : { action, target, blockId };
  }

  if (action === 'close_provenance' && target === 'provenance_popover') {
    return { action, target };
  }

  return undefined;
}

function applyLocalProjectionAction(
  model: NoteSurfaceViewModel,
  action: LocalProjectionAction,
): NoteSurfaceViewModel {
  switch (action.action) {
    case 'expand_digest':
    case 'collapse_digest':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          nextOpenDigest: {
            ...model.noteSurface.nextOpenDigest,
            expanded: action.action === 'expand_digest',
          },
        },
      };
    case 'edit_block':
    case 'cancel_edit':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => (
            block.id === action.blockId
              ? {
                  ...block,
                  editor: {
                    ...block.editor,
                    state: action.action === 'edit_block' ? 'editing' : 'idle',
                  },
                }
              : block
          )),
        },
      };
    case 'close_provenance':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          provenancePopover: {
            ...model.noteSurface.provenancePopover,
            open: false,
          },
        },
      };
  }
}

function readDescriptorString(
  source: Record<string, unknown>,
  dataset: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = source[field] ?? dataset?.[field];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
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
