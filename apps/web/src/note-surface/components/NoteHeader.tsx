import type { FocusEvent, KeyboardEvent } from 'react';
import type { NoteHeaderViewModel } from '../viewModelTypes.ts';

interface NoteHeaderProps {
  header: NoteHeaderViewModel;
  onUpdateTitle(title: string): void;
}

export function NoteHeader({ header, onUpdateTitle }: NoteHeaderProps) {
  const handleBlur = (event: FocusEvent<HTMLHeadingElement>) => {
    if ((event.currentTarget.textContent ?? '').trim().length === 0) {
      event.currentTarget.textContent = header.title;
    }
    onUpdateTitle(event.currentTarget.textContent ?? '');
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
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {header.title}
      </h1>
      <p data-note-description="effective">{header.description.effective}</p>
    </header>
  );
}
