import type { NoteHeaderViewModel } from '../viewModelTypes.ts';

interface NoteHeaderProps {
  header: NoteHeaderViewModel;
}

export function NoteHeader({ header }: NoteHeaderProps) {
  return (
    <header className="ann-note-header" data-component="note-header">
      <h1>{header.title}</h1>
      <p data-note-description="effective">{header.description.effective}</p>
    </header>
  );
}
