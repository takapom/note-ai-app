import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeBlockIntoPrevious,
} from '../../apps/web/src/note-surface/state/localNoteWorkspace.ts';

test('local note workspace merges current block into previous block for delete-at-start editing', () => {
  let workspace = {
    activeNoteId: 'note_local',
    notes: [
      {
        id: 'note_local',
        title: 'Local note',
        updatedLabel: '保存済み',
        organizedResultReady: false,
        blocks: [
          { id: 'block_1', type: 'paragraph', text: '前の行' },
          { id: 'block_2', type: 'paragraph', text: '次の行' },
        ],
      },
    ],
  };
  const activeNote = workspace.notes[0];

  const result = mergeBlockIntoPrevious(activeNote, 'block_2', '次の行', (updater) => {
    workspace = updater(workspace);
  });

  assert.deepEqual(result, {
    mergedIntoBlockId: 'block_1',
    caretOffset: '前の行'.length,
  });
  assert.deepEqual(workspace.notes[0].blocks, [
    { id: 'block_1', type: 'paragraph', text: '前の行次の行' },
  ]);
  assert.equal(workspace.notes[0].updatedLabel, 'いま更新');
  assert.equal(workspace.notes[0].organizedResultReady, true);
});

test('local note workspace does not merge the first block backward', () => {
  let workspace = {
    activeNoteId: 'note_local',
    notes: [
      {
        id: 'note_local',
        title: 'Local note',
        updatedLabel: '保存済み',
        organizedResultReady: false,
        blocks: [
          { id: 'block_1', type: 'paragraph', text: '先頭' },
        ],
      },
    ],
  };
  const activeNote = workspace.notes[0];

  const result = mergeBlockIntoPrevious(activeNote, 'block_1', '先頭', (updater) => {
    workspace = updater(workspace);
  });

  assert.equal(result, undefined);
  assert.deepEqual(workspace.notes[0].blocks, [
    { id: 'block_1', type: 'paragraph', text: '先頭' },
  ]);
});
