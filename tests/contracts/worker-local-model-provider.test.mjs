import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { assembleContextEnvelope } from '../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import { completedSectionJobFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const root = new URL('../../', import.meta.url);
const providerAdapterUrl = new URL(
  'apps/worker/src/runtime/local-verification/localModelOperationProvider.ts',
  root,
);

const now = 1_764_200_000_000;
const runningStructureJob = {
  ...completedSectionJobFixture,
  id: 'structure_job_local_model_001',
  workspaceId: 'workspace_001',
  noteId: 'note_001',
  targetScope: 'section',
  status: 'running',
  startedAt: now - 500,
  completedAt: undefined,
};
const contextEnvelope = assembleContextEnvelope(contextAssemblyInputFixture);
const contextEnvelopeBuilt = {
  type: 'ContextEnvelopeBuilt',
  workspaceId: runningStructureJob.workspaceId,
  userId: 'user_001',
  noteId: runningStructureJob.noteId,
  structureJobId: runningStructureJob.id,
  targetScope: runningStructureJob.targetScope,
  builtAt: now - 100,
};

test('local Ollama provider calls the native chat endpoint through the provider port', async () => {
  const { LocalModelOperationProvider } = await importExpectedProviderAdapter();
  const requests = [];
  const operations = [
    {
      type: 'create_semantic_unit',
      targetSectionId: 'section_001',
      unitType: 'claim',
      content: 'Local background structuring reached the Worker boundary.',
      summary: 'Local structuring reached the Worker boundary.',
      sourceSpans: [{ blockId: 'block_paragraph_001', startOffset: 0, endOffset: 18 }],
      confidence: 0.91,
    },
  ];
  const provider = new LocalModelOperationProvider({
    protocol: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/api/chat',
    model: 'ann-local-structure',
    timeoutMs: 5_000,
    fetchLike: async (url, init = {}) => {
      requests.push(readRequest(url, init));
      return jsonResponse({
        message: {
          content: JSON.stringify({ operations }),
        },
      });
    },
  });

  const generated = await provider.generateOperations({
    structureJob: runningStructureJob,
    contextEnvelope,
    contextEnvelopeBuilt,
    now,
  });

  assert.equal(provider.id, 'local_model_ollama');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(requests[0].body.model, 'ann-local-structure');
  assert.equal(requests[0].body.stream, false);
  assert.equal(requests[0].body.options.temperature, 0);
  assert.equal(Array.isArray(requests[0].body.messages), true);
  assert.equal(requests[0].body.format.type, 'object');
  assert.deepEqual(generated.operations, operations);
  assert.deepEqual(generated.providerMetadata, {
    provider: 'local_model',
    protocol: 'ollama',
    model: 'ann-local-structure',
  });
  assert.doesNotMatch(
    JSON.stringify(generated),
    /127\.0\.0\.1|localhost|api\/chat|Authorization|token|secret/i,
  );
  assert.doesNotMatch(
    JSON.stringify(requests[0].body),
    /fullWorkspace|allNotes|fullNotes|workspaceDump|Authorization|token|secret/i,
  );
});

test('local OpenAI-compatible provider calls chat completions with a JSON schema response format', async () => {
  const { LocalModelOperationProvider } = await importExpectedProviderAdapter();
  const requests = [];
  const operations = [{ type: 'no_op', reason: 'No stable structure can be inferred.' }];
  const provider = new LocalModelOperationProvider({
    protocol: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'ann-local-structure',
    timeoutMs: 5_000,
    apiKey: 'local-token',
    fetchLike: async (url, init = {}) => {
      requests.push(readRequest(url, init));
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ operations }),
            },
          },
        ],
      });
    },
  });

  const generated = await provider.generateOperations({
    structureJob: runningStructureJob,
    contextEnvelope,
    contextEnvelopeBuilt,
    now,
  });

  assert.equal(provider.id, 'local_model_openai_compatible');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(requests[0].body.response_format.type, 'json_schema');
  assert.equal(requests[0].body.response_format.json_schema.strict, true);
  assert.equal(requests[0].body.temperature, 0);
  assert.deepEqual(generated.operations, operations);
  assert.deepEqual(generated.providerMetadata, {
    provider: 'local_model',
    protocol: 'openai_compatible',
    model: 'ann-local-structure',
  });
});

test('local model provider normalizes local runtime failures before they cross the provider port', async () => {
  const { LocalModelOperationProvider } = await importExpectedProviderAdapter();
  const provider = new LocalModelOperationProvider({
    protocol: 'ollama',
    baseUrl: 'http://localhost:11434/api/chat',
    model: 'ann-local-structure',
    timeoutMs: 5_000,
    fetchLike: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434 token secret /Users/local/.ollama');
    },
  });

  await assert.rejects(
    () => provider.generateOperations({
      structureJob: runningStructureJob,
      contextEnvelope,
      contextEnvelopeBuilt,
      now,
    }),
    (error) => {
      assert.match(error.message, /local model provider request failed/i);
      assert.doesNotMatch(error.message, /127\.0\.0\.1|localhost|11434|ECONNREFUSED|token|secret|\/Users/i);
      return true;
    },
  );
});

test('local model provider source stays outside audit persistence and canonical Note/Block writes', async () => {
  const source = await readExpectedSource(
    providerAdapterUrl,
    'local model provider adapter',
  );

  assert.doesNotMatch(source, /runOperationRoutingFlow|routeGeneratedOperations|OperationAuditSql|TursoOperation/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(note-model|scheduler\/.*Sql|memory|context-assembly\/.*Sql)/);
  assert.doesNotMatch(source, /\b(?:insert|update|delete)\s+(?:into|from)?\s*(?:notes|sections|blocks)\b/i);
});

async function importExpectedProviderAdapter() {
  try {
    const module = await import(providerAdapterUrl.href);
    assert.equal(
      typeof module.LocalModelOperationProvider,
      'function',
      'local model provider adapter must export LocalModelOperationProvider',
    );
    return module;
  } catch (error) {
    assert.fail(
      `Expected local model provider adapter at ${providerAdapterUrl.pathname}; import failed: ${error.message}`,
    );
  }
}

async function readExpectedSource(url, label) {
  try {
    return await readFile(url, 'utf8');
  } catch (error) {
    assert.fail(`Expected ${label} at ${url.pathname}; source read failed: ${error.message}`);
  }
}

function readRequest(url, init) {
  return {
    url: String(url),
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}
