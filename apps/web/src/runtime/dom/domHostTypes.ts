export type NoteSurfaceDomDataset = Record<string, string | undefined>;

export interface NoteSurfaceDomActionElement {
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

export interface NoteSurfaceDomClickEvent {
  target?: unknown;
}

export interface NoteSurfaceDomCompositionEvent {
  target?: unknown;
}

export interface NoteSurfaceDomHostRoot {
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

export interface NoteSurfaceDomEventDescriptor {
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

export interface NoteSurfaceDomSelection {
  rangeCount: number;
  getRangeAt(index: number): NoteSurfaceDomRange;
  removeAllRanges(): void;
  addRange(range: NoteSurfaceDomRange): void;
}

export interface NoteSurfaceDomRange {
  startContainer: unknown;
  startOffset: number;
  endContainer: unknown;
  endOffset: number;
  setStart(node: unknown, offset: number): void;
  setEnd(node: unknown, offset: number): void;
  collapse(toStart?: boolean): void;
}

export interface NoteSurfaceSelectionSnapshot {
  blockId: string;
  startOffset: number;
  endOffset: number;
}
