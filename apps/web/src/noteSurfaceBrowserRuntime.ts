export * from './runtime/browser/browserRuntimeTypes.ts';
import { createNoteSurfaceBrowserRuntime as createNoteSurfaceBrowserRuntimeImpl } from './runtime/browser/browserRuntime.ts';
import type {
  NoteSurfaceBrowserRuntime,
  NoteSurfaceBrowserRuntimeOptions,
} from './runtime/browser/browserRuntimeTypes.ts';

export function createNoteSurfaceBrowserRuntime(
  options: NoteSurfaceBrowserRuntimeOptions,
): NoteSurfaceBrowserRuntime {
  return createNoteSurfaceBrowserRuntimeImpl(options);
}
