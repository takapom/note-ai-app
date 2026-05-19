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
  querySelectorAll?: (selector: string) => unknown;
  textContent?: string | null;
  childNodes?: unknown;
  nodeType?: number;
  ownerDocument?: unknown;
  activeElement?: unknown;
  focus?: (options?: { preventScroll?: boolean }) => void;
  getSelection?: () => NoteSurfaceDomSelection | null;
  createRange?: () => NoteSurfaceDomRange;
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

interface NoteSurfaceDomSelection {
  rangeCount: number;
  getRangeAt(index: number): NoteSurfaceDomRange;
  removeAllRanges(): void;
  addRange(range: NoteSurfaceDomRange): void;
}

interface NoteSurfaceDomRange {
  startContainer: unknown;
  startOffset: number;
  endContainer: unknown;
  endOffset: number;
  setStart(node: unknown, offset: number): void;
  setEnd(node: unknown, offset: number): void;
  collapse(toStart?: boolean): void;
}

interface NoteSurfaceSelectionSnapshot {
  blockId: string;
  startOffset: number;
  endOffset: number;
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
      const selectionSnapshot = captureSelectionSnapshot(root);
      composingBlockIds.clear();
      pendingCompositionBlockIds.clear();
      root.innerHTML = html;
      restoreSelectionSnapshot(root, selectionSnapshot);
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

function captureSelectionSnapshot(root: unknown): NoteSurfaceSelectionSnapshot | undefined {
  const documentLike = readDocumentLike(root);
  const activeElement = asActionElement(documentLike?.activeElement);
  const blockId = readClosestBlockId(activeElement);
  if (documentLike === undefined || activeElement === undefined || blockId === undefined) {
    return undefined;
  }

  const contentElement = readClosestEditorContent(activeElement);
  if (contentElement === undefined) {
    return undefined;
  }

  const selection = documentLike.getSelection?.();
  if (selection === undefined || selection === null || selection.rangeCount === 0) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  const startOffset = measureTextOffset(contentElement, range.startContainer, range.startOffset);
  const endOffset = measureTextOffset(contentElement, range.endContainer, range.endOffset);
  if (startOffset === undefined || endOffset === undefined) {
    return undefined;
  }

  return {
    blockId,
    startOffset,
    endOffset,
  };
}

function restoreSelectionSnapshot(
  root: unknown,
  snapshot: NoteSurfaceSelectionSnapshot | undefined,
): void {
  if (snapshot === undefined) {
    return;
  }

  const documentLike = readDocumentLike(root);
  const contentElement = findEditorContentByBlockId(root, snapshot.blockId);
  const selection = documentLike?.getSelection?.();
  const range = documentLike?.createRange?.();
  if (
    documentLike === undefined
    || contentElement === undefined
    || selection === undefined
    || selection === null
    || range === undefined
  ) {
    return;
  }

  const start = findTextPosition(contentElement, snapshot.startOffset);
  const end = findTextPosition(contentElement, snapshot.endOffset);
  if (start === undefined || end === undefined) {
    return;
  }

  contentElement.focus?.({ preventScroll: true });
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function readDocumentLike(root: unknown): NoteSurfaceDomActionElement | undefined {
  const rootElement = asActionElement(root);
  return asActionElement(rootElement?.ownerDocument) ?? rootElement;
}

function readClosestEditorContent(target: unknown): NoteSurfaceDomActionElement | undefined {
  const targetElement = asActionElement(target);
  return asActionElement(targetElement?.closest?.('[data-block-editor-content="true"]'));
}

function findEditorContentByBlockId(root: unknown, blockId: string): NoteSurfaceDomActionElement | undefined {
  const rootElement = asActionElement(root);
  const blockElements = readNodeList(rootElement?.querySelectorAll?.('article[data-block-id]'));
  for (const blockElement of blockElements) {
    const actionElement = asActionElement(blockElement);
    if (readDatasetString(actionElement?.dataset ?? {}, 'blockId') === blockId) {
      return asActionElement(actionElement?.querySelector?.('[data-block-editor-content="true"]'));
    }
  }

  return undefined;
}

function measureTextOffset(root: unknown, target: unknown, targetOffset: number): number | undefined {
  let offset = 0;

  function visit(node: unknown): number | undefined {
    if (node === target) {
      if (isTextNode(node)) {
        return offset + targetOffset;
      }

      return offset + textLengthOfChildNodesBefore(node, targetOffset);
    }

    if (isTextNode(node)) {
      offset += readTextContent(node).length;
      return undefined;
    }

    for (const child of readChildNodes(node)) {
      const found = visit(child);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  return visit(root);
}

function findTextPosition(root: unknown, requestedOffset: number): { node: unknown; offset: number } | undefined {
  const targetOffset = Math.max(0, requestedOffset);
  let consumed = 0;
  let fallback: { node: unknown; offset: number } | undefined;

  function visit(node: unknown): { node: unknown; offset: number } | undefined {
    if (isTextNode(node)) {
      const text = readTextContent(node);
      fallback = { node, offset: text.length };
      if (consumed + text.length >= targetOffset) {
        return { node, offset: targetOffset - consumed };
      }
      consumed += text.length;
      return undefined;
    }

    for (const child of readChildNodes(node)) {
      const found = visit(child);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  return visit(root) ?? fallback ?? { node: root, offset: 0 };
}

function textLengthOfChildNodesBefore(node: unknown, offset: number): number {
  return readChildNodes(node)
    .slice(0, Math.max(0, offset))
    .reduce<number>((total, child) => total + readTextContent(child).length, 0);
}

function readChildNodes(node: unknown): unknown[] {
  const childNodes = asActionElement(node)?.childNodes;
  if (childNodes === undefined || childNodes === null || typeof childNodes !== 'object') {
    return [];
  }

  return Array.from(childNodes as ArrayLike<unknown>);
}

function readNodeList(value: unknown): unknown[] {
  if (value === undefined || value === null || typeof value !== 'object') {
    return [];
  }

  return Array.from(value as ArrayLike<unknown>);
}

function isTextNode(node: unknown): boolean {
  return asActionElement(node)?.nodeType === 3;
}

function readTextContent(node: unknown): string {
  return asActionElement(node)?.textContent ?? '';
}

function asActionElement(value: unknown): NoteSurfaceDomActionElement | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  return value as NoteSurfaceDomActionElement;
}
