import {
  createNoteSurfaceHttpProductProvider,
  type NoteSurfaceHttpProductProviderOptions,
} from './noteSurfaceHttpProductProvider.ts';
import {
  createNoteSurfaceProductApp,
  type NoteSurfaceProductApp,
} from './noteSurfaceProductApp.ts';

export interface NoteSurfaceHttpProductAppOptions extends NoteSurfaceHttpProductProviderOptions {
  root: unknown;
}

export function createNoteSurfaceHttpProductApp(
  options: NoteSurfaceHttpProductAppOptions,
): NoteSurfaceProductApp {
  const productProvider = createNoteSurfaceHttpProductProvider({
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
