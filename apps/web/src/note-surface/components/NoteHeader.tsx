import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import type { NoteHeaderViewModel } from '../viewModelTypes.ts';

interface NoteHeaderProps {
  header: NoteHeaderViewModel;
  onUpdateTitle(title: string): void;
}

export function NoteHeader({ header, onUpdateTitle }: NoteHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const previousNoteIdRef = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (title === null) {
      return;
    }

    const noteChanged = previousNoteIdRef.current !== header.noteId;
    previousNoteIdRef.current = header.noteId;
    const focused = globalThis.document.activeElement === title;
    if (!noteChanged && focused) {
      return;
    }

    if (title.textContent !== header.title) {
      title.textContent = header.title;
    }
  }, [header.noteId, header.title]);

  const handleBlur = (event: FocusEvent<HTMLHeadingElement>) => {
    if (event.currentTarget.textContent.trim().length === 0) {
      event.currentTarget.textContent = header.title;
    }
    onUpdateTitle(event.currentTarget.textContent);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLHeadingElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <header className="ann-note-header" data-component="note-header">
      <h1
        className="ann-note-title-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="メモのタイトル"
        ref={titleRef}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <p data-note-description="effective">{header.description.effective}</p>
    </header>
  );
}
