import { applyAuthoringShortcutToBlockContent } from '../../noteSurfaceAuthoringShortcuts.ts';
import type { NoteDocumentContract, UserBlockType } from '../../../../../contexts/note-model/src/contract/noteTypes.ts';
import type { RecentThoughtInput } from '../viewModelTypes.ts';
import { DEMO_USER_BLOCK_ID, resolveDemoRenderedBodyText } from '../demo/demoNoteSurfaceData.ts';

const WORKSPACE_ID = 'workspace_local_frontend';
export const LOCAL_NOTE_WORKSPACE_STORAGE_KEY = 'ai-native-note.local-notes.v1';
export const NEW_NOTE_TITLE = '無題のメモ';

export interface LocalNoteBlock {
  id: string;
  type: UserBlockType;
  text: string;
  headingLevel?: 1 | 2 | 3;
}

export interface LocalNote {
  id: string;
  title: string;
  blocks: readonly LocalNoteBlock[];
  updatedLabel: string;
  organizedResultReady: boolean;
}

export interface LocalNoteWorkspace {
  notes: readonly LocalNote[];
  activeNoteId: string;
}

export function createInitialWorkspace(): LocalNoteWorkspace {
  const firstNote: LocalNote = {
    id: 'local_note_1',
    title: 'プロダクトUIの方向性',
    updatedLabel: '昨日・更新',
    organizedResultReady: false,
    blocks: [{ id: DEMO_USER_BLOCK_ID, type: 'paragraph', text: '' }],
  };
  return { activeNoteId: firstNote.id, notes: [firstNote] };
}

export function createEmptyNote(existingNotes: readonly LocalNote[]): LocalNote {
  const id = createNextNoteId(existingNotes);
  return {
    id,
    title: NEW_NOTE_TITLE,
    updatedLabel: 'いま作成',
    organizedResultReady: false,
    blocks: [{ id: `${id}_block_1`, type: 'paragraph', text: '' }],
  };
}

function createNextNoteId(notes: readonly LocalNote[]): string {
  let index = notes.length + 1;
  const ids = new Set(notes.map((note) => note.id));
  while (ids.has(`local_note_${index}`)) {
    index += 1;
  }
  return `local_note_${index}`;
}

export function appendBlockAfter(
  activeNote: LocalNote,
  afterBlockId: string,
  setWorkspace: (updater: (current: LocalNoteWorkspace) => LocalNoteWorkspace) => void,
): string {
  const noteId = activeNote.id;
  const planned = appendLocalNoteBlockAfter(activeNote, afterBlockId);
  setWorkspace((current) => ({
    ...current,
    notes: current.notes.map((note) => {
      if (note.id !== noteId) {
        return note;
      }
      const next = appendLocalNoteBlockAfter(note, afterBlockId);
      return next.note;
    }),
  }));
  return planned.nextBlockId;
}

export interface AppendLocalNoteBlockAfterResult {
  note: LocalNote;
  nextBlockId: string;
}

export function appendLocalNoteBlockAfter(
  note: LocalNote,
  afterBlockId: string,
): AppendLocalNoteBlockAfterResult {
  const nextBlockId = createNextBlockId(note);
  const nextBlock: LocalNoteBlock = { id: nextBlockId, type: 'paragraph', text: '' };
  const index = note.blocks.findIndex((block) => block.id === afterBlockId);
  const insertIndex = index < 0 ? note.blocks.length : index + 1;
  return {
    note: {
      ...note,
      updatedLabel: 'いま更新',
      organizedResultReady: false,
      blocks: [
        ...note.blocks.slice(0, insertIndex),
        nextBlock,
        ...note.blocks.slice(insertIndex),
      ],
    },
    nextBlockId,
  };
}

export interface MergeBlockIntoPreviousResult {
  mergedIntoBlockId: string;
  caretOffset: number;
}

export interface MergeLocalNoteBlockIntoPreviousResult extends MergeBlockIntoPreviousResult {
  note: LocalNote;
}

