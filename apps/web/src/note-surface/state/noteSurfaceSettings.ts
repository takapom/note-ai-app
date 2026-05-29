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
