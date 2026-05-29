import type { NoteSurfaceAiStatus } from '../viewModelTypes.ts';
import {
  appendLocalNoteBlockAfter,
  mergeLocalNoteBlockIntoPrevious,
  updateLocalNoteBlockText,
  type LocalNote,
} from './localNoteWorkspace.ts';

export interface LocalNoteSurfaceEditorSavedState {
  editingBlockIds: readonly string[];
  aiStatus: NoteSurfaceAiStatus;
  digestAvailable: boolean;
  returnLayerOpen: boolean;
  provenanceOpen: boolean;
}

export const localNoteSurfaceEditorSavedState: LocalNoteSurfaceEditorSavedState = {
  editingBlockIds: [],
  aiStatus: 'saved',
  digestAvailable: false,
  returnLayerOpen: false,
  provenanceOpen: false,
};

export interface LocalNoteSurfaceEditorDraftInput {
  text: string;
  latestDraft?: string | undefined;
}

export function resolveLocalNoteSurfaceEditorDraft(input: LocalNoteSurfaceEditorDraftInput): string {
  return input.text.length > 0 ? input.text : (input.latestDraft ?? input.text);
}

export interface SaveLocalNoteSurfaceEditorDraftInput {
  blockId: string;
  text: string;
  transform: boolean;
}

export interface SaveLocalNoteSurfaceEditorDraftResult {
  note: LocalNote;
  editorState: LocalNoteSurfaceEditorSavedState;
}

export function saveLocalNoteSurfaceEditorDraft(
  note: LocalNote,
  input: SaveLocalNoteSurfaceEditorDraftInput,
): SaveLocalNoteSurfaceEditorDraftResult {
  return {
    note: updateLocalNoteBlockText(note, input.blockId, input.text, input.transform),
    editorState: localNoteSurfaceEditorSavedState,
  };
}

export interface LocalNoteSurfaceEditorKeyInput {
  blockId: string;
  text: string;
  key: string;
  shiftKey: boolean;
  caretOffset?: number | undefined;
  latestDraft?: string | undefined;
  authoringShortcutsEnabled: boolean;
}

export type LocalNoteSurfaceEditorKeyResult =
  | { kind: 'none' }
  | {
      kind: 'merged';
      note: LocalNote;
      mergedIntoBlockId: string;
      caretOffset: number;
      clearDraftBlockIds: readonly string[];
      editorState: LocalNoteSurfaceEditorSavedState;
    }
  | {
      kind: 'appended';
      note: LocalNote;
      nextBlockId: string;
      editorState: LocalNoteSurfaceEditorSavedState;
    };

export function applyLocalNoteSurfaceEditorKey(
  note: LocalNote,
  input: LocalNoteSurfaceEditorKeyInput,
): LocalNoteSurfaceEditorKeyResult {
  if (isMergeIntoPreviousKey(input)) {
    const draft = input.latestDraft ?? input.text;
    const mergeResult = mergeLocalNoteBlockIntoPrevious(note, input.blockId, draft);
    return mergeResult === undefined
      ? { kind: 'none' }
      : {
          kind: 'merged',
          note: mergeResult.note,
          mergedIntoBlockId: mergeResult.mergedIntoBlockId,
          caretOffset: mergeResult.caretOffset,
          clearDraftBlockIds: [input.blockId, mergeResult.mergedIntoBlockId],
          editorState: localNoteSurfaceEditorSavedState,
        };
  }

  if (input.key !== 'Enter' || input.shiftKey) {
    return { kind: 'none' };
  }

  const draft = resolveLocalNoteSurfaceEditorDraft({
    text: input.text,
    latestDraft: input.latestDraft,
  });
  const savedNote = updateLocalNoteBlockText(note, input.blockId, draft, input.authoringShortcutsEnabled);
  const appendResult = appendLocalNoteBlockAfter(savedNote, input.blockId);
  return {
    kind: 'appended',
    note: appendResult.note,
    nextBlockId: appendResult.nextBlockId,
    editorState: localNoteSurfaceEditorSavedState,
  };
}

function isMergeIntoPreviousKey(input: LocalNoteSurfaceEditorKeyInput): boolean {
  return (
    (input.key === 'Backspace' || input.key === 'Delete')
    && !input.shiftKey
    && input.caretOffset === 0
  );
}