export function mergeBlockIntoPrevious(
  activeNote: LocalNote,
  blockId: string,
  currentText: string,
  setWorkspace: (updater: (current: LocalNoteWorkspace) => LocalNoteWorkspace) => void,
): MergeBlockIntoPreviousResult | undefined {
  const noteId = activeNote.id;
  const planned = mergeLocalNoteBlockIntoPrevious(activeNote, blockId, currentText);
  if (planned === undefined) {
    return undefined;
  }
  setWorkspace((current) => ({
    ...current,
    notes: current.notes.map((note) => {
      if (note.id !== noteId) {
        return note;
      }

      return mergeLocalNoteBlockIntoPrevious(note, blockId, currentText)?.note ?? note;
    }),
  }));

  return {
    mergedIntoBlockId: planned.mergedIntoBlockId,
    caretOffset: planned.caretOffset,
  };
}

export function mergeLocalNoteBlockIntoPrevious(
  note: LocalNote,
  blockId: string,
  currentText: string,
): MergeLocalNoteBlockIntoPreviousResult | undefined {
  const currentIndex = note.blocks.findIndex((block) => block.id === blockId);
  if (currentIndex <= 0) {
    return undefined;
  }

  const targetIndex = currentIndex - 1;
  const targetBlock = note.blocks[targetIndex];
  const nextNote = {
    ...note,
    updatedLabel: 'いま更新',
    organizedResultReady: false,
    blocks: [
      ...note.blocks.slice(0, targetIndex),
      { ...targetBlock, text: `${targetBlock.text}${currentText}` },
      ...note.blocks.slice(currentIndex + 1),
    ],
  };

  return {
    note: {
      ...nextNote,
      organizedResultReady: hasWritableContent(nextNote),
    },
    mergedIntoBlockId: targetBlock.id,
    caretOffset: targetBlock.text.length,
  };
}

function createNextBlockId(note: LocalNote): string {
  let index = note.blocks.length + 1;
  const ids = new Set(note.blocks.map((block) => block.id));
  while (ids.has(`${note.id}_block_${index}`)) {
    index += 1;
  }
  return `${note.id}_block_${index}`;
}

export function normalizeBlockInput(block: LocalNoteBlock, text: string, transform: boolean): LocalNoteBlock {
  const plainBlock = withoutHeadingLevel(block);
  if (!transform) {
    return { ...plainBlock, text, type: block.type === 'heading' ? 'paragraph' : block.type };
  }

  const shortcut = applyAuthoringShortcutToBlockContent(text);
  if (shortcut.intent === 'heading') {
    return {
      ...plainBlock,
      type: 'heading',
      text: shortcut.content,
      headingLevel: shortcut.headingLevel ?? 2,
    };
  }
  if (shortcut.intent === 'bullet') {
    return { ...plainBlock, type: 'bullet_list_item', text: shortcut.content };
  }
  if (shortcut.intent === 'quote') {
    return { ...plainBlock, type: 'quote', text: shortcut.content };
  }
  return { ...plainBlock, type: block.type === 'heading' ? 'paragraph' : block.type, text: shortcut.content };
}

export function updateLocalNoteBlockText(
  note: LocalNote,
  blockId: string,
  text: string,
  transform: boolean,
): LocalNote {
  const nextBlocks = note.blocks.map((block) => (
    block.id === blockId ? normalizeBlockInput(block, text, transform) : block
  ));
  const nextNote = {
    ...note,
    blocks: nextBlocks,
    updatedLabel: 'いま更新',
    organizedResultReady: false,
  };
  return {
    ...nextNote,
    organizedResultReady: hasWritableContent(nextNote),
  };
}

function withoutHeadingLevel(block: LocalNoteBlock): Omit<LocalNoteBlock, 'headingLevel'> {
  const { headingLevel: _headingLevel, ...plainBlock } = block;
  return plainBlock;
}

