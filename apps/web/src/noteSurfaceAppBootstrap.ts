import type { NoteDocumentContract } from '../../../contexts/note-model/src/contract/noteContract.ts';
import {
  createNoteSurfaceViewModel,
  type CreateNoteSurfaceViewModelOptions,
  validateNoteSurfaceDocument,
} from './noteSurface.ts';
import {
  createNoteSurfaceActionInputResolver,
  type NoteSurfaceActionInputResolverOptions,
} from './noteSurfaceActionInputResolver.ts';
import {
  createNoteSurfaceApiTransport,
  type NoteSurfaceApiFetchLike,
} from './noteSurfaceApiTransport.ts';
import {
  createNoteSurfaceBrowserRuntime,
  type NoteSurfaceBrowserRuntime,
  type NoteSurfaceBrowserRuntimeMountResult,
  type NoteSurfaceBrowserRuntimeMountStatus,
} from './noteSurfaceBrowserRuntime.ts';
import { createNoteSurfaceDomHost } from './noteSurfaceDomHost.ts';
import { createNoteSurfaceEventController } from './noteSurfaceEventController.ts';

interface NoteSurfaceAppBootstrapDomClickEvent {
  target?: unknown;
}

interface NoteSurfaceAppBootstrapRoot {
  innerHTML: string;
  addEventListener(type: 'click', listener: (event: NoteSurfaceAppBootstrapDomClickEvent) => void): void;
  removeEventListener(type: 'click', listener: (event: NoteSurfaceAppBootstrapDomClickEvent) => void): void;
}

export interface NoteSurfaceAppBootstrapOptions {
  document: unknown;
  root: unknown;
  apiBaseUrl: string | URL;
  fetchLike: NoteSurfaceApiFetchLike;
  workspaceId: string;
  userId?: string;
  viewOptions?: CreateNoteSurfaceViewModelOptions;
  resolverOptions?: NoteSurfaceActionInputResolverOptions;
}

export type NoteSurfaceAppBootstrapMountStatus =
  | NoteSurfaceBrowserRuntimeMountStatus
  | 'invalid_options';

export type NoteSurfaceAppBootstrapMountResult =
  | (NoteSurfaceBrowserRuntimeMountResult & {
      status: Exclude<NoteSurfaceAppBootstrapMountStatus, 'invalid_options'>;
      runtime: NoteSurfaceBrowserRuntime;
    })
  | {
      ok: false;
      status: 'invalid_options';
      errors: readonly string[];
    };

export interface NoteSurfaceAppBootstrap {
  mount(): Promise<NoteSurfaceAppBootstrapMountResult>;
}

export function createNoteSurfaceAppBootstrap(
  options: NoteSurfaceAppBootstrapOptions,
): NoteSurfaceAppBootstrap {
  return {
    async mount(): Promise<NoteSurfaceAppBootstrapMountResult> {
      const validation = validateBootstrapOptions(options);
      if (!validation.ok) {
        return {
          ok: false,
          status: 'invalid_options',
          errors: validation.errors,
        };
      }

      const model = createNoteSurfaceViewModel(validation.document, options.viewOptions);
      const transport = createNoteSurfaceApiTransport({
        baseUrl: validation.apiBaseUrl,
        fetchLike: options.fetchLike,
      });
      const resolveActionInput = createNoteSurfaceActionInputResolver({
        activeNoteId: model.noteSurface.noteHeader.noteId,
        ...(options.resolverOptions ?? {}),
      });
      const eventController = createNoteSurfaceEventController({
        workspaceId: options.workspaceId,
        ...(options.userId === undefined ? {} : { userId: options.userId }),
        transport,
        resolveActionInput,
      });
      const host = createNoteSurfaceDomHost(validation.root);
      const runtime = createNoteSurfaceBrowserRuntime({
        model,
        eventController,
        host,
      });
      const mounted = await runtime.mount();

      return {
        ...mounted,
        runtime,
      };
    },
  };
}

function validateBootstrapOptions(
  options: NoteSurfaceAppBootstrapOptions,
): { ok: true; document: NoteDocumentContract; root: NoteSurfaceAppBootstrapRoot; apiBaseUrl: string | URL }
  | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const documentErrors = validateNoteSurfaceDocument(options.document);
  const root = validateRoot(options.root, errors);
  const apiBaseUrl = validateApiBaseUrl(options.apiBaseUrl, errors);

  errors.push(...documentErrors);
  if (!isStableRuntimeId(options.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (options.userId !== undefined && !isStableRuntimeId(options.userId)) {
    errors.push('userId must be a stable non-sentinel runtime id');
  }
  if (typeof options.fetchLike !== 'function') {
    errors.push('fetchLike must be a function');
  }

  if (errors.length > 0 || root === undefined || apiBaseUrl === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    document: options.document as NoteDocumentContract,
    root,
    apiBaseUrl,
  };
}

function validateRoot(
  root: unknown,
  errors: string[],
): NoteSurfaceAppBootstrapRoot | undefined {
  if (root === null || typeof root !== 'object') {
    errors.push('root must be a DOM host root object');
    return undefined;
  }

  const candidate = root as Partial<NoteSurfaceAppBootstrapRoot>;
  if (typeof candidate.innerHTML !== 'string') {
    errors.push('root must expose innerHTML');
  }
  if (typeof candidate.addEventListener !== 'function') {
    errors.push('root must expose addEventListener');
  }
  if (typeof candidate.removeEventListener !== 'function') {
    errors.push('root must expose removeEventListener');
  }

  return errors.length > 0 ? undefined : candidate as NoteSurfaceAppBootstrapRoot;
}

function validateApiBaseUrl(baseUrl: string | URL, errors: string[]): string | URL | undefined {
  let parsed: URL;
  try {
    parsed = baseUrl instanceof URL ? new URL(baseUrl.toString()) : new URL(baseUrl);
  } catch {
    errors.push('apiBaseUrl must be a valid URL');
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push('apiBaseUrl must use http or https');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    errors.push('apiBaseUrl must not include credentials');
  }

  return baseUrl;
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0
    && normalized === value
    && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)
    && !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}
