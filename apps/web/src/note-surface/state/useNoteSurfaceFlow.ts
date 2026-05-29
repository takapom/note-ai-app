import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteSurfaceAiStatus, NoteSurfaceViewModel } from '../viewModelTypes.ts';
import { DEMO_PLACEHOLDER_TEXT } from '../demo/demoNoteSurfaceData.ts';
import {
  createEmptyNote,
  createInitialWorkspace,
  createRecentThoughts,
  hasWritableContent,
  NEW_NOTE_TITLE,
  readNoteText,
  readStoredWorkspace,
  resolveActiveNote,
  writeStoredWorkspace,
  type LocalNote,
  type LocalNoteWorkspace,
} from './localNoteWorkspace.ts';
import {
  applyLocalNoteSurfaceEditorKey,
  localNoteSurfaceEditorSavedState,
  resolveLocalNoteSurfaceEditorDraft,
  saveLocalNoteSurfaceEditorDraft,
} from './localNoteSurfaceEditorCommands.ts';
import {
  createLocalNoteSurfaceSettingsStatus,
  createLocalNoteSurfaceViewModel,
  resolveLocalNoteSurfaceFlowState,
  type NoteSurfaceFlowState,
} from './localNoteSurfaceFlowPresenter.ts';
import { focusEditableBlockSoon } from './noteSurfaceFocusScheduler.ts';
import {
  defaultNoteSurfaceSettings,
  readStoredSettings,
  writeStoredSettings,
  type NoteSurfaceSettings,
  type NoteSurfaceSettingsPatch,
  type SettingsSheetStatus,
} from './noteSurfaceSettings.ts';

type TimerHandle = ReturnType<typeof setTimeout>;

export interface EditableBlockInput {
  blockId: string;
  text: string;
}

export interface EditableBlockKeyInput extends EditableBlockInput {
  key: string;
  shiftKey: boolean;
  caretOffset?: number;
}

export interface NoteSurfaceFlowController {
  model: NoteSurfaceViewModel;
  flowState: NoteSurfaceFlowState;
  placeholderText: string;
  pendingFocusBlockId?: string;
  pendingFocusOffset?: number;
  searchOpen: boolean;
  searchQuery: string;
  settingsOpen: boolean;
  settings: NoteSurfaceSettings;
  settingsStatus: SettingsSheetStatus;
  commandMenuOpen: boolean;
  shareStatus?: string;
  onCreateNote(): void;
  onUpdateTitle(title: string): void;
  onEditableFocus(input: EditableBlockInput): void;
  onEditableInput(input: EditableBlockInput): void;
  onEditableBlur(input: EditableBlockInput): void;
  onEditableKeyDown(input: EditableBlockKeyInput): void;
  onOpenRecentThought(noteId: string): void;
  onContinueWriting(): void;
  onExpandDigest(): void;
  onCollapseDigest(): void;
  onCloseReturnLayer(): void;
  onInspectSource(): void;
  onCloseProvenance(): void;
  onRememberMemoryCandidate(blockId: string): void;
  onRejectMemoryCandidate(blockId: string): void;
  onToggleSearch(): void;
  onSearchQueryChange(query: string): void;
  onToggleSettings(): void;
  onCloseSettings(): void;
  onUpdateSettings(patch: NoteSurfaceSettingsPatch): void;
  onToggleCommandMenu(): void;
  onShareNote(): void;
  onManualOrganize(): void;
}

