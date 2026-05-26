import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNoteSurfaceViewModel } from '../noteSurfacePresenter.ts';
import type { NoteSurfaceAiStatus, NoteSurfaceViewModel } from '../viewModelTypes.ts';
import { createDemoDigestInput, createDemoProvenanceInput, DEMO_PLACEHOLDER_TEXT } from '../demo/demoNoteSurfaceData.ts';
import {
  appendBlockAfter,
  createEmptyNote,
  createInitialWorkspace,
  createLocalDocument,
  createRecentThoughts,
  hasWritableContent,
  mergeBlockIntoPrevious,
  NEW_NOTE_TITLE,
  normalizeBlockInput,
  readNoteText,
  readStoredWorkspace,
  resolveActiveNote,
  writeStoredWorkspace,
  type LocalNote,
  type LocalNoteWorkspace,
} from './localNoteWorkspace.ts';

type TimerHandle = ReturnType<typeof setTimeout>;

export type NoteSurfaceFlowState = 'write' | 'writing' | 'return' | 'provenance';
export type WritingDensitySetting = 'standard' | 'spacious';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type MotionSetting = 'system' | 'reduced';
export type SettingsSheetPositionSetting = 'left' | 'right';

export interface NoteSurfaceSettings {
  authoringShortcutsEnabled: boolean;
  focusNewNoteBody: boolean;
  digestAutoOpen: boolean;
  memoryCandidatesVisible: boolean;
  sourceButtonsAlwaysVisible: boolean;
  writingDensity: WritingDensitySetting;
  theme: ThemeSetting;
  motion: MotionSetting;
  settingsSheetPosition: SettingsSheetPositionSetting;
}

export type NoteSurfaceSettingsPatch = Partial<NoteSurfaceSettings>;

export interface SettingsSheetStatus {
  localDraftStatus: string;
  digestStatus: string;
}

export const NOTE_SURFACE_SETTINGS_STORAGE_KEY = 'ai-native-note.settings.v1';

export const defaultNoteSurfaceSettings: NoteSurfaceSettings = {
  authoringShortcutsEnabled: true,
  focusNewNoteBody: true,
  digestAutoOpen: true,
  memoryCandidatesVisible: false,
  sourceButtonsAlwaysVisible: true,
  writingDensity: 'standard',
  theme: 'system',
  motion: 'system',
  settingsSheetPosition: 'right',
};

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

