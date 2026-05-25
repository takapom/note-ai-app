import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeNoteTitleDraft,
  shouldCommitNoteTitleKey,
} from '../../apps/web/src/note-surface/noteTitleEditor.ts';

test('note title editor commits Enter only outside IME composition', () => {
  assert.equal(shouldCommitNoteTitleKey({ key: 'Enter' }), true);
  assert.equal(shouldCommitNoteTitleKey({ key: 'Enter', shiftKey: true }), false);
  assert.equal(shouldCommitNoteTitleKey({ key: 'Enter', isComposing: true }), false);
  assert.equal(shouldCommitNoteTitleKey({ key: 'Enter', keyCode: 229 }), false);
  assert.equal(shouldCommitNoteTitleKey({ key: 'a' }), false);
});

test('note title draft normalizes pasted line breaks without duplicating title rows', () => {
  assert.equal(normalizeNoteTitleDraft('  次の方針  ', '前のタイトル'), '次の方針');
  assert.equal(normalizeNoteTitleDraft('次の方針\n\n補足', '前のタイトル'), '次の方針 補足');
  assert.equal(normalizeNoteTitleDraft(' \n ', '前のタイトル'), '前のタイトル');
});

test('React note title editor uses a single-purpose textarea instead of contenteditable', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/note-surface/components/NoteHeader.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /<textarea/);
  assert.match(source, /shouldCommitNoteTitleKey/);
  assert.doesNotMatch(source, /contentEditable|suppressContentEditableWarning/);
});
