import { useEffect, useLayoutEffect, useRef, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react';
import type { NoteBlockViewModel } from '../viewModelTypes.ts';
import type { EditableBlockInput, EditableBlockKeyInput } from '../state/useNoteSurfaceFlow.ts';
import { AiAssistBlock } from '../../ai-assist/components/AiAssistBlock.tsx';
import { MemoryCandidateBlock } from '../../memory/components/MemoryCandidateBlock.tsx';

interface NoteSurfaceBlocksProps {
  blocks: readonly NoteBlockViewModel[];
  placeholderText: string;
  pendingFocusBlockId: string | undefined;
  pendingFocusOffset: number | undefined;
  onEditableFocus(input: EditableBlockInput): void;
  onEditableInput(input: EditableBlockInput): void;
  onEditableBlur(input: EditableBlockInput): void;
  onEditableKeyDown(input: EditableBlockKeyInput): void;
  onInspectSource(): void;
  onRememberMemoryCandidate(blockId: string): void;
  onRejectMemoryCandidate(blockId: string): void;
}

export function NoteSurfaceBlocks(props: NoteSurfaceBlocksProps) {
  return (
    <section className="ann-block-editor" data-component="block-editor" data-editor="block">
      <div className="ann-block-list" data-block-list="note">
        {props.blocks.map((block) => (
          <NoteBlock key={block.id} block={block} {...props} />
        ))}
      </div>
    </section>
  );
}

function NoteBlock(props: NoteSurfaceBlocksProps & { block: NoteBlockViewModel }) {
  const block = props.block;
  const emptyUserBlock = block.origin === 'user' && block.text === props.placeholderText;
  const body = block.memoryCandidate !== undefined
    ? <MemoryCandidateBlock block={block} onRemember={props.onRememberMemoryCandidate} onReject={props.onRejectMemoryCandidate} />
    : block.aiAssist !== undefined
      ? <AiAssistBlock block={block} onInspectSource={props.onInspectSource} onToggleEditing={() => undefined} onDelete={() => undefined} />
      : <EditableUserBlock block={block} empty={emptyUserBlock} pendingFocusBlockId={props.pendingFocusBlockId} pendingFocusOffset={props.pendingFocusOffset} onFocus={props.onEditableFocus} onInput={props.onEditableInput} onBlur={props.onEditableBlur} onKeyDown={props.onEditableKeyDown} />;

  return (
    <article
      className={`ann-block ann-block--${block.type}`}
      data-block-id={block.id}
      data-block-type={block.type}
      data-block-origin={block.origin}
      data-position={block.position}
      data-editor-state={block.editor.state}
      data-editor-save-status={block.editor.saveStatus}
      data-empty-block={emptyUserBlock ? 'true' : 'false'}
      data-editor-layout-stability="block-identity"
    >
      {body}
      <BlockStatus block={block} />
    </article>
  );
}

function EditableUserBlock({ block, empty, pendingFocusBlockId, pendingFocusOffset, onFocus, onInput, onBlur, onKeyDown }: {
  block: NoteBlockViewModel;
  empty: boolean;
  pendingFocusBlockId: string | undefined;
  pendingFocusOffset: number | undefined;
  onFocus(input: EditableBlockInput): void;
  onInput(input: EditableBlockInput): void;
  onBlur(input: EditableBlockInput): void;
  onKeyDown(input: EditableBlockKeyInput): void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previousBlockIdRef = useRef<string | undefined>(undefined);
  const renderedText = empty ? '' : block.text;

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }

    const blockChanged = previousBlockIdRef.current !== block.id;
    previousBlockIdRef.current = block.id;
    const focused = globalThis.document.activeElement === editor;
    if (!blockChanged && focused) {
      return;
    }

    if (editor.textContent !== renderedText) {
      editor.textContent = renderedText;
    }
  }, [block.id, renderedText]);

  useEffect(() => {
    if (pendingFocusBlockId !== block.id) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      const editor = editorRef.current;
      if (editor === null) {
        return;
      }
      editor.focus();
      if (pendingFocusOffset !== undefined) {
        placeCaretAtOffset(editor, pendingFocusOffset);
      }
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [block.id, pendingFocusBlockId, pendingFocusOffset]);

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (empty) {
      event.currentTarget.textContent = '';
    }
    onFocus({ blockId: block.id, text: event.currentTarget.textContent });
  };
  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    onInput({ blockId: block.id, text: event.currentTarget.textContent });
  };
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    onBlur({ blockId: block.id, text: event.currentTarget.textContent });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const caretOffset = readCollapsedCaretOffset(event.currentTarget);
    if (!event.nativeEvent.isComposing && shouldMergeWithPreviousUserBlock(event, caretOffset)) {
      event.preventDefault();
    }
    if (!event.nativeEvent.isComposing && moveCaretAcrossUserBlocks(event)) {
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
    }
    onKeyDown({
      blockId: block.id,
      text: event.currentTarget.textContent,
      key: event.key,
      shiftKey: event.shiftKey,
      ...(caretOffset === undefined ? {} : { caretOffset }),
    });
  };

  return (
    <div
      className="ann-block-text"
      data-block-editor-content="true"
      data-editor-composition-state="idle"
      data-empty-editor={empty ? 'true' : 'false'}
      role="textbox"
      aria-readonly="false"
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onFocus={handleFocus}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

type ArrowNavigationDirection = 'previous' | 'next';
type CaretPlacement = 'start' | 'end';

function moveCaretAcrossUserBlocks(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  const direction = resolveArrowNavigationDirection(event.key);
  if (direction === undefined) {
    return false;
  }

  const caretOffset = readCollapsedCaretOffset(event.currentTarget);
  if (caretOffset === undefined) {
    return false;
  }

  const textLength = event.currentTarget.textContent.length;
  const atBoundary = direction === 'previous' ? caretOffset === 0 : caretOffset === textLength;
  if (!atBoundary) {
    return false;
  }

  const target = findAdjacentUserEditor(event.currentTarget, direction);
  if (target === undefined) {
    return false;
  }

  event.preventDefault();
  placeCaret(target, direction === 'previous' ? 'end' : 'start');
  return true;
}

function resolveArrowNavigationDirection(key: string): ArrowNavigationDirection | undefined {
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return 'previous';
  }
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return 'next';
  }
  return undefined;
}

