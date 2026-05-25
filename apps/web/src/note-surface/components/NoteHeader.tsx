import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import type { NoteHeaderViewModel } from '../viewModelTypes.ts';
import { normalizeNoteTitleDraft, shouldCommitNoteTitleKey } from '../noteTitleEditor.ts';

interface NoteHeaderProps {
  header: NoteHeaderViewModel;
  onUpdateTitle(title: string): void;
}

export function NoteHeader({ header, onUpdateTitle }: NoteHeaderProps) {
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const previousNoteIdRef = useRef(header.noteId);
  const focusedRef = useRef(false);
  const [draftTitle, setDraftTitle] = useState(header.title);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (title === null) {
      return;
    }
    resizeTitleTextarea(title);
  }, [draftTitle]);

  useEffect(() => {
    const noteChanged = previousNoteIdRef.current !== header.noteId;
    previousNoteIdRef.current = header.noteId;
    if (!noteChanged && focusedRef.current) {
      return;
    }

    setDraftTitle(header.title);
  }, [header.noteId, header.title]);

  const commitTitle = (title: string) => {
    const normalizedTitle = normalizeNoteTitleDraft(title, header.title);
    setDraftTitle(normalizedTitle);
    onUpdateTitle(normalizedTitle);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraftTitle(event.currentTarget.value);
  };
  const handleFocus = () => {
    focusedRef.current = true;
  };
  const handleBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    focusedRef.current = false;
    commitTitle(event.currentTarget.value);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldCommitNoteTitleKey({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode,
    })) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <header className="ann-note-header" data-component="note-header">
      <textarea
        className="ann-note-title-editor"
        aria-label="メモのタイトル"
        enterKeyHint="done"
        ref={titleRef}
        rows={1}
        value={draftTitle}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <p data-note-description="effective">{header.description.effective}</p>
    </header>
  );
}

function resizeTitleTextarea(title: HTMLTextAreaElement): void {
  title.style.height = 'auto';
  title.style.height = `${title.scrollHeight}px`;
}
