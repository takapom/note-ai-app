import type {
  NoteSurfaceBrowserRuntimeActionHandler,
  NoteSurfaceBrowserRuntimeHost,
} from '../../noteSurfaceBrowserRuntime.ts';
import type { NoteSurfaceHtmlRenderEventDescriptor } from '../../noteSurfaceHtmlRenderer.ts';
import { createEventDescriptor, findActionElement, readClosestBlockId } from './domEventDescriptor.ts';
import { captureSelectionSnapshot, focusWritingSurface, restoreSelectionSnapshot } from './domSelection.ts';
import type { NoteSurfaceDomCompositionEvent, NoteSurfaceDomClickEvent, NoteSurfaceDomHostRoot } from './domHostTypes.ts';

export function createNoteSurfaceDomHost(root: NoteSurfaceDomHostRoot): NoteSurfaceBrowserRuntimeHost {
  let removePreviousClickListener: (() => void) | undefined;
  const composingBlockIds = new Set<string>();
  const pendingCompositionBlockIds = new Set<string>();

  const compositionStartListener = (event: NoteSurfaceDomCompositionEvent): void => {
    const blockId = readClosestBlockId(event.target);
    if (blockId === undefined) {
      return;
    }

    composingBlockIds.add(blockId);
    pendingCompositionBlockIds.delete(blockId);
  };
  const compositionEndListener = (event: NoteSurfaceDomCompositionEvent): void => {
    const blockId = readClosestBlockId(event.target);
    if (blockId === undefined) {
      return;
    }

    composingBlockIds.delete(blockId);
    pendingCompositionBlockIds.add(blockId);
  };
  const inputListener = (event: NoteSurfaceDomCompositionEvent): void => {
    const blockId = readClosestBlockId(event.target);
    if (blockId !== undefined) {
      pendingCompositionBlockIds.delete(blockId);
    }
  };

  root.addEventListener('compositionstart', compositionStartListener);
  root.addEventListener('compositionend', compositionEndListener);
  root.addEventListener('input', inputListener);

  return {
    setHtml(html: string): void {
      const selectionSnapshot = captureSelectionSnapshot(root);
      composingBlockIds.clear();
      pendingCompositionBlockIds.clear();
      root.innerHTML = html;
      restoreSelectionSnapshot(root, selectionSnapshot);
    },

    focusWritingBlock(blockId?: string): void {
      focusWritingSurface(root, blockId);
    },

    bindActionEvents(
      events: readonly NoteSurfaceHtmlRenderEventDescriptor[],
      handler: NoteSurfaceBrowserRuntimeActionHandler,
    ): void {
      removePreviousClickListener?.();

      const clickListener = (event: NoteSurfaceDomClickEvent): void => {
        const actionElement = findActionElement(event.target);
        if (actionElement === undefined) {
          return;
        }

        const descriptor = createEventDescriptor(actionElement, events, {
          composingBlockIds,
          pendingCompositionBlockIds,
        });
        void Promise.resolve(handler(descriptor)).catch(() => undefined);
      };

      root.addEventListener('click', clickListener);
      removePreviousClickListener = () => root.removeEventListener('click', clickListener);
    },
  };
}
