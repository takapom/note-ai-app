import {
  createNoteSurfaceHttpDigestProductApp,
  type NoteSurfaceHttpDigestProductAppOptions,
} from './noteSurfaceHttpDigestProductApp.ts';
import type { NoteSurfaceApiFetchLike } from './noteSurfaceApiTransport.ts';
import type {
  NoteSurfaceProductAppMountResult,
} from './noteSurfaceProductApp.ts';
import type {
  NoteSurfaceProductProjectionMaps,
  NoteSurfaceProductViewState,
} from './noteSurfaceProductState.ts';

export interface BrowserNoteSurfaceDocumentLike {
  querySelector(selector: string): unknown;
}

export interface BrowserNoteSurfaceMountOptions {
  documentLike?: BrowserNoteSurfaceDocumentLike;
  fetchLike?: NoteSurfaceApiFetchLike;
  rootSelector: string;
  apiBaseUrl: string | URL;
  workspaceId: string;
  userId?: string;
  noteId: string;
  viewState?: NoteSurfaceProductViewState;
  projectionMaps?: NoteSurfaceProductProjectionMaps;
}

export type BrowserNoteSurfaceMountResult =
  | NoteSurfaceProductAppMountResult
  | {
      ok: false;
      status: 'invalid_browser_mount';
      errors: readonly string[];
    };

export async function mountBrowserNoteSurface(
  options: BrowserNoteSurfaceMountOptions,
): Promise<BrowserNoteSurfaceMountResult> {
  const validation = validateBrowserMountOptions(options);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'invalid_browser_mount',
      errors: validation.errors,
    };
  }

  const appOptions: NoteSurfaceHttpDigestProductAppOptions = {
    root: validation.root,
    fetchLike: validation.fetchLike,
    apiBaseUrl: options.apiBaseUrl,
    workspaceId: options.workspaceId,
    noteId: options.noteId,
    ...(options.userId === undefined ? {} : { userId: options.userId }),
    ...(options.viewState === undefined ? {} : { viewState: options.viewState }),
    ...(options.projectionMaps === undefined ? {} : { projectionMaps: options.projectionMaps }),
  };

  return createNoteSurfaceHttpDigestProductApp(appOptions).mount();
}

function validateBrowserMountOptions(
  options: BrowserNoteSurfaceMountOptions,
): { ok: true; root: unknown; fetchLike: NoteSurfaceApiFetchLike } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const documentLike = resolveDocumentLike(options.documentLike, errors);
  const root = resolveRoot(documentLike, options.rootSelector, errors);
  const fetchLike = resolveFetchLike(options.fetchLike, errors);

  validateRequiredString('workspaceId', options.workspaceId, errors);
  validateRequiredString('noteId', options.noteId, errors);
  if (options.userId !== undefined) {
    validateRequiredString('userId', options.userId, errors);
  }
  validateApiBaseUrlShape(options.apiBaseUrl, errors);

  if (errors.length > 0 || root === undefined || fetchLike === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, root, fetchLike };
}

function resolveDocumentLike(
  documentLike: BrowserNoteSurfaceDocumentLike | undefined,
  errors: string[],
): BrowserNoteSurfaceDocumentLike | undefined {
  const resolved = documentLike ?? readGlobalDocumentLike();
  if (resolved === undefined) {
    errors.push('documentLike is required when global document is unavailable');
    return undefined;
  }

  if (typeof resolved.querySelector !== 'function') {
    errors.push('documentLike must expose querySelector');
    return undefined;
  }

  return resolved;
}

function resolveRoot(
  documentLike: BrowserNoteSurfaceDocumentLike | undefined,
  rootSelector: string,
  errors: string[],
): unknown | undefined {
  if (typeof rootSelector !== 'string' || rootSelector.trim() === '') {
    errors.push('rootSelector is required');
    return undefined;
  }

  if (documentLike === undefined) {
    return undefined;
  }

  try {
    const root = documentLike.querySelector(rootSelector);
    if (root === null || root === undefined) {
      errors.push(`rootSelector did not match an element: ${rootSelector}`);
      return undefined;
    }
    return root;
  } catch (error) {
    errors.push(`rootSelector is invalid: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function resolveFetchLike(
  fetchLike: NoteSurfaceApiFetchLike | undefined,
  errors: string[],
): NoteSurfaceApiFetchLike | undefined {
  if (fetchLike !== undefined) {
    if (typeof fetchLike !== 'function') {
      errors.push('fetchLike must be a function');
      return undefined;
    }
    return fetchLike;
  }

  const globalFetch = readGlobalFetchLike();
  if (globalFetch === undefined) {
    errors.push('fetchLike is required when global fetch is unavailable');
    return undefined;
  }

  return globalFetch;
}

function readGlobalDocumentLike(): BrowserNoteSurfaceDocumentLike | undefined {
  const candidate = globalThis as {
    document?: {
      querySelector?: unknown;
    };
  };

  const querySelector = candidate.document?.querySelector;
  if (typeof querySelector !== 'function') {
    return undefined;
  }

  return {
    querySelector(selector: string): unknown {
      return querySelector.call(candidate.document, selector);
    },
  };
}

function readGlobalFetchLike(): NoteSurfaceApiFetchLike | undefined {
  const candidate = globalThis as {
    fetch?: unknown;
  };

  const fetch = candidate.fetch;
  if (typeof fetch !== 'function') {
    return undefined;
  }

  return (url, init) => fetch.call(globalThis, url, init) as ReturnType<NoteSurfaceApiFetchLike>;
}

function validateRequiredString(fieldName: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${fieldName} is required`);
  }
}

function validateApiBaseUrlShape(value: string | URL, errors: string[]): void {
  if (typeof value === 'string' || value instanceof URL) {
    return;
  }

  errors.push('apiBaseUrl must be a string or URL');
}
