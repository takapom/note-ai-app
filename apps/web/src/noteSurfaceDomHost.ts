import type {
  NoteSurfaceBrowserRuntimeActionHandler,
  NoteSurfaceBrowserRuntimeHost,
} from './noteSurfaceBrowserRuntime.ts';
import type {
  NoteSurfaceHtmlRenderEventDescriptor,
} from './noteSurfaceHtmlRenderer.ts';

type NoteSurfaceDomDataset = Record<string, string | undefined>;

interface NoteSurfaceDomActionElement {
  dataset?: NoteSurfaceDomDataset;
  closest?: (selector: string) => unknown;
  querySelector?: (selector: string) => unknown;
  textContent?: string | null;
  parentElement?: unknown;
  parentNode?: unknown;
}

interface NoteSurfaceDomClickEvent {
  target?: unknown;
}

interface NoteSurfaceDomCompositionEvent {
  target?: unknown;
}

interface NoteSurfaceDomHostRoot {
  innerHTML: string;
  addEventListener(
    type: 'click' | 'compositionstart' | 'compositionend' | 'input',
    listener: (event: NoteSurfaceDomClickEvent | NoteSurfaceDomCompositionEvent) => void,
  ): void;
  removeEventListener(
    type: 'click' | 'compositionstart' | 'compositionend' | 'input',
    listener: (event: NoteSurfaceDomClickEvent | NoteSurfaceDomCompositionEvent) => void,
  ): void;
}

interface NoteSurfaceDomEventDescriptor {
  dataset: NoteSurfaceDomDataset;
  action?: string;
  target?: string;
  apiIntent?: string;
  blockId?: string;
  noteId?: string;
  blockType?: string;
  digestSectionId?: string;
  dataAction?: string;
  content?: string;
  focusedBlockId?: string;
  inputCompositionState?: 'active' | 'pending';
}

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
      composingBlockIds.clear();
      pendingCompositionBlockIds.clear();
      root.innerHTML = html;
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

function createEventDescriptor(
  actionElement: NoteSurfaceDomActionElement,
  events: readonly NoteSurfaceHtmlRenderEventDescriptor[],
  composition: {
    composingBlockIds: ReadonlySet<string>;
    pendingCompositionBlockIds: ReadonlySet<string>;
  },
): NoteSurfaceDomEventDescriptor | NoteSurfaceHtmlRenderEventDescriptor {
  const dataset = actionElement.dataset ?? {};
  const datasetDescriptor = readDatasetDescriptor(dataset);
  const content = readSaveBlockContent(actionElement, datasetDescriptor);
  if (content !== undefined) {
    datasetDescriptor.content = content;
  }
  applyFocusedBlockDescriptor(actionElement, datasetDescriptor, composition);

  if (datasetDescriptor.apiIntent !== undefined) {
    return datasetDescriptor;
  }

  const renderedDescriptor = findRenderedEventDescriptor(datasetDescriptor, events);
  if (renderedDescriptor === undefined) {
    return datasetDescriptor;
  }

  return {
    ...renderedDescriptor,
    ...datasetDescriptor,
    apiIntent: renderedDescriptor.apiIntent,
    ...(content === undefined ? {} : { content }),
    ...(datasetDescriptor.focusedBlockId === undefined ? {} : { focusedBlockId: datasetDescriptor.focusedBlockId }),
    ...(datasetDescriptor.inputCompositionState === undefined
      ? {}
      : { inputCompositionState: datasetDescriptor.inputCompositionState }),
    dataset: datasetDescriptor.dataset,
  };
}

function readDatasetDescriptor(dataset: NoteSurfaceDomDataset): NoteSurfaceDomEventDescriptor {
  const action = readDatasetString(dataset, 'action');
  const descriptor: NoteSurfaceDomEventDescriptor = {
    dataset: copyDataset(dataset),
  };

  if (action !== undefined) {
    descriptor.action = action;
    descriptor.dataAction = action;
  }
  copyDatasetString(descriptor, dataset, 'target');
  copyDatasetString(descriptor, dataset, 'apiIntent');
  copyDatasetString(descriptor, dataset, 'blockId');
  copyDatasetString(descriptor, dataset, 'noteId');
  copyDatasetString(descriptor, dataset, 'blockType');
  copyDatasetString(descriptor, dataset, 'digestSectionId');
  copyDatasetString(descriptor, dataset, 'content');

  return descriptor;
}

