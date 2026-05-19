import {
  createNoteSurfaceHttpProductProvider,
  type NoteSurfaceHttpProductProviderOptions,
} from './noteSurfaceHttpProductProvider.ts';
import { createNoteSurfaceApiTransport } from './noteSurfaceApiTransport.ts';
import type {
  NoteSurfaceProductProvider,
  NoteSurfaceProductStateInput,
} from './noteSurfaceProductApp.ts';
import type { NextOpenDigestInput } from './noteSurface.ts';

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
    return unavailableDigest();
  }

  return readDigestProjection(result.body) ?? unavailableDigest();
}

function createHeaders(options: NoteSurfaceHttpDigestProductProviderOptions): Record<string, string> {
  return {
    'X-Workspace-Id': options.workspaceId,
    ...(options.userId === undefined ? {} : { 'X-User-Id': options.userId }),
  };
}

function readDigestProjection(body: unknown): NextOpenDigestInput | undefined {
  if (!isPlainObject(body)) {
    return undefined;
  }

  const candidate = isPlainObject(body.result) ? body.result : body;
  if (typeof candidate.available !== 'boolean') {
    return undefined;
  }

  return {
    available: candidate.available,
    ...copyDigestArray(candidate, 'unresolvedQuestions'),
    ...copyDigestArray(candidate, 'decisions'),
    ...copyDigestArray(candidate, 'relatedNotes'),
    ...copyDigestArray(candidate, 'memoryCandidates'),
  };
}

function copyDigestArray(
  digest: Record<string, unknown>,
  fieldName: 'unresolvedQuestions' | 'decisions' | 'relatedNotes' | 'memoryCandidates',
): Partial<NextOpenDigestInput> {
  const value = digest[fieldName];
  return Array.isArray(value) ? { [fieldName]: value } : {};
}

function unavailableDigest(): NextOpenDigestInput {
  return { available: false };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