function shouldMergeWithPreviousUserBlock(
  event: KeyboardEvent<HTMLDivElement>,
  caretOffset: number | undefined,
): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  if (event.key !== 'Backspace' && event.key !== 'Delete') {
    return false;
  }
  if (caretOffset !== 0) {
    return false;
  }
  return findAdjacentUserEditor(event.currentTarget, 'previous') !== undefined;
}

function readCollapsedCaretOffset(editor: HTMLElement): number | undefined {
  const selection = editor.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  if (!range.collapsed || !editor.contains(range.startContainer)) {
    return undefined;
  }

  const prefix = range.cloneRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

function findAdjacentUserEditor(
  editor: HTMLElement,
  direction: ArrowNavigationDirection,
): HTMLElement | undefined {
  const currentBlock = editor.closest<HTMLElement>('article[data-block-id][data-block-origin="user"]');
  if (currentBlock === null) {
    return undefined;
  }

  let candidate = direction === 'previous'
    ? currentBlock.previousElementSibling
    : currentBlock.nextElementSibling;
  while (candidate !== null) {
    if (candidate instanceof HTMLElement && candidate.matches('article[data-block-id][data-block-origin="user"]')) {
      const target = candidate.querySelector<HTMLElement>('[data-block-editor-content="true"]');
      if (target !== null) {
        return target;
      }
    }
    candidate = direction === 'previous'
      ? candidate.previousElementSibling
      : candidate.nextElementSibling;
  }

  return undefined;
}

function placeCaret(editor: HTMLElement, placement: CaretPlacement): void {
  editor.focus({ preventScroll: true });
  placeCaretAtOffset(editor, placement === 'start' ? 0 : Number.MAX_SAFE_INTEGER);
}

function placeCaretAtOffset(editor: HTMLElement, offset: number): void {
  const selection = editor.ownerDocument.getSelection();
  const range = editor.ownerDocument.createRange();
  const position = findTextPosition(editor, offset);
  if (selection === null || position === undefined) {
    return;
  }

  range.setStart(position.node, position.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function findTextPosition(root: HTMLElement, requestedOffset: number): { node: Node; offset: number } | undefined {
  const targetOffset = Math.max(0, requestedOffset);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let lastTextNode: Node | undefined;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    lastTextNode = node;
    const textLength = node.textContent?.length ?? 0;
    if (consumed + textLength >= targetOffset) {
      return { node, offset: targetOffset - consumed };
    }
    consumed += textLength;
  }

  return lastTextNode === undefined
    ? { node: root, offset: 0 }
    : { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
}

function BlockStatus({ block }: { block: NoteBlockViewModel }) {
  return (
    <div
      className="ann-block-status"
      data-editor-status-region="fixed"
      data-editor-layout-stability="status-reserved"
      data-editor-save-status={block.editor.saveStatus}
      data-retry-available={block.editor.retryAction === undefined ? 'false' : 'true'}
      data-retry-action={block.editor.retryAction}
      aria-live="polite"
      aria-atomic="true"
    >
      <span data-editor-status-message="true">{block.editor.statusMessage}</span>
    </div>
  );
}
