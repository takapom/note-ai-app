import type { NoteSurfaceViewModel } from '../../noteSurface.ts';
import type { NoteSurfaceEventControllerResult } from '../../noteSurfaceEventController.ts';
import type { NoteSurfaceHtmlRenderResult } from '../../noteSurfaceHtmlRenderer.ts';
import { toBoundaryErrors } from './browserRuntimeErrors.ts';
import type {
  NoteSurfaceBrowserRuntimeActionHandler,
  NoteSurfaceBrowserRuntimeActionResult,
  NoteSurfaceBrowserRuntimeHost,
  NoteSurfaceBrowserRuntimeMountResult,
  NoteSurfaceBrowserRuntimeRenderer,
} from './browserRuntimeTypes.ts';

type BrowserRuntimeRenderCycleInput = {
  model: NoteSurfaceViewModel;
  render: NoteSurfaceBrowserRuntimeRenderer;
  host: NoteSurfaceBrowserRuntimeHost;
  handleAction: NoteSurfaceBrowserRuntimeActionHandler;
};

type BrowserRuntimeRenderResult =
  | { ok: true; rendered: NoteSurfaceHtmlRenderResult }
  | { ok: false; errors: readonly string[] };

type BrowserRuntimeHostCommitResult =
  | { ok: true }
  | { ok: false; errors: readonly string[] };

export async function renderBrowserRuntimeModel(
  input: BrowserRuntimeRenderCycleInput & {
    controllerResult?: NoteSurfaceEventControllerResult;
  },
): Promise<NoteSurfaceBrowserRuntimeActionResult> {
  const renderResult = renderModel(input.model, input.render);
  if (!renderResult.ok) {
    return {
      ok: false,
      status: 'render_error',
      errors: renderResult.errors,
    };
  }

  const commitResult = await commitBrowserRuntimeRender(
    input.host,
    renderResult.rendered,
    input.handleAction,
  );
  if (!commitResult.ok) {
    return {
      ok: false,
      status: 'host_error',
      errors: commitResult.errors,
    };
  }

  return {
    ok: true,
    status: 'handled',
    ...(input.controllerResult === undefined ? {} : { controllerResult: input.controllerResult }),
    errors: [],
  };
}

export async function mountBrowserRuntimeModel(
  input: BrowserRuntimeRenderCycleInput,
): Promise<NoteSurfaceBrowserRuntimeMountResult> {
  const renderResult = renderModel(input.model, input.render);
  if (!renderResult.ok) {
    return {
      ok: false,
      status: 'render_error',
      errors: renderResult.errors,
    };
  }

  const commitResult = await commitBrowserRuntimeRender(
    input.host,
    renderResult.rendered,
    input.handleAction,
  );
  if (!commitResult.ok) {
    return {
      ok: false,
      status: 'host_error',
      errors: commitResult.errors,
    };
  }

  return {
    ok: true,
    status: 'mounted',
    html: renderResult.rendered.html,
    events: renderResult.rendered.events,
    errors: [],
  };
}

function renderModel(
  model: NoteSurfaceViewModel,
  render: NoteSurfaceBrowserRuntimeRenderer,
): BrowserRuntimeRenderResult {
  try {
    return {
      ok: true,
      rendered: render(model),
    };
  } catch (error) {
    return {
      ok: false,
      errors: toBoundaryErrors(error),
    };
  }
}

async function commitBrowserRuntimeRender(
  host: NoteSurfaceBrowserRuntimeHost,
  rendered: NoteSurfaceHtmlRenderResult,
  handleAction: NoteSurfaceBrowserRuntimeActionHandler,
): Promise<BrowserRuntimeHostCommitResult> {
  try {
    await host.setHtml(rendered.html);
    await host.bindActionEvents(rendered.events, handleAction);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errors: toBoundaryErrors(error),
    };
  }
}
