import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyLocalNoteSurfaceEditorKey,
  localNoteSurfaceEditorSavedState,
  resolveLocalNoteSurfaceEditorDraft,
  saveLocalNoteSurfaceEditorDraft,
} from '../../apps/web/src/note-surface/state/localNoteSurfaceEditorCommands.ts';

const baseNote = {
  id: 'note_local',
  title: 'Local note',
  updatedLabel: '保存済み',
  organizedResultReady: false,
  blocks: [
    { id: 'block_1', type: 'paragraph', text: '前の行' },
    { id: 'block_2', type: 'paragraph', text: '次の行' },
  ],
};

test('local editor command resolves empty blur text from the latest draft', () => {
  assert.equal(resolveLocalNoteSurfaceEditorDraft({
    text: '',
    latestDraft: 'draft text',
  }), 'draft text');
  assert.equal(resolveLocalNoteSurfaceEditorDraft({
    text: 'current text',
    latestDraft: 'draft text',
  }), 'current text');
});

test('local editor command saves block text and returns the common saved editor state', () => {
  const result = saveLocalNoteSurfaceEditorDraft(baseNote, {
    blockId: 'block_2',
    text: '## Updated heading',
    transform: true,
  });

  assert.deepEqual(result.editorState, localNoteSurfaceEditorSavedState);
  assert.deepEqual(result.note.blocks[1], {
    id: 'block_2',
    type: 'heading',
    text: 'Updated heading',
    headingLevel: 2,
  });
  assert.equal(result.note.updatedLabel, 'いま更新');
  assert.equal(result.note.organizedResultReady, true);
});

test('local editor command appends a new block after saving Enter content', () => {
  const result = applyLocalNoteSurfaceEditorKey(baseNote, {
    blockId: 'block_2',
    text: '',
    latestDraft: '- appended item',
    key: 'Enter',
    shiftKey: false,
    authoringShortcutsEnabled: true,
  });

  assert.equal(result.kind, 'appended');
  assert.equal(result.nextBlockId, 'note_local_block_3');
  assert.deepEqual(result.editorState, localNoteSurfaceEditorSavedState);
  assert.deepEqual(result.note.blocks, [
    { id: 'block_1', type: 'paragraph', text: '前の行' },
    { id: 'block_2', type: 'bullet_list_item', text: 'appended item' },
    { id: 'note_local_block_3', type: 'paragraph', text: '' },
  ]);
});

test('local editor command merges into previous block at start of block', () => {
  const result = applyLocalNoteSurfaceEditorKey(baseNote, {
    blockId: 'block_2',
    text: '次の行',
    key: 'Backspace',
    shiftKey: false,
    caretOffset: 0,
    authoringShortcutsEnabled: true,
  });

  assert.equal(result.kind, 'merged');
  assert.equal(result.mergedIntoBlockId, 'block_1');
  assert.equal(result.caretOffset, '前の行'.length);
  assert.deepEqual(result.clearDraftBlockIds, ['block_2', 'block_1']);
  assert.deepEqual(result.editorState, localNoteSurfaceEditorSavedState);
  assert.deepEqual(result.note.blocks, [
    { id: 'block_1', type: 'paragraph', text: '前の行次の行' },
  ]);
});

test('local editor command ignores shifted enter and first-block backspace', () => {
  assert.deepEqual(applyLocalNoteSurfaceEditorKey(baseNote, {
    blockId: 'block_2',
    text: '次の行',
    key: 'Enter',
    shiftKey: true,
    authoringShortcutsEnabled: true,
  }), { kind: 'none' });
  assert.deepEqual(applyLocalNoteSurfaceEditorKey(baseNote, {
    blockId: 'block_1',
    text: '前の行',
    key: 'Backspace',
    shiftKey: false,
    caretOffset: 0,
    authoringShortcutsEnabled: true,
  }), { kind: 'none' });
});
