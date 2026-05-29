import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTE_SURFACE_SETTINGS_STORAGE_KEY,
  defaultNoteSurfaceSettings,
  readStoredSettings,
  writeStoredSettings,
} from '../../apps/web/src/note-surface/state/noteSurfaceSettings.ts';

test('web note surface settings persist frontend-owned MVP preferences locally', () => {
  const storage = installLocalStorageMock();
  const settings = {
    ...defaultNoteSurfaceSettings,
    authoringShortcutsEnabled: false,
    focusNewNoteBody: false,
    digestAutoOpen: false,
    memoryCandidatesVisible: false,
    sourceButtonsAlwaysVisible: false,
    writingDensity: 'spacious',
    theme: 'dark',
    motion: 'reduced',
    settingsSheetPosition: 'left',
  };

  writeStoredSettings(settings);

  assert.equal(storage.has(NOTE_SURFACE_SETTINGS_STORAGE_KEY), true);
  assert.deepEqual(readStoredSettings(), settings);
});

test('web note surface settings ignore unsupported persisted values', () => {
  const storage = installLocalStorageMock();
  storage.set(NOTE_SURFACE_SETTINGS_STORAGE_KEY, JSON.stringify({
    authoringShortcutsEnabled: 'yes',
    focusNewNoteBody: false,
    digestAutoOpen: true,
    memoryCandidatesVisible: null,
    sourceButtonsAlwaysVisible: false,
    writingDensity: 'dense',
    theme: 'purple',
    motion: 'animated',
    settingsSheetPosition: 'middle',
  }));

  assert.deepEqual(readStoredSettings(), {
    ...defaultNoteSurfaceSettings,
    focusNewNoteBody: false,
    digestAutoOpen: true,
    sourceButtonsAlwaysVisible: false,
  });
});

function installLocalStorageMock() {
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
  });
  return storage;
}
