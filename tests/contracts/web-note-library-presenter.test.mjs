import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createFailedNoteLibraryStatus,
  createNoteLibraryViewStateFromListBody,
} from '../../apps/web/src/note-surface/noteLibraryPresenter.ts';

test('note library presenter maps backend summaries to recent thoughts without reordering', () => {
  const result = createNoteLibraryViewStateFromListBody({
    ok: true,
    notes: [
      {
        noteId: 'note_002',
        title: 'Second note',
        descriptionEffective: 'Summary is optional for the rail.',
        createdAt: 1_764_086_400_000,
        updatedAt: 1_764_086_400_000,
      },
      {
        noteId: 'note_001',
        title: 'First note',
        createdAt: 1_764_000_000_000,
        updatedAt: 1_764_000_000_000,
      },
    ],
  }, 'note_001');

  assert.deepEqual(result, {
    recentThoughts: [
      {
        id: 'note_002',
        title: 'Second note',
        updatedLabel: '2025-11-25 更新',
        active: false,
      },
      {
        id: 'note_001',
        title: 'First note',
        updatedLabel: '2025-11-24 更新',
        active: true,
      },
    ],
    errors: [],
  });
});

test('note library presenter keeps empty and invalid list states explicit', () => {
  assert.deepEqual(createNoteLibraryViewStateFromListBody({
    ok: true,
    notes: [],
  }, 'note_001'), {
    recentThoughts: [],
    noteLibraryStatus: {
      state: 'empty',
      label: 'メモはまだありません',
    },
    errors: [],
  });

  const invalid = createNoteLibraryViewStateFromListBody({
    ok: true,
    notes: [{
      noteId: 'note/001',
      title: '',
      createdAt: 1_764_000_000_000,
      updatedAt: Number.NaN,
    }],
  }, 'note_001');

  assert.equal(invalid.noteLibraryStatus?.state, 'invalid');
  assert.equal(invalid.noteLibraryStatus?.label, 'メモ一覧を読み取れませんでした');
  assert.match(invalid.errors.join('\n'), /noteId must be a stable/);
  assert.match(invalid.errors.join('\n'), /title must be a non-empty string/);
  assert.match(invalid.errors.join('\n'), /updatedAt must be a valid timestamp/);
});

test('note library presenter exposes a stable failed status for transport errors', () => {
  assert.deepEqual(createFailedNoteLibraryStatus(), {
    state: 'failed',
    label: 'メモ一覧を読み込めませんでした',
  });
});

test('note library presenter stays presentation-only', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/note-surface/noteLibraryPresenter.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /fetch\(|globalThis\.fetch|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /crypto\.randomUUID|Math\.random/);
});
