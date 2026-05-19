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
  parentElement?: unknown;
  parentNode?: unknown;
}

interface NoteSurfaceDomClickEvent {
  target?: unknown;
}

interface NoteSurfaceDomHostRoot {
  innerHTML: string;
  addEventListener(type: 'click', listener: (event: NoteSurfaceDomClickEvent) => void): void;
  removeEventListener(type: 'click', listener: (event: NoteSurfaceDomClickEvent) => void): void;
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
}

export function createNoteSurfaceDomHost(root: NoteSurfaceDomHostRoot): NoteSurfaceBrowserRuntimeHost {
  let removePreviousClickListener: (() => void) | undefined;

  return {
    setHtml(html: string): void {
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

        const descriptor = createEventDescriptor(actionElement.dataset ?? {}, events);
        void Promise.resolve(handler(descriptor)).catch(() => undefined);
      };

      root.addEventListener('click', clickListener);
      removePreviousClickListener = () => root.removeEventListener('click', clickListener);
    },
  };
}

function createEventDescriptor(
  dataset: NoteSurfaceDomDataset,
  events: readonly NoteSurfaceHtmlRenderEventDescriptor[],
): NoteSurfaceDomEventDescriptor | NoteSurfaceHtmlRenderEventDescriptor {
  const datasetDescriptor = readDatasetDescriptor(dataset);
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

  return descriptor;
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
  key: Exclude<keyof NoteSurfaceDomEventDescriptor, 'dataset' | 'action' | 'dataAction'>,
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

function asActionElement(value: unknown): NoteSurfaceDomActionElement | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  return value as NoteSurfaceDomActionElement;
}
