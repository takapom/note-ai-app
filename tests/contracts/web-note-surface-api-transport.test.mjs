import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceApiRequest } from '../../apps/web/src/noteSurfaceApiIntents.ts';
import {
  createNoteSurfaceApiTransport,
  sendNoteSurfaceApiRequest,
} from '../../apps/web/src/noteSurfaceApiTransport.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('transport sends AI memory block digest and provenance descriptors through the injected fetch-like binding', async () => {
  const calls = [];
  const transport = createNoteSurfaceApiTransport({
    baseUrl: 'https://worker.example.test/api/',
    async fetchLike(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { accepted: true };
        },
      };
    },
  });

  const descriptors = [
    createNoteSurfaceApiRequest({
      intent: 'ai_assist.accept',
      ...metadata,
      operationId: 'operation_001',
    }).request,
    createNoteSurfaceApiRequest({
      intent: 'memory.edit',
      ...metadata,
      memoryId: 'memory_001',
      content: 'Remember this source-backed preference.',
    }).request,
    createNoteSurfaceApiRequest({
      intent: 'block.update',
      ...metadata,
      noteId: 'note_001',
      blockId: 'block_paragraph_001',
      content: 'Updated user-authored block text.',
    }).request,
    createNoteSurfaceApiRequest({
      intent: 'block.delete',
      ...metadata,
      noteId: 'note_001',
      blockId: 'block_paragraph_001',
    }).request,
    createNoteSurfaceApiRequest({
      intent: 'digest.read',
      ...metadata,
      noteId: 'note_001',
    }).request,
    createNoteSurfaceApiRequest({
      intent: 'provenance.lookup',
      ...metadata,
      provenance: {
        sourceSpanId: 'span_001',
        sourceBlockId: 'block_001',
        startOffset: 2,
        endOffset: 12,
      },
    }).request,
  ];

  for (const descriptor of descriptors) {
    assert.ok(descriptor);
    const result = await transport.send(descriptor);
    assert.deepEqual(result, {
      ok: true,
      status: 200,
      body: { accepted: true },
      errors: [],
    });
  }

  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['POST', 'https://worker.example.test/api/ai-operations/operation_001/accept'],
    ['POST', 'https://worker.example.test/api/memory/memory_001/edit'],
    ['PATCH', 'https://worker.example.test/api/blocks/block_paragraph_001'],
    ['DELETE', 'https://worker.example.test/api/blocks/block_paragraph_001'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
    ['POST', 'https://worker.example.test/api/provenance/source'],
  ]);

  assert.deepEqual(calls[1].init, {
    method: 'POST',
    headers: {
      'X-Workspace-Id': 'workspace_001',
      'X-User-Id': 'user_001',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'Remember this source-backed preference.' }),
  });
  assert.deepEqual(calls[2].init, {
    method: 'PATCH',
    headers: {
      'X-Workspace-Id': 'workspace_001',
      'X-User-Id': 'user_001',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ noteId: 'note_001', content: 'Updated user-authored block text.' }),
  });
  assert.deepEqual(calls[3].init, {
    method: 'DELETE',
    headers: {
      'X-Workspace-Id': 'workspace_001',
      'X-User-Id': 'user_001',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ noteId: 'note_001' }),
  });
});

test('transport does not send a body for GET descriptors', async () => {
  const calls = [];
  const result = await sendNoteSurfaceApiRequest(
    {
      method: 'GET',
      path: '/notes/note_001/digest',
      headers: {
        'X-Workspace-Id': 'workspace_001',
      },
      body: { ignored: true },
    },
    {
      baseUrl: new URL('https://worker.example.test'),
      async fetchLike(url, init) {
        calls.push({ url, init });
        return {
          ok: true,
          status: 204,
          async json() {
            throw new SyntaxError('empty response');
          },
        };
      },
    },
  );

  assert.deepEqual(result, {
    ok: true,
    status: 204,
    errors: [],
  });
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0].init, 'body'), false);
});

test('transport can mark lifecycle requests as keepalive through injected fetch-like binding', async () => {
  const calls = [];
  const transport = createNoteSurfaceApiTransport({
    baseUrl: 'https://worker.example.test/api/',
    keepalive: true,
    async fetchLike(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        status: 202,
        async json() {
          return { ok: true };
        },
      };
    },
  });

  const descriptor = createNoteSurfaceApiRequest({
    intent: 'note.leave',
    ...metadata,
    noteId: 'note_001',
    cause: 'app_leave',
  }).request;
  assert.ok(descriptor);

  const result = await transport.send(descriptor);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.method, 'POST');
});

test('transport parses response JSON into a thin status body errors result', async () => {
  const result = await sendNoteSurfaceApiRequest(
    {
      method: 'POST',
      path: '/memory/memory_001/reject',
      headers: {
        'X-Workspace-Id': 'workspace_001',
      },
    },
    {
      baseUrl: 'https://worker.example.test',
      async fetchLike() {
        return {
          ok: false,
          status: 409,
          async text() {
            return JSON.stringify({ errors: ['memory candidate is already reviewed'] });
          },
        };
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    status: 409,
    body: {
      errors: ['memory candidate is already reviewed'],
    },
    errors: ['memory candidate is already reviewed'],
  });
});

test('transport rejects invalid base URL path method and headers before calling fetch-like binding', async () => {
  let fetchCalls = 0;
  const fetchLike = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
    };
  };

  const invalidBase = await sendNoteSurfaceApiRequest(
    {
      method: 'POST',
      path: '/memory/memory_001/accept',
      headers: {
        'X-Workspace-Id': 'workspace_001',
      },
    },
    {
      baseUrl: 'not a url',
      fetchLike,
    },
  );
  assert.equal(invalidBase.ok, false);
  assert.match(invalidBase.errors.join('\n'), /baseUrl must be a valid URL/);

  const invalidPath = await sendNoteSurfaceApiRequest(
    {
      method: 'POST',
      path: '//evil.example.test/memory/memory_001/accept',
      headers: {
        'X-Workspace-Id': 'workspace_001',
      },
    },
    {
      baseUrl: 'https://worker.example.test',
      fetchLike,
    },
  );
  assert.equal(invalidPath.ok, false);
  assert.match(invalidPath.errors.join('\n'), /path must be relative to the API origin/);

  const invalidMethod = await sendNoteSurfaceApiRequest(
    {
      method: 'PUT',
      path: '/memory/memory_001/accept',
      headers: {
        'X-Workspace-Id': 'workspace_001',
      },
    },
    {
      baseUrl: 'https://worker.example.test',
      fetchLike,
    },
  );
  assert.equal(invalidMethod.ok, false);
  assert.match(invalidMethod.errors.join('\n'), /method must be GET, POST, PATCH, or DELETE/);

  const invalidHeader = await sendNoteSurfaceApiRequest(
    {
      method: 'POST',
      path: '/memory/memory_001/accept',
      headers: {
        'Bad\nHeader': 'workspace_001',
      },
    },
    {
      baseUrl: 'https://worker.example.test',
      fetchLike,
    },
  );
  assert.equal(invalidHeader.ok, false);
  assert.match(invalidHeader.errors.join('\n'), /header names must be non-empty field names/);
  assert.equal(fetchCalls, 0);
});

test('web API transport source stays dependency-free and outside runtime internals', async () => {
  const source = await readFile(new URL('../../apps/web/src/noteSurfaceApiTransport.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /globalThis\.fetch|XMLHttpRequest|provider|direct.*mutat/i);
});
