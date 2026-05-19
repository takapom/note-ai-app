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
  apiBaseUrl?: string | URL;
  workspaceId?: string;
  userId?: string;
  noteId?: string;
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
    apiBaseUrl: validation.resolvedOptions.apiBaseUrl,
    workspaceId: validation.resolvedOptions.workspaceId,
    noteId: validation.resolvedOptions.noteId,
    ...(validation.resolvedOptions.userId === undefined ? {} : { userId: validation.resolvedOptions.userId }),
    ...(validation.resolvedOptions.viewState === undefined ? {} : { viewState: validation.resolvedOptions.viewState }),
    ...(validation.resolvedOptions.projectionMaps === undefined
      ? {}
      : { projectionMaps: validation.resolvedOptions.projectionMaps }),
  };

  return createNoteSurfaceHttpDigestProductApp(appOptions).mount();
}

function validateBrowserMountOptions(
  options: BrowserNoteSurfaceMountOptions,
):
  | {
      ok: true;
      root: unknown;
      fetchLike: NoteSurfaceApiFetchLike;
      resolvedOptions: ResolvedBrowserNoteSurfaceMountOptions;
    }
  | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const documentLike = resolveDocumentLike(options.documentLike, errors);
  const root = resolveRoot(documentLike, options.rootSelector, errors);
  const fetchLike = resolveFetchLike(options.fetchLike, errors);
  const datasetOptions = resolveDatasetOptions(root, errors);
  const resolvedOptions = resolveMountOptions(options, datasetOptions);

  validateRequiredString('workspaceId', resolvedOptions.workspaceId, errors);
  validateRequiredString('noteId', resolvedOptions.noteId, errors);
  if (resolvedOptions.userId !== undefined) {
    validateRequiredString('userId', resolvedOptions.userId, errors);
  }
  validateApiBaseUrlShape(resolvedOptions.apiBaseUrl, errors);

  if (errors.length > 0 || root === undefined || fetchLike === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    root,
    fetchLike,
    resolvedOptions: resolvedOptions as ResolvedBrowserNoteSurfaceMountOptions,
  };
}

interface ResolvedBrowserNoteSurfaceMountOptions {
  apiBaseUrl: string | URL;
  workspaceId: string;
  userId?: string;
  noteId: string;
  viewState?: NoteSurfaceProductViewState;
  projectionMaps?: NoteSurfaceProductProjectionMaps;
}

interface CandidateBrowserNoteSurfaceMountOptions {
  apiBaseUrl?: string | URL | undefined;
  workspaceId?: string | undefined;
  userId?: string | undefined;
  noteId?: string | undefined;
  viewState?: NoteSurfaceProductViewState;
  projectionMaps?: NoteSurfaceProductProjectionMaps;
}

interface DatasetBrowserNoteSurfaceMountOptions {
  apiBaseUrl?: string;
  workspaceId?: string;
  userId?: string;
  noteId?: string;
  viewState?: NoteSurfaceProductViewState;
  projectionMaps?: NoteSurfaceProductProjectionMaps;
}

function resolveMountOptions(
  options: BrowserNoteSurfaceMountOptions,
  datasetOptions: DatasetBrowserNoteSurfaceMountOptions,
): CandidateBrowserNoteSurfaceMountOptions {
  const datasetViewState = datasetOptions.viewState ?? {};
  const explicitViewState = options.viewState ?? {};
  const viewState = hasOwnProperties(datasetViewState) || hasOwnProperties(explicitViewState)
    ? {
        ...datasetViewState,
        ...explicitViewState,
      }
    : undefined;

  return {
    apiBaseUrl: options.apiBaseUrl ?? datasetOptions.apiBaseUrl,
    workspaceId: options.workspaceId ?? datasetOptions.workspaceId,
    noteId: options.noteId ?? datasetOptions.noteId,
    ...(options.userId !== undefined || datasetOptions.userId !== undefined
      ? { userId: options.userId ?? datasetOptions.userId }
      : {}),
    ...(viewState === undefined ? {} : { viewState }),
    ...(options.projectionMaps !== undefined
      ? { projectionMaps: options.projectionMaps }
      : datasetOptions.projectionMaps === undefined
        ? {}
        : { projectionMaps: datasetOptions.projectionMaps }),
  };
}

function resolveDatasetOptions(root: unknown | undefined, errors: string[]): DatasetBrowserNoteSurfaceMountOptions {
  if (root === undefined || !hasDataset(root)) {
    return {};
  }

  const dataset = root.dataset;
  const viewState: NoteSurfaceProductViewState = {};
  const viewStateJson = parseOptionalDatasetObject('viewStateJson', dataset.viewStateJson, errors);
  if (viewStateJson !== undefined) {
    Object.assign(viewState, viewStateJson);
  }

  if (dataset.workspaceName !== undefined) {
    viewState.workspaceName = dataset.workspaceName;
  }

  const expandedDigest = parseOptionalDatasetBoolean('expandedDigest', dataset.expandedDigest, errors);
  if (expandedDigest !== undefined) {
    viewState.expandedDigest = expandedDigest;
  }

  const projectionMaps = parseOptionalDatasetObject('projectionMapsJson', dataset.projectionMapsJson, errors);

  return {
    ...(dataset.apiBaseUrl === undefined ? {} : { apiBaseUrl: dataset.apiBaseUrl }),
    ...(dataset.workspaceId === undefined ? {} : { workspaceId: dataset.workspaceId }),
    ...(dataset.userId === undefined ? {} : { userId: dataset.userId }),
    ...(dataset.noteId === undefined ? {} : { noteId: dataset.noteId }),
    ...(hasOwnProperties(viewState) ? { viewState } : {}),
    ...(projectionMaps === undefined
      ? {}
      : { projectionMaps: projectionMaps as unknown as NoteSurfaceProductProjectionMaps }),
  };
}

function hasDataset(root: unknown): root is { dataset: Record<string, string | undefined> } {
  return typeof root === 'object' && root !== null && typeof (root as { dataset?: unknown }).dataset === 'object'
    && (root as { dataset?: unknown }).dataset !== null;
}

function parseOptionalDatasetObject(
  fieldName: string,
  value: string | undefined,
  errors: string[],
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (isPlainObject(parsed)) {
      return parsed;
    }
    errors.push(`${fieldName} must be a JSON object`);
    return undefined;
  } catch (error) {
    errors.push(`${fieldName} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function parseOptionalDatasetBoolean(fieldName: string, value: string | undefined, errors: string[]): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  errors.push(`${fieldName} must be "true" or "false"`);
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOwnProperties(value: object): boolean {
  return Object.keys(value).length > 0;
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

function validateApiBaseUrlShape(value: unknown, errors: string[]): void {
  if (value === undefined || value === null) {
    errors.push('apiBaseUrl is required');
    return;
  }

  if (typeof value === 'string' || value instanceof URL) {
    return;
  }

  errors.push('apiBaseUrl must be a string or URL');
}
