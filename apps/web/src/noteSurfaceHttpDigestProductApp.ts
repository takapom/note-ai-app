import {
  createNoteSurfaceHttpDigestProductProvider,
  type NoteSurfaceHttpDigestProductProviderOptions,
} from './noteSurfaceHttpDigestProductProvider.ts';
import {
  createNoteSurfaceProductApp,
  type NoteSurfaceProductApp,
  type NoteSurfaceProductAppMountResult,
} from './noteSurfaceProductApp.ts';
import {
  registerNoteSurfacePageLeaveOnHide,
  type NoteSurfacePageLifecyclePort,
} from './noteSurfaceSessionLifecycle.ts';

export interface NoteSurfaceHttpDigestProductAppOptions extends NoteSurfaceHttpDigestProductProviderOptions {
  root: unknown;
  pageLifecycle?: NoteSurfacePageLifecyclePort;
}

export function createNoteSurfaceHttpDigestProductApp(
  options: NoteSurfaceHttpDigestProductAppOptions,
): NoteSurfaceProductApp {
  const productProvider = createNoteSurfaceHttpDigestProductProvider({
    apiBaseUrl: options.apiBaseUrl,
    fetchLike: options.fetchLike,
    workspaceId: options.workspaceId,
    noteId: options.noteId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
    ...(options.viewState === undefined ? {} : { viewState: options.viewState }),
    ...(options.projectionMaps === undefined ? {} : { projectionMaps: options.projectionMaps }),
  });

  const productApp = createNoteSurfaceProductApp({
    productProvider,
    root: options.root,
    apiBaseUrl: options.apiBaseUrl,
    fetchLike: options.fetchLike,
    workspaceId: options.workspaceId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
  });

  if (options.pageLifecycle === undefined) {
    return productApp;
  }

  return {
    async mount(): Promise<NoteSurfaceProductAppMountResult> {
      const result = await productApp.mount();
      if (result.ok) {
        registerNoteSurfacePageLeaveOnHide({
          apiBaseUrl: options.apiBaseUrl,
          fetchLike: options.fetchLike,
          workspaceId: options.workspaceId,
          noteId: options.noteId,
          ...(options.userId === undefined ? {} : { userId: options.userId }),
          lifecycle: options.pageLifecycle!,
        });
      }

      return result;
    },
  };
}
