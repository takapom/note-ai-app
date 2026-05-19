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

test('memory remember and reject map only to memory status Worker requests', () => {
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

test('memory edit delete and snooze are unavailable instead of reusing reject', () => {
  for (const intent of ['memory.edit', 'memory.delete', 'memory.snooze']) {
    const result = createNoteSurfaceApiRequest({
      intent,
      ...metadata,
      memoryId: 'memory_001',
    });

    assert.equal(result.ok, false);
    assert.equal(result.request, undefined);
    assert.match(result.unavailableReason, /no Worker route/);
    assert.doesNotMatch(JSON.stringify(result), /\/memory\/memory_001\/reject/);
  }
});

test('digest read maps to the next-open digest GET route', () => {
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
