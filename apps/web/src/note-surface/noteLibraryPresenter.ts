import type {
  RecentThoughtInput,
  ThinRailNoteLibraryStatusInput,
} from './viewModelTypes.ts';

export interface NoteLibraryViewStateResult {
  recentThoughts?: readonly RecentThoughtInput[];
  noteLibraryStatus?: ThinRailNoteLibraryStatusInput;
  errors: readonly string[];
}

export function createNoteLibraryViewStateFromListBody(
  body: unknown,
  activeNoteId: string,
): NoteLibraryViewStateResult {
  const notes = readNotesArray(body);
  if (notes === undefined) {
    return invalidNoteLibrary(['note library response must include notes array']);
  }

  const errors = notes.flatMap((note, index) => validateNoteListItem(note, index));
  if (errors.length > 0) {
    return invalidNoteLibrary(errors);
  }

  if (notes.length === 0) {
    return {
      recentThoughts: [],
      noteLibraryStatus: {
        state: 'empty',
        label: 'メモはまだありません',
      },
      errors: [],
    };
  }

  return {
    recentThoughts: notes.map((note) => {
      const item = note as NoteListItemRecord;
      return {
        id: item.noteId,
        title: item.title,
        updatedLabel: formatUpdatedLabel(item.updatedAt),
        active: item.noteId === activeNoteId,
      };
    }),
    errors: [],
  };
}

export function createFailedNoteLibraryStatus(): ThinRailNoteLibraryStatusInput {
  return {
    state: 'failed',
    label: 'メモ一覧を読み込めませんでした',
  };
}

function invalidNoteLibrary(errors: readonly string[]): NoteLibraryViewStateResult {
  return {
    noteLibraryStatus: {
      state: 'invalid',
      label: 'メモ一覧を読み取れませんでした',
    },
    errors,
  };
}

function readNotesArray(body: unknown): readonly unknown[] | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }

  const notes = (body as { notes?: unknown }).notes;
  return Array.isArray(notes) ? notes : undefined;
}

interface NoteListItemRecord {
  noteId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

function validateNoteListItem(item: unknown, index: number): readonly string[] {
  const errors: string[] = [];
  const prefix = `notes[${index}]`;
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    return [`${prefix} must be an object`];
  }

  const candidate = item as Partial<NoteListItemRecord>;
  if (!isStableRuntimeId(candidate.noteId)) {
    errors.push(`${prefix}.noteId must be a stable non-sentinel runtime id`);
  }
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') {
    errors.push(`${prefix}.title must be a non-empty string`);
  }
  if (!isValidTimestamp(candidate.createdAt)) {
    errors.push(`${prefix}.createdAt must be a valid timestamp`);
  }
  if (!isValidTimestamp(candidate.updatedAt)) {
    errors.push(`${prefix}.updatedAt must be a valid timestamp`);
  }

  return errors;
}

function formatUpdatedLabel(updatedAt: number): string {
  return `${new Date(updatedAt).toISOString().slice(0, 10)} 更新`;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0
    && normalized === value
    && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)
    && !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}
