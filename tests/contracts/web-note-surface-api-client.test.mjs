import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceApiClient } from '../../apps/web/src/runtime/api-client/noteSurfaceApiClient.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('note surface API client maps note and block commands to Worker routes', async () => {
  const calls = [];
  const client = createNoteSurfaceApiClient({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls),
    ...metadata,
  });

  await client.listNotes();
  await client.getNote({ noteId: 'note_001' });
  await client.createBlock({
    noteId: 'note_001',
    content: 'New backend-owned paragraph.',
    afterBlockId: 'block_paragraph_001',
  });
  await client.patchBlock({
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    content: 'Updated paragraph.',
  });
  await client.deleteBlock({
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
  });
  await client.leaveNote({
    noteId: 'note_001',
    cause: 'tab_switch',
  });
  await client.manualStructure({ noteId: 'note_001' });
  await client.getDigest({ noteId: 'note_001' });
  await client.acceptOperation({ operationId: 'operation_accept_001' });
  await client.dismissOperation({ operationId: 'operation_dismiss_001' });
  await client.acceptMemory({ memoryId: 'memory_accept_001' });
  await client.rejectMemory({ memoryId: 'memory_reject_001' });
  await client.editMemory({
    memoryId: 'memory_edit_001',
    content: 'Updated source-backed memory candidate.',
  });
  await client.holdMemory({ memoryId: 'memory_hold_001' });
  await client.deleteMemory({ memoryId: 'memory_delete_001' });

  assert.deepEqual(calls.map((call) => [call.init.method, call.url, call.init.body]), [
    ['GET', 'https://worker.example.test/api/notes', undefined],
    ['GET', 'https://worker.example.test/api/notes/note_001', undefined],
    [
      'POST',
      'https://worker.example.test/api/notes/note_001/blocks',
      JSON.stringify({
        content: 'New backend-owned paragraph.',
        afterBlockId: 'block_paragraph_001',
      }),
    ],
    [
      'PATCH',
      'https://worker.example.test/api/blocks/block_paragraph_001',
      JSON.stringify({
        noteId: 'note_001',
        content: 'Updated paragraph.',
      }),
    ],
    [
      'DELETE',
      'https://worker.example.test/api/blocks/block_paragraph_001',
      JSON.stringify({
        noteId: 'note_001',
      }),
    ],
    [
      'POST',
      'https://worker.example.test/api/notes/note_001/leave',
      JSON.stringify({
        cause: 'tab_switch',
      }),
    ],
    ['POST', 'https://worker.example.test/api/notes/note_001/structure/manual', undefined],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest', undefined],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_accept_001/accept', undefined],
    ['POST', 'https://worker.example.test/api/ai-operations/operation_dismiss_001/dismiss', undefined],
    ['POST', 'https://worker.example.test/api/memory/memory_accept_001/accept', undefined],
    ['POST', 'https://worker.example.test/api/memory/memory_reject_001/reject', undefined],
    [
      'POST',
      'https://worker.example.test/api/memory/memory_edit_001/edit',
      JSON.stringify({
        content: 'Updated source-backed memory candidate.',
      }),
    ],
    ['POST', 'https://worker.example.test/api/memory/memory_hold_001/hold', undefined],
    ['POST', 'https://worker.example.test/api/memory/memory_delete_001/delete', undefined],
  ]);
});

test('note surface API client rejects invalid ids before calling fetch-like binding', async () => {
  let fetchCalls = 0;
  const client = createNoteSurfaceApiClient({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {};
        },
      };
    },
    ...metadata,
  });

  const getNote = await client.getNote({ noteId: 'note/001' });
  const deleteBlock = await client.deleteBlock({
    noteId: 'note_001',
    blockId: 'block/paragraph/001',
  });

  assert.equal(getNote.ok, false);
  assert.deepEqual(getNote.errors, ['noteId must be a stable non-sentinel runtime id']);
  assert.equal(deleteBlock.ok, false);
  assert.match(deleteBlock.errors.join('\n'), /blockId must be a single path segment/);
  assert.equal(fetchCalls, 0);
});

test('note surface API client source stays inside injected transport boundary', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/runtime/api-client/noteSurfaceApiClient.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceApiClient/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /globalThis\.fetch|window\.fetch|fetch\s*\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
});

function createFetchLike(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true };
      },
    };
  };
}
