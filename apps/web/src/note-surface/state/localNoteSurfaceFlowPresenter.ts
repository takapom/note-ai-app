import { createDemoDigestInput, createDemoProvenanceInput } from '../demo/demoNoteSurfaceData.ts';
import { createNoteSurfaceViewModel } from '../noteSurfacePresenter.ts';
import type { NoteSurfaceAiStatus, NoteSurfaceViewModel, RecentThoughtInput } from '../viewModelTypes.ts';
import {
  createLocalDocument,
  hasWritableContent,
  readNoteText,
  type LocalNote,
} from './localNoteWorkspace.ts';
import type { SettingsSheetStatus } from './noteSurfaceSettings.ts';

export type NoteSurfaceFlowState = 'write' | 'writing' | 'return' | 'provenance';

export interface LocalNoteSurfaceViewModelInput {
  activeNote: LocalNote;
  aiStatus: NoteSurfaceAiStatus;
  editingBlockIds: readonly string[];
  digestAvailable: boolean;
  returnLayerOpen: boolean;
  provenanceOpen: boolean;
  memoryCandidatesVisible: boolean;
  recentThoughts: readonly RecentThoughtInput[];
}

export function createLocalNoteSurfaceViewModel(input: LocalNoteSurfaceViewModelInput): NoteSurfaceViewModel {
  const activeNoteText = readNoteText(input.activeNote);
  return createNoteSurfaceViewModel(createLocalDocument(input.activeNote), {
    workspaceName: 'ANN',
    recentThoughts: input.recentThoughts,
    aiStatus: input.aiStatus,
    editingBlockIds: input.editingBlockIds,
    sourceSpanIdByBlockId: {},
    memoryCandidatesVisible: input.memoryCandidatesVisible,
    returnLayerVisible: false,
    nextOpenDigest: input.digestAvailable ? createDemoDigestInput(activeNoteText) : { available: false },
    returnLayerOpen: input.returnLayerOpen,
    provenancePopover: input.provenanceOpen ? createDemoProvenanceInput(activeNoteText) : { open: false },
  });
}

export function createLocalNoteSurfaceSettingsStatus(input: {
  activeNote: LocalNote;
  hydrated: boolean;
}): SettingsSheetStatus {
  return {
    localDraftStatus: input.hydrated ? 'ローカル保存中' : '読み込み中',
    digestStatus: input.activeNote.organizedResultReady && hasWritableContent(input.activeNote)
      ? '次に戻る入口があります'
      : '整理待ちはありません',
  };
}

export function resolveLocalNoteSurfaceFlowState(input: {
  activeNote: LocalNote;
  returnLayerOpen: boolean;
  provenanceOpen: boolean;
}): NoteSurfaceFlowState {
  if (input.provenanceOpen) {
    return 'provenance';
  }
  if (input.returnLayerOpen) {
    return 'return';
  }
  if (hasWritableContent(input.activeNote)) {
    return 'writing';
  }
  return 'write';
}
