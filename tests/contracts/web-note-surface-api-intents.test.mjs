import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createNoteSurfaceApiRequest,
  mapNoteSurfaceIntentToWorkerRequest,
} from '../../apps/web/src/noteSurfaceApiIntents.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('AI assist accept and dismiss map to operation review Worker requests', () => {
  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'ai_assist.accept',
      ...metadata,
      operationId: 'operation_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/ai-operations/operation_001/accept',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    mapNoteSurfaceIntentToWorkerRequest({
      intent: 'ai_assist.dismiss',
      ...metadata,
      operationId: 'operation_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/ai-operations/operation_001/dismiss',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );
});

test('memory remember and reject map to memory status Worker requests', () => {
  assert.equal(
    createNoteSurfaceApiRequest({
      intent: 'memory.remember',
      ...metadata,
      memoryId: 'memory_001',
    }).request?.path,
    '/memory/memory_001/accept',
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'memory.reject',
      ...metadata,
      memoryId: 'memory_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/memory/memory_001/reject',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );
});

test('memory edit delete and snooze map to dedicated memory Worker requests', () => {
  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'memory.edit',
      ...metadata,
      memoryId: 'memory_001',
      content: 'Prefer source-backed memory candidates.',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/memory/memory_001/edit',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
          'Content-Type': 'application/json',
        },
        body: {
          content: 'Prefer source-backed memory candidates.',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'memory.delete',
      ...metadata,
      memoryId: 'memory_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/memory/memory_001/delete',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'memory.snooze',
      ...metadata,
      memoryId: 'memory_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/memory/memory_001/hold',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );
});

test('memory edit rejects invalid content before request descriptors are returned', () => {
  const emptyContent = createNoteSurfaceApiRequest({
    intent: 'memory.edit',
    ...metadata,
    memoryId: 'memory_001',
    content: '',
  });

  assert.equal(emptyContent.ok, false);
  assert.equal(emptyContent.request, undefined);
  assert.deepEqual(emptyContent.errors, ['content is required']);

  const trimMismatch = createNoteSurfaceApiRequest({
    intent: 'memory.edit',
    ...metadata,
    memoryId: 'memory_001',
    content: ' Updated content.',
  });

  assert.equal(trimMismatch.ok, false);
  assert.equal(trimMismatch.request, undefined);
  assert.deepEqual(trimMismatch.errors, ['content must not include leading or trailing whitespace']);
});

test('block update maps explicit editor save actions to the Worker block command boundary', () => {
  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'block.create',
      ...metadata,
      noteId: 'note_001',
      content: 'New user-authored block text.',
      afterBlockId: 'block_paragraph_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/notes/note_001/blocks',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
          'Content-Type': 'application/json',
        },
        body: {
          content: 'New user-authored block text.',
          afterBlockId: 'block_paragraph_001',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'block.update',
      ...metadata,
      noteId: 'note_001',
      blockId: 'block_paragraph_001',
      content: 'Updated user-authored block text.',
    }),
    {
      ok: true,
      request: {
        method: 'PATCH',
        path: '/blocks/block_paragraph_001',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
          'Content-Type': 'application/json',
        },
        body: {
          noteId: 'note_001',
          content: 'Updated user-authored block text.',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'block.delete',
      ...metadata,
      noteId: 'note_001',
      blockId: 'block_paragraph_001',
    }),
    {
      ok: true,
      request: {
        method: 'DELETE',
        path: '/blocks/block_paragraph_001',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
          'Content-Type': 'application/json',
        },
        body: {
          noteId: 'note_001',
        },
      },
      errors: [],
    },
  );
});

