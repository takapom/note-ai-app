import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const localModelProviderUrl = new URL(
  'apps/worker/src/runtime/local-verification/localModelOperationProvider.ts',
  root,
);
const localSmokeSnapshotUrl = new URL(
  'apps/worker/src/runtime/local-verification/localSmokeOperationRouterSnapshot.ts',
  root,
);
const workspaceBrainProcessorOptionsUrl = new URL(
  'apps/worker/src/runtime/composition/workspaceBrainProcessorOptions.ts',
  root,
);
const localSmokeRuntimeUrl = new URL(
  'apps/worker/src/runtime/local-verification/localSmokeRuntime.ts',
  root,
);
const noteFixturesUrl = new URL(
  'contexts/note-model/src/contract/noteFixtures.ts',
  root,
);

const now = 1_764_200_000_000;

test('local model smoke wiring injects a provider registry and local Operation Router snapshot from env', async () => {
  const { createWorkspaceBrainStructureJobProcessorOptions } = await importWorkspaceBrainProcessorOptions();
  await seedLocalSmokeDocument();
  const agentLocalClient = createNoopTursoClient();
  const result = createWorkspaceBrainStructureJobProcessorOptions({
    env: {
      LOCAL_AGENT_SMOKE_ENABLED: '1',
      WORKER_LOCAL_MODEL_PROTOCOL: 'ollama',
      WORKER_LOCAL_MODEL_NAME: 'ann-local-structure',
      WORKER_LOCAL_MODEL_BASE_URL: 'http://127.0.0.1:11434/api/chat',
      WORKER_SMOKE_NOTE_ID: 'note_001',
      WORKER_SMOKE_BLOCK_ID: 'block_paragraph_001',
    },
    agentLocalSql: agentLocalClient,
    workspaceId: 'workspace_001',
    now,
  });

  assert.equal(result.ok, true);
  const provider = await result.options.providerRegistry.resolveProvider({
    workspaceId: 'workspace_001',
    noteId: 'note_001',
    structureJobId: 'structure_job_001',
    targetScope: 'section',
  });

  assert.equal(provider?.id, 'local_model_ollama');
  assert.deepEqual(result.options.operationFlow.snapshot.notes, [{ id: 'note_001' }]);
  assert.equal(
    result.options.operationFlow.snapshot.blocks.some((block) =>
      block.id === 'block_paragraph_001' && block.origin === 'user'
    ),
    true,
  );
  assert.deepEqual(result.options.operationFlow.snapshot.semanticUnits, []);
  const targetContext = await result.options.contextAssemblyPorts.targetSnapshot.loadTargetContext({
    workspaceId: 'workspace_001',
    userId: 'user_001',
    noteId: 'note_001',
    structureJobId: 'structure_job_001',
    targetScope: 'section',
    targetId: 'section_001',
    now,
  });
  assert.match(targetContext.target.text, /protect writing flow/);
  assert.deepEqual(targetContext.target.sourceBlockIds, ['block_heading_001', 'block_paragraph_001']);
});

test('local smoke runtime exposes seeded documents through the note list port', async () => {
  const { createLocalSmokeRuntimePorts } = await import(localSmokeRuntimeUrl.href);
  await seedLocalSmokeDocument();

  const ports = createLocalSmokeRuntimePorts({
    method: 'GET',
    path: '/notes',
    workspaceId: 'workspace_001',
    now,
  });
  const result = await ports?.noteList?.listNotes({ workspaceId: 'workspace_001' });

  assert.equal(result?.ok, true);
  assert.deepEqual(result?.notes?.map((note) => note.noteId), ['note_001']);
});

test('local model smoke wiring rejects missing model config with provider-neutral errors', async () => {
  const { createWorkspaceBrainStructureJobProcessorOptions } = await importWorkspaceBrainProcessorOptions();
  const client = createNoopTursoClient();
  const result = createWorkspaceBrainStructureJobProcessorOptions({
    env: {
      LOCAL_AGENT_SMOKE_ENABLED: '1',
      WORKER_SMOKE_NOTE_ID: 'note_001',
      WORKER_SMOKE_BLOCK_ID: 'block_paragraph_001',
      WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT: createSnapshot(),
      TURSO: client,
    },
    agentLocalSql: client,
    now,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['WORKER_LOCAL_MODEL_NAME is required for local model smoke']);
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|localhost|11434|token|secret/i);
});

