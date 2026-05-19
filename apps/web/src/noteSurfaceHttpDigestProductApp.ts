import {
  createNoteSurfaceHttpDigestProductProvider,
  type NoteSurfaceHttpDigestProductProviderOptions,
} from './noteSurfaceHttpDigestProductProvider.ts';
import {
  createNoteSurfaceProductApp,
  type NoteSurfaceProductApp,
} from './noteSurfaceProductApp.ts';

export interface NoteSurfaceHttpDigestProductAppOptions extends NoteSurfaceHttpDigestProductProviderOptions {
  root: unknown;
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

  return createNoteSurfaceProductApp({
    productProvider,
    root: options.root,
    apiBaseUrl: options.apiBaseUrl,
    fetchLike: options.fetchLike,
    workspaceId: options.workspaceId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
  });
}