function applyFocusedBlockDescriptor(
  actionElement: NoteSurfaceDomActionElement,
  descriptor: NoteSurfaceDomEventDescriptor,
  composition: {
    composingBlockIds: ReadonlySet<string>;
    pendingCompositionBlockIds: ReadonlySet<string>;
  },
): void {
  const focusedBlockId = descriptor.blockId ?? (
    descriptor.target === 'block_editor' ? readClosestBlockId(actionElement) : undefined
  );
  if (focusedBlockId === undefined) {
    return;
  }

  descriptor.focusedBlockId = focusedBlockId;
  if (composition.composingBlockIds.has(focusedBlockId)) {
    descriptor.inputCompositionState = 'active';
    return;
  }
  if (composition.pendingCompositionBlockIds.has(focusedBlockId)) {
    descriptor.inputCompositionState = 'pending';
  }
}

function findRenderedEventDescriptor(
  descriptor: NoteSurfaceDomEventDescriptor,
  events: readonly NoteSurfaceHtmlRenderEventDescriptor[],
): NoteSurfaceHtmlRenderEventDescriptor | undefined {
  if (descriptor.action === undefined || descriptor.target === undefined) {
    return undefined;
  }

  return events.find((event) => (
    (event.dataAction === descriptor.action || event.action === descriptor.action)
    && event.target === descriptor.target
    && (descriptor.blockId === undefined || event.blockId === descriptor.blockId)
  ));
}

function findActionElement(target: unknown): NoteSurfaceDomActionElement | undefined {
  const closestElement = findClosestActionElement(target);
  if (closestElement !== undefined) {
    return closestElement;
  }

  let current = asActionElement(target);
  while (current !== undefined) {
    if (hasActionDataset(current)) {
      return current;
    }
    current = asActionElement(current.parentElement ?? current.parentNode);
  }

  return undefined;
}

function findClosestActionElement(target: unknown): NoteSurfaceDomActionElement | undefined {
  const targetElement = asActionElement(target);
  if (targetElement?.closest === undefined) {
    return undefined;
  }

  const closestElement = asActionElement(targetElement.closest('[data-action]'));
  return closestElement !== undefined && hasActionDataset(closestElement)
    ? closestElement
    : undefined;
}

function hasActionDataset(element: NoteSurfaceDomActionElement): boolean {
  return readDatasetString(element.dataset ?? {}, 'action') !== undefined;
}

function copyDataset(dataset: NoteSurfaceDomDataset): NoteSurfaceDomDataset {
  return Object.fromEntries(
    Object.entries(dataset).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
    )),
  );
}

function copyDatasetString(
  descriptor: NoteSurfaceDomEventDescriptor,
  dataset: NoteSurfaceDomDataset,
  key: Exclude<
    keyof NoteSurfaceDomEventDescriptor,
    'dataset' | 'action' | 'dataAction' | 'focusedBlockId' | 'inputCompositionState'
  >,
): void {
  const value = readDatasetString(dataset, key);
  if (value !== undefined) {
    descriptor[key] = value;
  }
}

function readDatasetString(dataset: NoteSurfaceDomDataset, key: string): string | undefined {
  const value = dataset[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function readSaveBlockContent(
  actionElement: NoteSurfaceDomActionElement,
  descriptor: NoteSurfaceDomEventDescriptor,
): string | undefined {
  if (descriptor.action !== 'save_block' || descriptor.target !== 'block_editor') {
    return undefined;
  }

  const blockElement = asActionElement(actionElement.closest?.('article[data-block-id]'));
  const contentElement = asActionElement(blockElement?.querySelector?.('[data-block-editor-content="true"]'));
  return typeof contentElement?.textContent === 'string' ? contentElement.textContent : undefined;
}

function readClosestBlockId(target: unknown): string | undefined {
  const targetElement = asActionElement(target);
  const blockElement = asActionElement(targetElement?.closest?.('article[data-block-id]'));
  return readDatasetString(blockElement?.dataset ?? {}, 'blockId');
}

function asActionElement(value: unknown): NoteSurfaceDomActionElement | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  return value as NoteSurfaceDomActionElement;
}
