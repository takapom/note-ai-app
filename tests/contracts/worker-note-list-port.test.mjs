import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryNoteListPort,
  noteDocumentToListItem,
  validateNoteListRequest,
} from '../../apps/worker/src/note-model/noteListPort.ts';
import {
  noteDocumentFixture,
  noteFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('in-memory note list port returns workspace-scoped note summaries only', async () => {
  const olderDocument = {
    ...noteDocumentFixture,
    note: {
      ...noteFixture,
      id: 'note_older',
      title: 'Older note',
      updatedAt: 1_000,
    },
    sections: [],
    blocks: [],
  };
  const newerDocument = {
    ...noteDocumentFixture,
    note: {
      ...noteFixture,
      id: 'note_newer',
      title: 'Newer note',
      descriptionEffective: 'Latest workspace note',
      updatedAt: 2_000,
    },
    sections: [],
    blocks: [],
  };
  const otherWorkspaceDocument = {
    ...noteDocumentFixture,
    note: {
      ...noteFixture,
      id: 'note_other_workspace',
      workspaceId: 'workspace_other',
      title: 'Other workspace note',
      updatedAt: 3_000,
    },
    sections: [],
    blocks: [],
  };
  const port = new InMemoryNoteListPort([
    olderDocument,
    newerDocument,
    otherWorkspaceDocument,
  ]);

  const result = await port.listNotes({ workspaceId: noteFixture.workspaceId });

  assert.equal(result.ok, true);
  assert.deepEqual(result.notes, [
    noteDocumentToListItem(newerDocument),
    noteDocumentToListItem(olderDocument),
  ]);
});

test('note list port returns cloned summaries instead of mutable internal state', async () => {
  const port = new InMemoryNoteListPort([noteDocumentFixture]);
  const first = await port.listNotes({ workspaceId: noteFixture.workspaceId });

  first.notes[0].title = 'mutated outside the port';

  const second = await port.listNotes({ workspaceId: noteFixture.workspaceId });
  assert.equal(second.notes[0].title, noteFixture.title);
});

test('note list request rejects invalid identity primitives', () => {
  assert.deepEqual(validateNoteListRequest({
    workspaceId: '',
  }), [
    'workspaceId must be a non-empty string',
  ]);
});