export function createLocalDocument(note: LocalNote): NoteDocumentContract {
  const blocks = note.blocks.length === 0
    ? [{ id: `${note.id}_block_1`, type: 'paragraph' as const, text: '' }]
    : note.blocks;
  const renderedBlocks = blocks.map((block, index) => createBlockContract(note.id, block, index));
  const effectiveDescription = '保存済み ・ ローカル';
  return {
    note: {
      id: note.id,
      workspaceId: WORKSPACE_ID,
      title: note.title.trim().length === 0 ? NEW_NOTE_TITLE : note.title,
      descriptionUser: effectiveDescription,
      descriptionEffective: effectiveDescription,
      createdAt: 1_779_248_149_000,
      updatedAt: 1_779_248_149_000,
    },
    sections: [],
    blocks: renderedBlocks,
  };
}

function createBlockContract(
  noteId: string,
  block: LocalNoteBlock,
  position: number,
): NoteDocumentContract['blocks'][number] {
  const text = resolveDemoRenderedBodyText(block.text);
  if (block.type === 'heading') {
    return {
      id: block.id,
      noteId,
      type: 'heading',
      contentJson: { text, level: block.headingLevel ?? 2 },
      plainText: text,
      position,
      origin: 'user',
      contentHash: `hash_${block.id}_${position}_${text.length}`,
      createdAt: 1_779_248_149_000,
      updatedAt: 1_779_248_149_000,
    };
  }

  return {
    id: block.id,
    noteId,
    type: block.type,
    contentJson: block.type === 'todo'
      ? { text, checked: false }
      : block.type === 'divider'
        ? { variant: 'line' }
        : { text },
    plainText: block.type === 'divider' ? '---' : text,
    position,
    origin: 'user',
    contentHash: `hash_${block.id}_${position}_${text.length}`,
    createdAt: 1_779_248_149_000,
    updatedAt: 1_779_248_149_000,
  };
}

export function resolveActiveNote(workspace: LocalNoteWorkspace): LocalNote {
  if (workspace.notes.length === 0) {
    return createEmptyNote([]);
  }
  return workspace.notes.find((note) => note.id === workspace.activeNoteId) ?? workspace.notes[0];
}

export function createRecentThoughts(workspace: LocalNoteWorkspace, query: string): readonly RecentThoughtInput[] {
  const normalizedQuery = query.trim().toLowerCase();
  return workspace.notes
    .filter((note) => normalizedQuery.length === 0 || note.title.toLowerCase().includes(normalizedQuery) || readNoteText(note).toLowerCase().includes(normalizedQuery))
    .map((note) => ({
      id: note.id,
      title: note.title,
      updatedLabel: note.updatedLabel,
      active: note.id === workspace.activeNoteId,
    }));
}

export function hasWritableContent(note: LocalNote): boolean {
  return note.blocks.some((block) => block.text.trim().length > 0);
}

export function readNoteText(note: LocalNote): string {
  return note.blocks.map((block) => block.text.trim()).filter(Boolean).join('\n');
}

export function readStoredWorkspace(): LocalNoteWorkspace | undefined {
  try {
    const raw = globalThis.localStorage.getItem(LOCAL_NOTE_WORKSPACE_STORAGE_KEY);
    if (raw === null) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<LocalNoteWorkspace>;
    if (!Array.isArray(parsed.notes) || typeof parsed.activeNoteId !== 'string') {
      return undefined;
    }
    const notes = parsed.notes.filter(isLocalNote);
    if (notes.length === 0) {
      return undefined;
    }
    return {
      notes,
      activeNoteId: notes.some((note) => note.id === parsed.activeNoteId) ? parsed.activeNoteId : notes[0].id,
    };
  } catch {
    return undefined;
  }
}

export function writeStoredWorkspace(workspace: LocalNoteWorkspace): void {
  try {
    globalThis.localStorage.setItem(LOCAL_NOTE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // Local persistence is a convenience for the demo app; failure must not block writing.
  }
}

function isLocalNote(value: unknown): value is LocalNote {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<LocalNote>;
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && Array.isArray(candidate.blocks)
    && candidate.blocks.every(isLocalNoteBlock);
}

function isLocalNoteBlock(value: unknown): value is LocalNoteBlock {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<LocalNoteBlock>;
  return typeof candidate.id === 'string'
    && typeof candidate.type === 'string'
    && typeof candidate.text === 'string';
}