function focusEditableBlockSoon(blockId: string | undefined): void {
  if (blockId === undefined) {
    return;
  }
  globalThis.setTimeout(() => {
    const target = globalThis.document.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-block-editor-content="true"]`);
    target?.focus();
  }, 80);
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
  const activeNoteText = useMemo(() => readNoteText(activeNote), [activeNote]);
  const visibleRecentThoughts = useMemo(() => createRecentThoughts(workspace, searchQuery), [workspace, searchQuery]);

  const model = useMemo(() => createNoteSurfaceViewModel(createLocalDocument(activeNote), {
    workspaceName: 'ANN',
    recentThoughts: visibleRecentThoughts,
    aiStatus,
    editingBlockIds,
    sourceSpanIdByBlockId: {},
    memoryCandidatesVisible: settings.memoryCandidatesVisible,
    returnLayerVisible: false,
    nextOpenDigest: digestAvailable ? createDemoDigestInput(activeNoteText) : { available: false },
    returnLayerOpen,
    provenancePopover: provenanceOpen ? createDemoProvenanceInput(activeNoteText) : { open: false },
  }), [activeNote, activeNoteText, aiStatus, digestAvailable, editingBlockIds, provenanceOpen, returnLayerOpen, settings.memoryCandidatesVisible, visibleRecentThoughts]);

  const markActiveNoteChanged = useCallback((updater: (note: LocalNote) => LocalNote) => {
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === current.activeNoteId ? updater(note) : note),
    }));
  }, []);

  const updateBlockText = useCallback((blockId: string, text: string, transform: boolean) => {
    latestDraftByBlockIdRef.current.set(blockId, text);
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current);
    }
    markActiveNoteChanged((note) => {
      const nextBlocks = note.blocks.map((block) => block.id === blockId ? normalizeBlockInput(block, text, transform) : block);
      const nextNote = { ...note, blocks: nextBlocks, updatedLabel: 'いま更新', organizedResultReady: false };
      return {
        ...nextNote,
        organizedResultReady: hasWritableContent(nextNote),
      };
    });
    setEditingBlockIds([]);
    setAiStatus('saved');
    setDigestAvailable(false);
    setReturnLayerOpen(false);
    setProvenanceOpen(false);
  }, [markActiveNoteChanged]);

  const scheduleLocalSave = useCallback((blockId: string, text: string) => {
    latestDraftByBlockIdRef.current.set(blockId, text);
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      markActiveNoteChanged((note) => {
        const nextBlocks = note.blocks.map((block) => block.id === blockId ? normalizeBlockInput(block, text, false) : block);
        const nextNote = { ...note, blocks: nextBlocks, updatedLabel: 'いま更新', organizedResultReady: false };
        return {
          ...nextNote,
          organizedResultReady: hasWritableContent(nextNote),
        };
      });
      setEditingBlockIds([]);
      setAiStatus('saved');
      setDigestAvailable(false);
      setReturnLayerOpen(false);
      setProvenanceOpen(false);
    }, 900);
  }, [markActiveNoteChanged]);

  const flowState = resolveFlowState({
    note: activeNote,
    returnLayerOpen,
    provenanceOpen,
  });
  const settingsStatus = useMemo(() => ({
    localDraftStatus: hydrated ? 'ローカル保存中' : '読み込み中',
    digestStatus: activeNote.organizedResultReady && hasWritableContent(activeNote)
      ? '次に戻る入口があります'
      : '整理待ちはありません',
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
      const draft = input.text.length > 0 ? input.text : (latestDraftByBlockIdRef.current.get(input.blockId) ?? input.text);
      updateBlockText(input.blockId, draft, settings.authoringShortcutsEnabled);
    },
    onEditableKeyDown(input) {
      if ((input.key === 'Backspace' || input.key === 'Delete') && !input.shiftKey && input.caretOffset === 0) {
        const draft = latestDraftByBlockIdRef.current.get(input.blockId) ?? input.text;
        if (saveTimerRef.current !== undefined) {
          clearTimeout(saveTimerRef.current);
        }
        const mergeResult = mergeBlockIntoPrevious(activeNote, input.blockId, draft, setWorkspace);
        if (mergeResult !== undefined) {
          latestDraftByBlockIdRef.current.delete(input.blockId);
          latestDraftByBlockIdRef.current.delete(mergeResult.mergedIntoBlockId);
          setPendingFocusBlockId(mergeResult.mergedIntoBlockId);
          setPendingFocusOffset(mergeResult.caretOffset);
          setEditingBlockIds([]);
          setAiStatus('saved');
          setDigestAvailable(false);
          setReturnLayerOpen(false);
          setProvenanceOpen(false);
        }
        return;
      }

      if (input.key !== 'Enter' || input.shiftKey) {
        return;
      }
      const draft = input.text.length > 0 ? input.text : (latestDraftByBlockIdRef.current.get(input.blockId) ?? input.text);
      updateBlockText(input.blockId, draft, settings.authoringShortcutsEnabled);
      const nextBlockId = appendBlockAfter(activeNote, input.blockId, setWorkspace);
      setPendingFocusBlockId(nextBlockId);
      setPendingFocusOffset(undefined);
      focusEditableBlockSoon(nextBlockId);
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

export function readStoredSettings(): NoteSurfaceSettings | undefined {
  try {
    const raw = globalThis.localStorage.getItem(NOTE_SURFACE_SETTINGS_STORAGE_KEY);
    if (raw === null) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<NoteSurfaceSettings>;
    return normalizeStoredSettings(parsed);
  } catch {
    return undefined;
  }
}

export function writeStoredSettings(settings: NoteSurfaceSettings): void {
  try {
    globalThis.localStorage.setItem(NOTE_SURFACE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Local settings are convenience preferences; writing must stay available without them.
  }
}

function normalizeStoredSettings(candidate: Partial<NoteSurfaceSettings>): NoteSurfaceSettings {
  return {
    authoringShortcutsEnabled: typeof candidate.authoringShortcutsEnabled === 'boolean'
      ? candidate.authoringShortcutsEnabled
      : defaultNoteSurfaceSettings.authoringShortcutsEnabled,
    focusNewNoteBody: typeof candidate.focusNewNoteBody === 'boolean'
      ? candidate.focusNewNoteBody
      : defaultNoteSurfaceSettings.focusNewNoteBody,
    digestAutoOpen: typeof candidate.digestAutoOpen === 'boolean'
      ? candidate.digestAutoOpen
      : defaultNoteSurfaceSettings.digestAutoOpen,
    memoryCandidatesVisible: typeof candidate.memoryCandidatesVisible === 'boolean'
      ? candidate.memoryCandidatesVisible
      : defaultNoteSurfaceSettings.memoryCandidatesVisible,
    sourceButtonsAlwaysVisible: typeof candidate.sourceButtonsAlwaysVisible === 'boolean'
      ? candidate.sourceButtonsAlwaysVisible
      : defaultNoteSurfaceSettings.sourceButtonsAlwaysVisible,
    writingDensity: candidate.writingDensity === 'spacious' ? 'spacious' : defaultNoteSurfaceSettings.writingDensity,
    theme: candidate.theme === 'light' || candidate.theme === 'dark' ? candidate.theme : defaultNoteSurfaceSettings.theme,
    motion: candidate.motion === 'reduced' ? 'reduced' : defaultNoteSurfaceSettings.motion,
    settingsSheetPosition: candidate.settingsSheetPosition === 'left' ? 'left' : defaultNoteSurfaceSettings.settingsSheetPosition,
  };
}

function resolveFlowState(input: {
  note: LocalNote;
  returnLayerOpen: boolean;
  provenanceOpen: boolean;
}): NoteSurfaceFlowState {
  if (input.provenanceOpen) {
    return 'provenance';
  }
  if (input.returnLayerOpen) {
    return 'return';
  }
  if (hasWritableContent(input.note)) {
    return 'writing';
  }
  return 'write';
}
