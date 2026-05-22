import type { FocusEvent, FormEvent } from 'react';
import type { NoteBlockViewModel } from '../viewModelTypes.ts';
import type { EditableBlockInput } from '../state/useNoteSurfaceFlow.ts';
import { AiAssistBlock } from '../../ai-assist/components/AiAssistBlock.tsx';
import { MemoryCandidateBlock } from '../../memory/components/MemoryCandidateBlock.tsx';

interface NoteSurfaceBlocksProps {
  blocks: readonly NoteBlockViewModel[];
  placeholderText: string;
  onEditableFocus(input: EditableBlockInput): void;
  onEditableInput(input: EditableBlockInput): void;
  onEditableBlur(input: EditableBlockInput): void;
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
  const body = block.memoryCandidate !== undefined
    ? <MemoryCandidateBlock block={block} onRemember={props.onRememberMemoryCandidate} onReject={props.onRejectMemoryCandidate} />
    : block.aiAssist !== undefined
      ? <AiAssistBlock block={block} onInspectSource={props.onInspectSource} onToggleEditing={() => undefined} onDelete={() => undefined} />
      : <EditableUserBlock block={block} placeholderText={props.placeholderText} onFocus={props.onEditableFocus} onInput={props.onEditableInput} onBlur={props.onEditableBlur} />;

  return (
    <article
      className={`ann-block ann-block--${block.type}`}
      data-block-id={block.id}
      data-block-type={block.type}
      data-block-origin={block.origin}
      data-position={block.position}
      data-editor-state={block.editor.state}
      data-editor-save-status={block.editor.saveStatus}
      data-editor-layout-stability="block-identity"
    >
      {body}
      {block.memoryCandidate === undefined && block.aiAssist === undefined ? <BlockControls block={block} /> : null}
      <BlockStatus block={block} />
    </article>
  );
}

function EditableUserBlock({ block, placeholderText, onFocus, onInput, onBlur }: {
  block: NoteBlockViewModel;
  placeholderText: string;
  onFocus(input: EditableBlockInput): void;
  onInput(input: EditableBlockInput): void;
  onBlur(input: EditableBlockInput): void;
}) {
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.textContent === placeholderText) {
      event.currentTarget.textContent = '';
    }
    onFocus({ blockId: block.id, text: event.currentTarget.textContent ?? '' });
  };
  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    onInput({ blockId: block.id, text: event.currentTarget.textContent ?? '' });
  };
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    onBlur({ blockId: block.id, text: event.currentTarget.textContent ?? '' });
  };

  return (
    <div
      className="ann-block-text"
      data-block-editor-content="true"
      data-editor-composition-state="idle"
      role="textbox"
      aria-readonly="false"
      contentEditable
      suppressContentEditableWarning
      onFocus={handleFocus}
      onInput={handleInput}
      onBlur={handleBlur}
    >
      {block.text}
    </div>
  );
}

function BlockControls({ block }: { block: NoteBlockViewModel }) {
  return (
    <div className="ann-block-controls" data-action-group="block_editor">
      <button type="button" data-action="edit_block" data-target="block_editor" data-block-id={block.id}>編集</button>
      <button type="button" data-action="save_block" data-target="block_editor" data-block-id={block.id}>保存</button>
      <button type="button" data-action="cancel_edit" data-target="block_editor" data-block-id={block.id}>キャンセル</button>
    </div>
  );
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
