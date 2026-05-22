import type {
  NoteSurfaceDomActionElement,
  NoteSurfaceDomRange,
  NoteSurfaceSelectionSnapshot,
} from './domHostTypes.ts';
import { readClosestBlockId, readDatasetString } from './domEventDescriptor.ts';

export function captureSelectionSnapshot(root: unknown): NoteSurfaceSelectionSnapshot | undefined {
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

export function restoreSelectionSnapshot(
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

function findFirstUserEditorContent(root: unknown): NoteSurfaceDomActionElement | undefined {
  const rootElement = asActionElement(root);
  const blockElements = readNodeList(rootElement?.querySelectorAll?.('article[data-block-id][data-block-origin="user"]'));
  for (const blockElement of blockElements) {
    const editor = asActionElement(asActionElement(blockElement)?.querySelector?.('[data-block-editor-content="true"]'));
    if (editor !== undefined) {
      return editor;
    }
  }

  return undefined;
}

export function focusWritingSurface(root: unknown, blockId?: string): void {
  const contentElement = blockId === undefined
    ? findFirstUserEditorContent(root)
    : findEditorContentByBlockId(root, blockId);
  if (contentElement === undefined) {
    return;
  }

  contentElement.focus?.({ preventScroll: false });
  placeCaretAtEnd(contentElement, root);
}

function placeCaretAtEnd(contentElement: NoteSurfaceDomActionElement, root: unknown): void {
  const documentLike = readDocumentLike(root);
  const selection = documentLike?.getSelection?.();
  const range = documentLike?.createRange?.();
  if (selection === undefined || selection === null || range === undefined) {
    return;
  }

  const end = findTextPosition(contentElement, Number.MAX_SAFE_INTEGER);
  if (end === undefined) {
    return;
  }

  range.setStart(end.node, end.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
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