export function useNoteSurfaceFlow(): NoteSurfaceFlowController {
  const [workspace, setWorkspace] = useState<LocalNoteWorkspace>(createInitialWorkspace);
  const [editingBlockIds, setEditingBlockIds] = useState<readonly string[]>([]);
  const [aiStatus, setAiStatus] = useState<NoteSurfaceAiStatus>('saved');
  const [digestAvailable, setDigestAvailable] = useState(false);
  const [returnLayerOpen, setReturnLayerOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NoteSurfaceSettings>(defaultNoteSurfaceSettings);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | undefined>(undefined);
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | undefined>(undefined);
  const [pendingFocusOffset, setPendingFocusOffset] = useState<number | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const saveTimerRef = useRef<TimerHandle | undefined>(undefined);
  const latestDraftByBlockIdRef = useRef(new Map<string, string>());
  const shareTimerRef = useRef<TimerHandle | undefined>(undefined);

  useEffect(() => {
    const stored = readStoredWorkspace();
    if (stored !== undefined) {
      setWorkspace(stored);
    }
    const storedSettings = readStoredSettings();
    if (storedSettings !== undefined) {
      setSettings(storedSettings);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      writeStoredWorkspace(workspace);
    }
  }, [hydrated, workspace]);

  useEffect(() => {
    if (hydrated) {
      writeStoredSettings(settings);
    }
  }, [hydrated, settings]);

  const activeNote = useMemo(() => resolveActiveNote(workspace), [workspace]);
  const visibleRecentThoughts = useMemo(() => createRecentThoughts(workspace, searchQuery), [workspace, searchQuery]);

  const model = useMemo(() => createLocalNoteSurfaceViewModel({
    activeNote,
    aiStatus,
    editingBlockIds,
    digestAvailable,
    returnLayerOpen,
    provenanceOpen,
    memoryCandidatesVisible: settings.memoryCandidatesVisible,
    recentThoughts: visibleRecentThoughts,
  }), [activeNote, aiStatus, digestAvailable, editingBlockIds, provenanceOpen, returnLayerOpen, settings.memoryCandidatesVisible, visibleRecentThoughts]);

  const markActiveNoteChanged = useCallback((updater: (note: LocalNote) => LocalNote) => {
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === current.activeNoteId ? updater(note) : note),
    }));
  }, []);

  const applyEditorSavedState = useCallback(() => {
    setEditingBlockIds(localNoteSurfaceEditorSavedState.editingBlockIds);
    setAiStatus(localNoteSurfaceEditorSavedState.aiStatus);
    setDigestAvailable(localNoteSurfaceEditorSavedState.digestAvailable);
    setReturnLayerOpen(localNoteSurfaceEditorSavedState.returnLayerOpen);
    setProvenanceOpen(localNoteSurfaceEditorSavedState.provenanceOpen);
  }, []);

  const clearLocalSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
  }, []);

  const updateBlockText = useCallback((blockId: string, text: string, transform: boolean) => {
    latestDraftByBlockIdRef.current.set(blockId, text);
    clearLocalSaveTimer();
    markActiveNoteChanged((note) => {
      return saveLocalNoteSurfaceEditorDraft(note, { blockId, text, transform }).note;
    });
    applyEditorSavedState();
  }, [applyEditorSavedState, clearLocalSaveTimer, markActiveNoteChanged]);

  const scheduleLocalSave = useCallback((blockId: string, text: string) => {
    latestDraftByBlockIdRef.current.set(blockId, text);
    clearLocalSaveTimer();
    saveTimerRef.current = setTimeout(() => {
      markActiveNoteChanged((note) => {
        return saveLocalNoteSurfaceEditorDraft(note, { blockId, text, transform: false }).note;
      });
      applyEditorSavedState();
    }, 900);
  }, [applyEditorSavedState, clearLocalSaveTimer, markActiveNoteChanged]);

  const flowState = resolveLocalNoteSurfaceFlowState({
    activeNote,
    returnLayerOpen,
    provenanceOpen,
  });
  const settingsStatus = useMemo(() => createLocalNoteSurfaceSettingsStatus({
    activeNote,
    hydrated,
  }), [activeNote, hydrated]);

  return {
    model,
    flowState,
    placeholderText: DEMO_PLACEHOLDER_TEXT,
    ...(pendingFocusBlockId === undefined ? {} : { pendingFocusBlockId }),
    ...(pendingFocusOffset === undefined ? {} : { pendingFocusOffset }),
    searchOpen,
    searchQuery,
    settingsOpen,
    settings,
    settingsStatus,
    commandMenuOpen,
    ...(shareStatus === undefined ? {} : { shareStatus }),
    onCreateNote() {
      const nextNote = createEmptyNote(workspace.notes);
      setWorkspace((current) => ({
        activeNoteId: nextNote.id,
        notes: [nextNote, ...current.notes],
      }));
      closeTransientSurfaces();
      setPendingFocusOffset(undefined);
      if (settings.focusNewNoteBody) {
        setPendingFocusBlockId(nextNote.blocks[0]?.id);
        focusEditableBlockSoon(nextNote.blocks[0]?.id);
      } else {
        setPendingFocusBlockId(undefined);
      }
    },
    onUpdateTitle(title) {
      const normalizedTitle = title.trim().length === 0 ? NEW_NOTE_TITLE : title.trim();
      markActiveNoteChanged((note) => ({
        ...note,
        title: normalizedTitle,
        updatedLabel: 'いま更新',
      }));
    },
    onEditableFocus(input) {
      if (pendingFocusBlockId === input.blockId) {
        setPendingFocusBlockId(undefined);
        setPendingFocusOffset(undefined);
      }
    },
    onEditableInput(input) {
      scheduleLocalSave(input.blockId, input.text);
    },
    onEditableBlur(input) {
      const draft = resolveLocalNoteSurfaceEditorDraft({
        text: input.text,
        latestDraft: latestDraftByBlockIdRef.current.get(input.blockId),
      });
      updateBlockText(input.blockId, draft, settings.authoringShortcutsEnabled);
    },
    onEditableKeyDown(input) {
      const commandInput = {
        ...input,
        latestDraft: latestDraftByBlockIdRef.current.get(input.blockId),
        authoringShortcutsEnabled: settings.authoringShortcutsEnabled,
      };
      const planned = applyLocalNoteSurfaceEditorKey(activeNote, commandInput);
      if (planned.kind === 'none') {
        return;
      }

      clearLocalSaveTimer();
      markActiveNoteChanged((note) => {
        const result = applyLocalNoteSurfaceEditorKey(note, commandInput);
        return result.kind === 'none' ? note : result.note;
      });
      applyEditorSavedState();

      if (planned.kind === 'merged') {
        for (const blockId of planned.clearDraftBlockIds) {
          latestDraftByBlockIdRef.current.delete(blockId);
        }
        setPendingFocusBlockId(planned.mergedIntoBlockId);
        setPendingFocusOffset(planned.caretOffset);
        return;
      }

      const draft = resolveLocalNoteSurfaceEditorDraft({
        text: input.text,
        latestDraft: commandInput.latestDraft,
      });
      latestDraftByBlockIdRef.current.set(input.blockId, draft);
      setPendingFocusBlockId(planned.nextBlockId);
      setPendingFocusOffset(undefined);
      focusEditableBlockSoon(planned.nextBlockId);
    },
    onOpenRecentThought(noteId) {
      const target = workspace.notes.find((note) => note.id === noteId);
      const targetIsCurrent = noteId === workspace.activeNoteId;
      const targetHasWritableContent = target === undefined ? false : hasWritableContent(target);
      const shouldShowDigest = settings.digestAutoOpen && targetHasWritableContent && (target?.organizedResultReady === true || targetIsCurrent);
      setWorkspace((current) => {
        const nextNotes = current.notes.map((note) => note.id === current.activeNoteId
          ? { ...note, organizedResultReady: hasWritableContent(note) || note.organizedResultReady }
          : note);
        return { activeNoteId: noteId, notes: nextNotes };
      });
      setDigestAvailable(shouldShowDigest);
      setReturnLayerOpen(shouldShowDigest);
      setProvenanceOpen(false);
      setPendingFocusBlockId(undefined);
      setPendingFocusOffset(undefined);
      setCommandMenuOpen(false);
      setSettingsOpen(false);
      setSearchOpen(false);
    },
    onContinueWriting() {
      setReturnLayerOpen(false);
      setDigestAvailable(false);
    },
    onExpandDigest() {
      if (activeNote.organizedResultReady && hasWritableContent(activeNote)) {
        setDigestAvailable(true);
        setReturnLayerOpen(true);
      }
    },
    onCollapseDigest() {
      setReturnLayerOpen(false);
    },
    onCloseReturnLayer() {
      setReturnLayerOpen(false);
      setDigestAvailable(false);
    },
    onInspectSource() {
      setProvenanceOpen(true);
    },
    onCloseProvenance() {
      setProvenanceOpen(false);
    },
    onRememberMemoryCandidate() {
      // Memory review is a secondary MVP capability and is not surfaced in the default demo flow.
    },
    onRejectMemoryCandidate() {
      // Memory review is a secondary MVP capability and is not surfaced in the default demo flow.
    },
    onToggleSearch() {
      setSearchOpen((current) => !current);
      setSettingsOpen(false);
      setCommandMenuOpen(false);
    },
    onSearchQueryChange(query) {
      setSearchQuery(query);
    },
    onToggleSettings() {
      setSettingsOpen((current) => !current);
      setSearchOpen(false);
      setCommandMenuOpen(false);
    },
    onCloseSettings() {
      setSettingsOpen(false);
    },
    onUpdateSettings(patch) {
      setSettings((current) => ({ ...current, ...patch }));
    },
    onToggleCommandMenu() {
      setCommandMenuOpen((current) => !current);
      setSearchOpen(false);
      setSettingsOpen(false);
    },
    onShareNote() {
      const text = `${activeNote.title}\n\n${readNoteText(activeNote)}`.trim();
      void globalThis.navigator.clipboard.writeText(text).catch(() => undefined);
      setShareStatus('共有用テキストをコピーしました');
      if (shareTimerRef.current !== undefined) {
        clearTimeout(shareTimerRef.current);
      }
      shareTimerRef.current = setTimeout(() => setShareStatus(undefined), 1800);
    },
    onManualOrganize() {
      markActiveNoteChanged((note) => ({ ...note, organizedResultReady: hasWritableContent(note) }));
      if (settings.digestAutoOpen && hasWritableContent(activeNote)) {
        setDigestAvailable(true);
        setReturnLayerOpen(true);
      }
      setCommandMenuOpen(false);
    },
  };

  function closeTransientSurfaces(): void {
    setDigestAvailable(false);
    setReturnLayerOpen(false);
    setProvenanceOpen(false);
    setCommandMenuOpen(false);
    setSettingsOpen(false);
  }
}
