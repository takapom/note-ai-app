import {
  createNoteSurfaceApiTransport,
  type NoteSurfaceApiFetchLike,
} from './noteSurfaceApiTransport.ts';
import type {
  NoteSurfaceProductProvider,
  NoteSurfaceProductStateInput,
} from './noteSurfaceProductApp.ts';
import type {
  NoteSurfaceProductProjectionMaps,
  NoteSurfaceProductViewState,
} from './noteSurfaceProductState.ts';

export interface NoteSurfaceHttpProductProviderOptions {
  apiBaseUrl: string | URL;
  fetchLike: NoteSurfaceApiFetchLike;
  workspaceId: string;
  userId?: string;
  noteId: string;
  viewState?: NoteSurfaceProductViewState;
  projectionMaps?: NoteSurfaceProductProjectionMaps;
}

export class NoteSurfaceHttpProductProviderError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(errors.join('\n'));
    this.name = 'NoteSurfaceHttpProductProviderError';
    this.errors = errors;
  }
}

export function createNoteSurfaceHttpProductProvider(
  options: NoteSurfaceHttpProductProviderOptions,
): NoteSurfaceProductProvider {
  return {
    async loadInitialState(): Promise<NoteSurfaceProductStateInput> {
      const validationErrors = validateOptions(options);
      if (validationErrors.length > 0) {
        throw new NoteSurfaceHttpProductProviderError(validationErrors);
      }

      const transport = createNoteSurfaceApiTransport({
        baseUrl: options.apiBaseUrl,
        fetchLike: options.fetchLike,
      });
      const result = await transport.send({
        method: 'GET',
        path: `/notes/${options.noteId}`,
        headers: createHeaders(options),
      });

      if (!result.ok) {
        throw new NoteSurfaceHttpProductProviderError(
          result.errors.length > 0 ? result.errors : [`initial note snapshot request failed with status ${result.status}`],
        );
      }

      const document = readDocument(result.body);
      if (document === undefined) {
        throw new NoteSurfaceHttpProductProviderError(['initial note snapshot response must include document']);
      }

      const responseViewState = readOptionalSnapshotObject(result.body, 'viewState');
      const responseProjectionMaps = readOptionalSnapshotObject(result.body, 'projectionMaps');
      const snapshotErrors = [...responseViewState.errors, ...responseProjectionMaps.errors];
      if (snapshotErrors.length > 0) {
        throw new NoteSurfaceHttpProductProviderError(snapshotErrors);
      }

      return {
        document,
        ...(options.viewState === undefined && responseViewState.value === undefined
          ? {}
          : { viewState: options.viewState ?? (responseViewState.value as NoteSurfaceProductViewState) }),
        ...(options.projectionMaps === undefined && responseProjectionMaps.value === undefined
          ? {}
          : {
              projectionMaps:
                options.projectionMaps ?? (responseProjectionMaps.value as NoteSurfaceProductProjectionMaps),
            }),
      };
    },
  };
}

function validateOptions(options: NoteSurfaceHttpProductProviderOptions): readonly string[] {
  const errors: string[] = [];

  if (typeof options.fetchLike !== 'function') {
    errors.push('fetchLike must be a function');
  }

  validateRuntimeId('workspaceId', options.workspaceId, errors);
  if (options.userId !== undefined) {
    validateRuntimeId('userId', options.userId, errors);
  }
  validateRuntimeId('noteId', options.noteId, errors);

  return errors;
}

function validateRuntimeId(fieldName: string, value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${fieldName} is required`);
    return;
  }

  let hasRuntimeIdError = false;
  if (/\s/.test(value)) {
    errors.push(`${fieldName} must not include whitespace`);
    hasRuntimeIdError = true;
  }

  if (/[/?#\\]/.test(value)) {
    errors.push(`${fieldName} must be a single path segment`);
    hasRuntimeIdError = true;
  }

  if (!hasRuntimeIdError && !isStableRuntimeId(value)) {
    errors.push(`${fieldName} must be a stable non-sentinel runtime id`);
  }
}

function isStableRuntimeId(value: string): boolean {
  return (
    value.length > 0 &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(value)
  );
}

function createHeaders(options: NoteSurfaceHttpProductProviderOptions): Record<string, string> {
  return {
    'X-Workspace-Id': options.workspaceId,
    ...(options.userId === undefined ? {} : { 'X-User-Id': options.userId }),
  };
}

function readDocument(body: unknown): unknown | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }

  if (!Object.hasOwn(body, 'document')) {
    return undefined;
  }

  return (body as { document?: unknown }).document;
}

function readOptionalSnapshotObject(
  body: unknown,
  fieldName: 'viewState' | 'projectionMaps',
): { value: unknown | undefined; errors: readonly string[] } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { value: undefined, errors: [] };
  }

  if (!Object.hasOwn(body, fieldName)) {
    return { value: undefined, errors: [] };
  }

  const value = (body as Record<typeof fieldName, unknown>)[fieldName];
  if (!isPlainObject(value)) {
    return { value: undefined, errors: [`initial note snapshot response ${fieldName} must be a plain object`] };
  }

  return { value, errors: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
