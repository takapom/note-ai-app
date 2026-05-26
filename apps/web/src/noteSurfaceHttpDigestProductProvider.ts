import {
  createNoteSurfaceHttpProductProvider,
  type NoteSurfaceHttpProductProviderOptions,
} from './noteSurfaceHttpProductProvider.ts';
import { createNoteSurfaceApiClient } from './runtime/api-client/noteSurfaceApiClient.ts';
import type {
  NoteSurfaceProductProvider,
  NoteSurfaceProductStateInput,
} from './noteSurfaceProductApp.ts';
import { parseNextOpenDigestInput, type NextOpenDigestInput } from './noteSurface.ts';

export type NoteSurfaceHttpDigestProductProviderOptions = NoteSurfaceHttpProductProviderOptions;

export function createNoteSurfaceHttpDigestProductProvider(
  options: NoteSurfaceHttpDigestProductProviderOptions,
): NoteSurfaceProductProvider {
  const baseProvider = createNoteSurfaceHttpProductProvider(options);

  return {
    async loadInitialState(): Promise<NoteSurfaceProductStateInput> {
      const baseSnapshot = await baseProvider.loadInitialState();
      if (baseSnapshot.viewState?.nextOpenDigest !== undefined) {
        return baseSnapshot;
      }

      const nextOpenDigest = await loadDigestProjection(options);
      return {
        ...baseSnapshot,
        viewState: {
          ...baseSnapshot.viewState,
          nextOpenDigest,
        },
      };
    },
  };
}

async function loadDigestProjection(
  options: NoteSurfaceHttpDigestProductProviderOptions,
): Promise<NextOpenDigestInput> {
  const apiClient = createNoteSurfaceApiClient({
    apiBaseUrl: options.apiBaseUrl,
    fetchLike: options.fetchLike,
    workspaceId: options.workspaceId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
  });
  const result = await apiClient.getDigest({ noteId: options.noteId });

  if (!result.ok) {
    return failedDigest('transport_failed');
  }

  return parseNextOpenDigestInput(result.body) ?? failedDigest('invalid_body');
}

function failedDigest(loadState: 'transport_failed' | 'invalid_body'): NextOpenDigestInput {
  return {
    available: false,
    loadState,
  };
}
