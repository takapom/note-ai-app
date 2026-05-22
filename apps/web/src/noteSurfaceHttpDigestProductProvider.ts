import {
  createNoteSurfaceHttpProductProvider,
  type NoteSurfaceHttpProductProviderOptions,
} from './noteSurfaceHttpProductProvider.ts';
import { createNoteSurfaceApiTransport } from './noteSurfaceApiTransport.ts';
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
  const transport = createNoteSurfaceApiTransport({
    baseUrl: options.apiBaseUrl,
    fetchLike: options.fetchLike,
  });
  const result = await transport.send({
    method: 'GET',
    path: `/notes/${options.noteId}/digest`,
    headers: createHeaders(options),
  });

  if (!result.ok) {
    return failedDigest('transport_failed');
  }

  return parseNextOpenDigestInput(result.body) ?? failedDigest('invalid_body');
}

function createHeaders(options: NoteSurfaceHttpDigestProductProviderOptions): Record<string, string> {
  return {
    'X-Workspace-Id': options.workspaceId,
    ...(options.userId === undefined ? {} : { 'X-User-Id': options.userId }),
  };
}

function failedDigest(loadState: 'transport_failed' | 'invalid_body'): NextOpenDigestInput {
  return {
    available: false,
    loadState,
  };
}
