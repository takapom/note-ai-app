import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceHttpDigestProductProvider } from '../../apps/web/src/noteSurfaceHttpDigestProductProvider.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('HTTP digest product provider merges unavailable digest projection into product view state', async () => {
  const calls = [];
  const provider = createNoteSurfaceHttpDigestProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
          viewState: {
            workspaceName: 'Research Workspace',
          },
        },
      },
      {
        ok: true,
        status: 200,
        body: {
          ok: true,
          result: {
            available: false,
          },
        },
      },
    ]),
    workspaceId: 'workspace_001',
    userId: 'user_001',
    noteId: 'note_001',
  });

  const snapshot = await provider.loadInitialState();

  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
    ['GET', 'https://worker.example.test/api/notes/note_001/digest'],
  ]);
  assert.deepEqual(calls[1].init.headers, {
    'X-Workspace-Id': 'workspace_001',
    'X-User-Id': 'user_001',
  });
  assert.deepEqual(snapshot.viewState, {
    workspaceName: 'Research Workspace',
    nextOpenDigest: {
      available: false,
    },
  });
});

test('HTTP digest product provider copies only plain digest arrays from wrapped or direct digest bodies', async () => {
  const digestItems = {
    unresolvedQuestions: [
      {
        id: 'digest_question_001',
        text: 'Clarify the migration stop condition.',
        sourceBlockId: 'block_paragraph_001',
      },
    ],
    decisions: [
      {
        id: 'digest_decision_001',
        text: 'Keep digest as a read projection.',
      },
    ],
    relatedNotes: [
      {
        id: 'digest_related_001',
        text: 'Related architecture note.',
        sourceNoteId: 'note_related_001',
      },
    ],
    memoryCandidates: [
      {
        id: 'digest_memory_001',
        text: 'Remember that digest failures are non-fatal.',
      },
    ],
  };
  const provider = createNoteSurfaceHttpDigestProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike([], [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
          projectionMaps: {
            activeNoteId: 'note_001',
          },
        },
      },
      {
        ok: true,
        status: 200,
        body: {
          available: true,
          ...digestItems,
          items: [
            {
              type: 'unresolved_question',
              content: 'must not be inferred',
            },
          ],
        },
      },
    ]),
    workspaceId: 'workspace_001',
    noteId: 'note_001',
  });

  const snapshot = await provider.loadInitialState();

  assert.deepEqual(snapshot, {
    document: noteDocumentFixture,
    viewState: {
      nextOpenDigest: {
        available: true,
        ...digestItems,
      },
    },
    projectionMaps: {
      activeNoteId: 'note_001',
    },
  });
});

test('HTTP digest product provider skips digest GET when base snapshot already has next open digest', async () => {
  const calls = [];
  const provider = createNoteSurfaceHttpDigestProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: createFetchLike(calls, [
      {
        ok: true,
        status: 200,
        body: {
          document: structuredClone(noteDocumentFixture),
        },
      },
    ]),
    workspaceId: 'workspace_001',
    noteId: 'note_001',
    viewState: {
      workspaceName: 'Embedded Workspace',
      nextOpenDigest: {
        available: true,
        decisions: [
          {
            id: 'caller_digest_decision_001',
            text: 'Use the caller supplied digest.',
          },
        ],
      },
    },
  });

  const snapshot = await provider.loadInitialState();

  assert.deepEqual(calls.map((call) => [call.init.method, call.url]), [
    ['GET', 'https://worker.example.test/api/notes/note_001'],
  ]);
  assert.deepEqual(snapshot.viewState, {
    workspaceName: 'Embedded Workspace',
    nextOpenDigest: {
      available: true,
      decisions: [
        {
          id: 'caller_digest_decision_001',
          text: 'Use the caller supplied digest.',
        },
      ],
    },
  });
});

test('HTTP digest product provider treats digest HTTP and invalid body failures as unavailable', async () => {
  const failureResponses = [
    {
      ok: false,
      status: 503,
      body: {
        errors: ['digest projection unavailable'],
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        result: {
          items: [{ content: 'generic items must not be inferred' }],
        },
      },
    },
  ];

  for (const digestResponse of failureResponses) {
    const provider = createNoteSurfaceHttpDigestProductProvider({
      apiBaseUrl: 'https://worker.example.test/api/',
      fetchLike: createFetchLike([], [
        {
          ok: true,
          status: 200,
          body: {
            document: structuredClone(noteDocumentFixture),
          },
        },
        digestResponse,
      ]),
      workspaceId: 'workspace_001',
      noteId: 'note_001',
    });

    const snapshot = await provider.loadInitialState();

    assert.deepEqual(snapshot.viewState, {
      nextOpenDigest: {
        available: false,
      },
    });
  }
});

test('HTTP digest product provider preserves base provider structured errors for invalid runtime ids', async () => {
  let callCount = 0;
  const provider = createNoteSurfaceHttpDigestProductProvider({
    apiBaseUrl: 'https://worker.example.test/api/',
    fetchLike: async () => {
      callCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { document: structuredClone(noteDocumentFixture) };
        },
      };
    },
    workspaceId: 'workspace_001',
    noteId: 'note/001',
  });

  await assert.rejects(
    () => provider.loadInitialState(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.deepEqual(error.errors, ['noteId must be a single path segment']);
      return true;
    },
  );
  assert.equal(callCount, 0);
});

test('HTTP digest product provider source stays framework-neutral and limited to note snapshot plus digest read boundaries', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceHttpDigestProductProvider.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceHttpDigestProductProvider/);
  assert.match(source, /createNoteSurfaceHttpProductProvider/);
  assert.match(source, /createNoteSurfaceApiTransport/);
  assert.match(source, /method:\s*['"]GET['"]/);
  assert.match(source, /path:\s*`\/notes\/\$\{options\.noteId\}\/digest`/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /React|Next\.js|Vite|createRoot|hydrateRoot/);
  assert.doesNotMatch(source, /document\.querySelector|globalThis\.fetch|fetch\(|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /authPolicy|providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]|\/provenance|\/memory|\/ai-operations/);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random|encodeURIComponent/);
  assert.doesNotMatch(source, /items\.map|item\.type|sourceBlockId\s*=|sourceNoteId\s*=|id\s*=/);
});

function createFetchLike(calls, responses) {
  return async (url, init) => {
    calls.push({ url, init });
    const response = responses.shift();
    assert.ok(response, `unexpected request: ${init.method} ${url}`);
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      },
    };
  };
}