test('default workspace brain processor wiring still requires injected provider registry and snapshot', async () => {
  const { createWorkspaceBrainStructureJobProcessorOptions } = await importWorkspaceBrainProcessorOptions();
  const client = createNoopTursoClient();
  const result = createWorkspaceBrainStructureJobProcessorOptions({
    env: {
      TURSO: client,
    },
    agentLocalSql: client,
    now,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'workspace brain provider registry is not configured',
    'workspace brain operation router snapshot is not configured',
  ]);
});

test('local model wiring source is gated to local smoke and does not hard-code provider endpoint detail in runtime composition', async () => {
  const source = await readExpectedSource(
    workspaceBrainProcessorOptionsUrl,
    'workspace brain processor options',
  );

  assert.match(source, /WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY/);
  assert.match(source, /readLocalModelProviderConfigFromEnv/);
  assert.match(source, /hasLocalModelSmokeEnv/);
  assert.doesNotMatch(source, /127\.0\.0\.1|localhost|11434|ollama\/api|lmstudio/i);
  assert.doesNotMatch(source, /\b(?:insert|update|delete)\s+(?:into|from)?\s*(?:notes|sections|blocks)\b/i);
});

test('local model provider source owns only provider composition, not routing or smoke snapshots', async () => {
  const source = await readExpectedSource(
    localModelProviderUrl,
    'local model provider helper',
  );

  assert.match(source, /LOCAL_AGENT_SMOKE_ENABLED/);
  assert.doesNotMatch(source, /OperationRouterSnapshot|notes:\s*\[|assistBlocks|memoryCandidates/);
  assert.doesNotMatch(source, /runOperationRoutingFlow|routeGeneratedOperations|OperationAuditSql|TursoOperation/i);
  assert.doesNotMatch(source, /\b(?:insert|update|delete)\s+(?:into|from)?\s*(?:notes|sections|blocks)\b/i);
});

test('local smoke Operation Router snapshot fixture stays in local verification wiring', async () => {
  const source = await readExpectedSource(
    localSmokeSnapshotUrl,
    'local smoke Operation Router snapshot fixture',
  );

  assert.match(source, /OperationRouterSnapshot/);
  assert.match(source, /LOCAL_AGENT_SMOKE_ENABLED/);
  assert.match(source, /WORKER_SMOKE_NOTE_ID/);
  assert.match(source, /WORKER_SMOKE_BLOCK_ID/);
  assert.doesNotMatch(source, /fetch\(|OperationGenerationProvider|OperationAuditSql|TursoOperation/i);
  assert.doesNotMatch(source, /\b(?:insert|update|delete)\s+(?:into|from)?\s*(?:notes|sections|blocks)\b/i);
});

async function importWorkspaceBrainProcessorOptions() {
  try {
    const module = await import(workspaceBrainProcessorOptionsUrl.href);
    assert.equal(
      typeof module.createWorkspaceBrainStructureJobProcessorOptions,
      'function',
      'workspace brain processor options must export createWorkspaceBrainStructureJobProcessorOptions',
    );
    return module;
  } catch (error) {
    assert.fail(
      `Expected workspace brain processor options at ${workspaceBrainProcessorOptionsUrl.pathname}; ` +
        `import failed: ${error.message}`,
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

async function seedLocalSmokeDocument() {
  const { handleLocalSmokeRuntimeRequest } = await import(localSmokeRuntimeUrl.href);
  const { noteDocumentFixture } = await import(noteFixturesUrl.href);
  await handleLocalSmokeRuntimeRequest({
    method: 'POST',
    path: '/__local/smoke/reset',
    workspaceId: 'workspace_001',
    now,
    body: { noteId: 'note_001' },
  });
  await handleLocalSmokeRuntimeRequest({
    method: 'POST',
    path: '/__local/smoke/seed',
    workspaceId: 'workspace_001',
    now,
    body: { document: structuredClone(noteDocumentFixture) },
  });
}

function createSnapshot() {
  return {
    notes: [{ id: 'note_001' }],
    sections: [{ id: 'section_001' }],
    blocks: [{ id: 'block_paragraph_001', origin: 'user', sectionId: 'section_001' }],
    captureEntries: [],
    semanticUnits: [],
    memoryCandidates: [],
    assistBlocks: [],
  };
}

function createNoopTursoClient() {
  return {
    async execute() {
      return { rows: [], rowsAffected: 0 };
    },
  };
}
