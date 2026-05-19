import {
  createNoteSurfaceAppBootstrap,
  type NoteSurfaceAppBootstrapMountResult,
  type NoteSurfaceAppBootstrapMountStatus,
} from './noteSurfaceAppBootstrap.ts';
import type { NoteSurfaceApiFetchLike } from './noteSurfaceApiTransport.ts';
import {
  createNoteSurfaceProductState,
  type CreateNoteSurfaceProductStateInput,
} from './noteSurfaceProductState.ts';

export type NoteSurfaceProductStateInput = CreateNoteSurfaceProductStateInput;

export interface NoteSurfaceProductProvider {
  loadInitialState(): NoteSurfaceProductStateInput | Promise<NoteSurfaceProductStateInput>;
}

export interface NoteSurfaceProductAppOptions {
  productProvider: NoteSurfaceProductProvider;
  root: unknown;
  apiBaseUrl: string | URL;
  fetchLike: NoteSurfaceApiFetchLike;
  workspaceId: string;
  userId?: string;
}

export type NoteSurfaceProductAppMountStatus =
  | 'provider_error'
  | 'invalid_product_state'
  | NoteSurfaceAppBootstrapMountStatus;

export type NoteSurfaceProductAppMountResult =
  | NoteSurfaceAppBootstrapMountResult
  | {
      ok: false;
      status: 'provider_error';
      errors: readonly string[];
    }
  | {
      ok: false;
      status: 'invalid_product_state';
      errors: readonly string[];
    };

export interface NoteSurfaceProductApp {
  mount(): Promise<NoteSurfaceProductAppMountResult>;
}

export function createNoteSurfaceProductApp(
  options: NoteSurfaceProductAppOptions,
): NoteSurfaceProductApp {
  return {
    async mount(): Promise<NoteSurfaceProductAppMountResult> {
      const loaded = await loadProductState(options.productProvider);
      if (!loaded.ok) {
        return loaded;
      }

      const productState = createNoteSurfaceProductState(loaded.input);
      if (!productState.ok) {
        return {
          ok: false,
          status: 'invalid_product_state',
          errors: productState.errors,
        };
      }

      return createNoteSurfaceAppBootstrap({
        document: productState.document,
        root: options.root,
        apiBaseUrl: options.apiBaseUrl,
        fetchLike: options.fetchLike,
        workspaceId: options.workspaceId,
        ...(options.userId === undefined ? {} : { userId: options.userId }),
        viewOptions: productState.viewOptions,
        resolverOptions: productState.resolverOptions,
      }).mount();
    },
  };
}

async function loadProductState(
  productProvider: NoteSurfaceProductProvider,
): Promise<
  | {
      ok: true;
      input: NoteSurfaceProductStateInput;
    }
  | {
      ok: false;
      status: 'provider_error';
      errors: readonly string[];
    }
> {
  try {
    return {
      ok: true,
      input: await productProvider.loadInitialState(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 'provider_error',
      errors: toBoundaryErrors(error),
    };
  }
}

function toBoundaryErrors(error: unknown): readonly string[] {
  if (error instanceof Error) {
    const structuredErrors = readStructuredErrors(error);
    return structuredErrors.length > 0 ? structuredErrors : [error.message];
  }

  return [String(error)];
}

function readStructuredErrors(error: Error): readonly string[] {
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((entry): entry is string => typeof entry === 'string');
}
