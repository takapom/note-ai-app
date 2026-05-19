import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceHttpProductProvider } from '../../apps/web/src/noteSurfaceHttpProductProvider.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('HTTP product provider loads the initial note snapshot through GET note document boundary', async () => {
  const calls = [];
  const provider = createNoteSurfaceHttpProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, {
      ok: true,
      status: 200,
      body: {
        document: structuredClone(noteDocumentFixture),
      },
    }),
    workspaceId: 'workspace_001',
    userId: 'user_001',
    noteId: 'note_001',
    viewState: {
      workspaceName: 'Research Workspace',
      expandedDigest: true,
    },
    projectionMaps: {
      activeNoteId: 'note_001',
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
    },
  });

  const snapshot = await provider.loadInitialState();

  assert.deepEqual(calls, [
    {
      url: 'https://worker.example.test/api/notes/note_001',
      init: {
        method: 'GET',
        headers: {
          'X-Workspace-Id': 'workspace_001',
          'X-User-Id': 'user_001',
        },
      },
    },
  ]);
  assert.deepEqual(snapshot, {
    document: noteDocumentFixture,
    viewState: {
      workspaceName: 'Research Workspace',
      expandedDigest: true,
    },
    projectionMaps: {
      activeNoteId: 'note_001',
      operationIdByBlockId: {
        block_ai_question_001: 'operation_001',
      },
    },
  });
});

test('HTTP product provider rejects invalid runtime ids before calling fetch-like binding', async () => {
  const invalidOptions = [
    { workspaceId: 'workspace_unset', noteId: 'note_001' },
    { workspaceId: 'workspace_001', userId: 'user 001', noteId: 'note_001' },
    { workspaceId: 'workspace_001', noteId: 'note/001' },
    { workspaceId: 'workspace_001', noteId: 'note?001' },
    { workspaceId: 'workspace_001', noteId: 'note#001' },
    { workspaceId: 'workspace_001', noteId: 'note 001' },
  ];

  for (const options of invalidOptions) {
    let fetchCalls = 0;
    const provider = createNoteSurfaceHttpProductProvider({
      apiBaseUrl: 'https://worker.example.test/api/',
      fetchLike: async () => {
        fetchCalls += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return { document: structuredClone(noteDocumentFixture) };
          },
        };
      },
      ...options,
    });

    await assert.rejects(
      () => provider.loadInitialState(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(Array.isArray(error.errors));
        assert.match(error.errors.join('\n'), /runtime id|single path segment|whitespace/);
        return true;
      },
    );
    assert.equal(fetchCalls, 0);
  }
});

test('HTTP product provider exposes structured errors for HTTP and transport failures', async () => {
  const provider = createNoteSurfaceHttpProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike([], {
      ok: false,
      status: 409,
      body: {
        errors: ['note snapshot is not available'],
      },
    }),
    workspaceId: 'workspace_001',
    noteId: 'note_001',
  });

  await assert.rejects(
    () => provider.loadInitialState(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.deepEqual(error.errors, ['note snapshot is not available']);
      return true;
    },
  );
});

test('HTTP product provider rejects missing document in the base response as structured provider error', async () => {
  const provider = createNoteSurfaceHttpProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike([], {
      ok: true,
      status: 200,
      body: {
        note: structuredClone(noteDocumentFixture.note),
      },
    }),
    workspaceId: 'workspace_001',
    noteId: 'note_001',
  });

  await assert.rejects(
    () => provider.loadInitialState(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.deepEqual(error.errors, ['initial note snapshot response must include document']);
      return true;
    },
  );
});

test('HTTP product provider source stays framework-neutral and limited to the initial note snapshot boundary', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceHttpProductProvider.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceHttpProductProvider/);
  assert.match(source, /createNoteSurfaceApiTransport/);
  assert.match(source, /method:\s*['"]GET['"]/);
  assert.match(source, /path:\s*`\/notes\/\$\{options\.noteId\}`/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /React|Next|Vite|createRoot|hydrateRoot/);
  assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|fetch\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /authPolicy|providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /method:\s*['"]POST['"]|\/digest|\/provenance|\/memory|\/ai-operations/);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /encodeURIComponent/);
});

function createFetchLike(calls, response) {
  return async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      },
    };
  };
}
