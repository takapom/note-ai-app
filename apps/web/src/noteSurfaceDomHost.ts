import { createNoteSurfaceDomHost as createNoteSurfaceDomHostImpl } from './runtime/dom/domHost.ts';
import type { NoteSurfaceBrowserRuntimeHost } from './noteSurfaceBrowserRuntime.ts';
import type { NoteSurfaceDomHostRoot as RuntimeNoteSurfaceDomHostRoot } from './runtime/dom/domHostTypes.ts';

interface NoteSurfaceDomHostRoot extends RuntimeNoteSurfaceDomHostRoot {
  innerHTML: RuntimeNoteSurfaceDomHostRoot['innerHTML'];
  closest?: (selector: string) => unknown;
  addEventListener: RuntimeNoteSurfaceDomHostRoot['addEventListener'];
  removeEventListener: RuntimeNoteSurfaceDomHostRoot['removeEventListener'];
}

export function createNoteSurfaceDomHost(root: NoteSurfaceDomHostRoot): NoteSurfaceBrowserRuntimeHost {
  return createNoteSurfaceDomHostImpl(root);
}
