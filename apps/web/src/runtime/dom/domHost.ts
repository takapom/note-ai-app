import type {
  NoteSurfaceBrowserRuntimeActionHandler,
  NoteSurfaceDirtyBlockDraft,
  NoteSurfaceBrowserRuntimeHost,
} from '../../noteSurfaceBrowserRuntime.ts';
import type { NoteSurfaceHtmlRenderEventDescriptor } from '../../noteSurfaceHtmlRenderer.ts';
import { createEventDescriptor, findActionElement, readClosestBlockId, readDatasetString } from './domEventDescriptor.ts';
import { captureSelectionSnapshot, focusWritingSurface, restoreSelectionSnapshot } from './domSelection.ts';
import type {
  NoteSurfaceDomActionElement,
  NoteSurfaceDomCompositionEvent,
  NoteSurfaceDomClickEvent,
  NoteSurfaceDomHostRoot,
} from './domHostTypes.ts';

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

    readDirtyBlockDrafts(): readonly NoteSurfaceDirtyBlockDraft[] {
      return readDirtyBlockDrafts(root, {
        composingBlockIds,
        pendingCompositionBlockIds,
      });
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

function readDirtyBlockDrafts(
  root: NoteSurfaceDomHostRoot,
  composition: {
    composingBlockIds: ReadonlySet<string>;
    pendingCompositionBlockIds: ReadonlySet<string>;
  },
): readonly NoteSurfaceDirtyBlockDraft[] {
  const rootElement = asActionElement(root);
  const blockElements = readNodeList(rootElement?.querySelectorAll?.('article[data-block-id][data-block-origin="user"]'));
  const drafts: NoteSurfaceDirtyBlockDraft[] = [];

  for (const blockElement of blockElements) {
    const block = asActionElement(blockElement);
    const blockId = readDatasetString(block?.dataset ?? {}, 'blockId');
    const saveStatus = readDatasetString(block?.dataset ?? {}, 'editorSaveStatus');
    if (blockId === undefined || (saveStatus !== 'dirty' && saveStatus !== 'error')) {
      continue;
    }

    const contentElement = asActionElement(block?.querySelector?.('[data-block-editor-content="true"]'));
    if (typeof contentElement?.textContent !== 'string') {
      continue;
    }

    const inputCompositionState = readInputCompositionState(blockId, composition);
    drafts.push({
      blockId,
      content: contentElement.textContent,
      ...(inputCompositionState === undefined ? {} : { inputCompositionState }),
    });
  }

  return drafts;
}

function readInputCompositionState(
  blockId: string,
  composition: {
    composingBlockIds: ReadonlySet<string>;
    pendingCompositionBlockIds: ReadonlySet<string>;
  },
): NoteSurfaceDirtyBlockDraft['inputCompositionState'] {
  if (composition.composingBlockIds.has(blockId)) {
    return 'active';
  }
  if (composition.pendingCompositionBlockIds.has(blockId)) {
    return 'pending';
  }
  return undefined;
}

function readNodeList(value: unknown): unknown[] {
  if (value === undefined || value === null || typeof value !== 'object') {
    return [];
  }

  return Array.from(value as ArrayLike<unknown>);
}

function asActionElement(value: unknown): NoteSurfaceDomActionElement | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  return value as NoteSurfaceDomActionElement;
}
