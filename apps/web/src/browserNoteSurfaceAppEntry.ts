import {
  mountBrowserNoteSurface,
  type BrowserNoteSurfaceMountOptions,
  type BrowserNoteSurfaceMountResult,
} from './browserNoteSurfaceMount.ts';

export const DEFAULT_BROWSER_NOTE_SURFACE_ROOT_SELECTOR = '[data-note-surface-root]';

export type BrowserNoteSurfaceAppEntryReadyState = 'loading' | 'interactive' | 'complete' | string;

export type BrowserNoteSurfaceAppEntryMount = (
  options: BrowserNoteSurfaceMountOptions,
) => BrowserNoteSurfaceMountResult | Promise<BrowserNoteSurfaceMountResult>;

export type BrowserNoteSurfaceAppEntryAddEventListener = (
  type: 'DOMContentLoaded',
  listener: () => void,
  options?: { once: true },
) => void;

export interface BrowserNoteSurfaceAppEntryRuntime {
  mount?: BrowserNoteSurfaceAppEntryMount;
  rootSelector?: string;
  documentReadyState: BrowserNoteSurfaceAppEntryReadyState | (() => BrowserNoteSurfaceAppEntryReadyState);
  addEventListener?: BrowserNoteSurfaceAppEntryAddEventListener;
}

export type BrowserNoteSurfaceAppEntryStartOptions =
  Omit<BrowserNoteSurfaceMountOptions, 'rootSelector'>
  & {
    rootSelector?: string;
  };

export type BrowserNoteSurfaceAppEntryStartResult =
  | BrowserNoteSurfaceMountResult
  | {
      ok: false;
      status: 'invalid_browser_app_entry_runtime';
      errors: readonly string[];
    }
  | {
      ok: false;
      status: 'browser_app_entry_mount_failed';
      errors: readonly string[];
    };

export interface BrowserNoteSurfaceAppEntry {
  start(options: BrowserNoteSurfaceAppEntryStartOptions): Promise<BrowserNoteSurfaceAppEntryStartResult>;
}

export function createBrowserNoteSurfaceAppEntry(
  runtime: BrowserNoteSurfaceAppEntryRuntime,
): BrowserNoteSurfaceAppEntry {
  const mount = runtime.mount ?? mountBrowserNoteSurface;
  const defaultRootSelector = runtime.rootSelector ?? DEFAULT_BROWSER_NOTE_SURFACE_ROOT_SELECTOR;

  return {
    async start(options: BrowserNoteSurfaceAppEntryStartOptions): Promise<BrowserNoteSurfaceAppEntryStartResult> {
      const ready = await waitForDocumentReady(runtime);
      if (!ready.ok) {
        return ready;
      }

      try {
        return await mount({
          ...options,
          rootSelector: options.rootSelector ?? defaultRootSelector,
        });
      } catch (error) {
        return {
          ok: false,
          status: 'browser_app_entry_mount_failed',
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    },
  };
}

export function startBrowserNoteSurfaceApp(
  runtime: BrowserNoteSurfaceAppEntryRuntime,
  options: BrowserNoteSurfaceAppEntryStartOptions,
): Promise<BrowserNoteSurfaceAppEntryStartResult> {
  return createBrowserNoteSurfaceAppEntry(runtime).start(options);
}

async function waitForDocumentReady(
  runtime: BrowserNoteSurfaceAppEntryRuntime,
): Promise<
  | { ok: true }
  | {
      ok: false;
      status: 'invalid_browser_app_entry_runtime';
      errors: readonly string[];
    }
> {
  const readyState = resolveReadyState(runtime.documentReadyState);
  if (readyState !== 'loading') {
    return { ok: true };
  }

  if (typeof runtime.addEventListener !== 'function') {
    return {
      ok: false,
      status: 'invalid_browser_app_entry_runtime',
      errors: ['addEventListener is required while documentReadyState is loading'],
    };
  }

  try {
    await new Promise<void>((resolve) => {
      runtime.addEventListener?.('DOMContentLoaded', resolve, { once: true });
    });
  } catch (error) {
    return {
      ok: false,
      status: 'invalid_browser_app_entry_runtime',
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  return { ok: true };
}

function resolveReadyState(
  documentReadyState: BrowserNoteSurfaceAppEntryRuntime['documentReadyState'],
): BrowserNoteSurfaceAppEntryReadyState {
  return typeof documentReadyState === 'function' ? documentReadyState() : documentReadyState;
}