test('block update rejects blank content and invalid block ids before request descriptors are returned', () => {
  const blankContent = createNoteSurfaceApiRequest({
    intent: 'block.update',
    ...metadata,
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    content: '   ',
  });

  assert.equal(blankContent.ok, false);
  assert.equal(blankContent.request, undefined);
  assert.deepEqual(blankContent.errors, ['content is required']);

  const invalidBlock = createNoteSurfaceApiRequest({
    intent: 'block.update',
    ...metadata,
    noteId: 'note_001',
    blockId: 'block/paragraph/001',
    content: 'Updated user-authored block text.',
  });

  assert.equal(invalidBlock.ok, false);
  assert.equal(invalidBlock.request, undefined);
  assert.deepEqual(invalidBlock.errors, ['blockId must be a single path segment']);
});

test('note read lifecycle and digest intents map to Note Worker routes', () => {
  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'note.read',
      ...metadata,
      noteId: 'note_001',
    }),
    {
      ok: true,
      request: {
        method: 'GET',
        path: '/notes/note_001',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'note.leave',
      ...metadata,
      noteId: 'note_001',
      cause: 'tab_switch',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/notes/note_001/leave',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
          'Content-Type': 'application/json',
        },
        body: {
          cause: 'tab_switch',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'note.manual_structure',
      ...metadata,
      noteId: 'note_001',
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/notes/note_001/structure/manual',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );

  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'digest.read',
      ...metadata,
      noteId: 'note_001',
    }),
    {
      ok: true,
      request: {
        method: 'GET',
        path: '/notes/note_001/digest',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
      errors: [],
    },
  );
});

test('provenance lookup maps to bounded source lookup POST body', () => {
  assert.deepEqual(
    createNoteSurfaceApiRequest({
      intent: 'provenance.lookup',
      ...metadata,
      provenance: {
        sourceSpanId: 'span_001',
        sourceBlockId: 'block_001',
        startOffset: 4,
        endOffset: 48,
      },
    }),
    {
      ok: true,
      request: {
        method: 'POST',
        path: '/provenance/source',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
          'Content-Type': 'application/json',
        },
        body: {
          sourceSpanId: 'span_001',
          sourceBlockId: 'block_001',
          startOffset: 4,
          endOffset: 48,
        },
      },
      errors: [],
    },
  );
});

test('invalid ids and source offsets are rejected before request descriptors are returned', () => {
  const invalidOperation = createNoteSurfaceApiRequest({
    intent: 'ai_assist.accept',
    workspaceId: 'workspace_001',
    operationId: 'operation/001',
  });

  assert.equal(invalidOperation.ok, false);
  assert.equal(invalidOperation.request, undefined);
  assert.deepEqual(invalidOperation.errors, ['operationId must be a single path segment']);

  const invalidWorkspace = createNoteSurfaceApiRequest({
    intent: 'digest.read',
    workspaceId: 'workspace_unset',
    noteId: 'note_001',
  });

  assert.equal(invalidWorkspace.ok, false);
  assert.equal(invalidWorkspace.request, undefined);
  assert.deepEqual(invalidWorkspace.errors, ['workspaceId must be a stable non-sentinel runtime id']);

  const invalidProvenance = createNoteSurfaceApiRequest({
    intent: 'provenance.lookup',
    workspaceId: 'workspace_001',
    provenance: {
      sourceSpanId: 'span_001',
      sourceBlockId: 'block_001',
      startOffset: 20,
      endOffset: 10,
    },
  });

  assert.equal(invalidProvenance.ok, false);
  assert.equal(invalidProvenance.request, undefined);
  assert.deepEqual(invalidProvenance.errors, ['endOffset must be greater than or equal to startOffset']);
});

test('unsupported provider and external actions do not produce Worker request descriptors', () => {
  for (const intent of ['provider.call', 'external_action.invoke', 'user_block.direct_mutate']) {
    const result = createNoteSurfaceApiRequest({
      intent,
      ...metadata,
      noteId: 'note_001',
    });

    assert.equal(result.ok, false);
    assert.equal(result.request, undefined);
    assert.match(result.unavailableReason, /unsupported intent/);
  }
});

test('web API intent mapper is dependency-free and does not import Worker or generated projections', async () => {
  const source = await readFile(new URL('../../apps/web/src/noteSurfaceApiIntents.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|provider|externalAction|direct.*mutat/i);
});
