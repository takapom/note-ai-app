#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

import { blockFixtures } from '../contexts/note-model/src/contract/noteFixtures.ts';
import { createLocalSmokeDocument } from './worker-local-smoke/fixtures.mjs';
import { readPositiveIntegerEnv } from './worker-local-smoke/logging.mjs';
import {
  createWranglerProcessEnv,
  defaultPort,
  readWranglerBaseConfig,
  waitForWorkerReadiness,
} from './worker-local-smoke/wranglerDev.mjs';

async function requireWrangler(command) {
  const child = spawn(command, ['--version'], {
    env: createWranglerProcessEnv(),
    stdio: 'pipe',
  });
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error('Wrangler is required. Run npm install or use: npm run preview:ui:static');
  }
}

const previewConfig = {
  workspaceId: 'workspace_local_preview',
  userId: 'user_local_preview',
  noteId: 'note_local_preview',
  blockId: 'block_local_preview',
};
const defaultPreviewSeedWatchIntervalMs = 2_000;

async function main() {
  if (!process.argv.includes('--no-build')) {
    await runNpmScript('build:web');
  }

  const baseConfig = readWranglerBaseConfig();
  const wrangler = process.env.WRANGLER_BIN ?? 'wrangler';
  if (process.env.WRANGLER_BIN === undefined) {
    await requireWrangler(wrangler);
  }
  const child = spawn(
    wrangler,
    [
      'dev',
      '--port',
      String(baseConfig.port ?? defaultPort),
      '--persist-to',
      baseConfig.persistTo,
      '--var',
      `LOCAL_AGENT_SMOKE_ENABLED:${process.env.LOCAL_AGENT_SMOKE_ENABLED ?? '1'}`,
      ...createWranglerVarArgs(readLocalPreviewWranglerVars()),
    ],
    {
      stdio: 'inherit',
      cwd: new URL('../', import.meta.url),
      env: createWranglerProcessEnv(),
    },
  );

  process.stdout.write('Waiting for local Worker...\n');
  await waitForWorkerReadiness(baseConfig.baseUrl, child, fetch);
  await seedPreviewRuntime(baseConfig.baseUrl);
  const stopPreviewSeedWatcher = startPreviewSeedWatcher(baseConfig.baseUrl, child);
  process.stdout.write('\n');
  process.stdout.write(`Open: ${new URL('/dev.html', baseConfig.baseUrl).toString()}\n`);
  process.stdout.write(`Local model: ${readPreviewLocalModelLabel()}\n`);
  process.stdout.write('Press Ctrl+C to stop Wrangler.\n\n');

  await new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      stopPreviewSeedWatcher();
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`wrangler dev exited with code ${code}`));
    });
  });
}

async function seedPreviewRuntime(baseUrl = `http://127.0.0.1:${defaultPort}`) {
  const document = createPreviewDocument();
  const nextOpenDigest = createPreviewDigest();

  await postJson(new URL('/__local/smoke/reset', baseUrl), { noteId: previewConfig.noteId });
  await postJson(new URL('/__local/smoke/seed', baseUrl), { document, nextOpenDigest });
}

function startPreviewSeedWatcher(baseUrl, child) {
  const intervalMs = readPositiveIntegerEnv(
    'WORKER_PREVIEW_SEED_WATCH_INTERVAL_MS',
    defaultPreviewSeedWatchIntervalMs,
  );
  let seedInFlight = false;
  const timer = setInterval(() => {
    if (child.exitCode !== null || child.signalCode !== null || seedInFlight) {
      return;
    }
    seedInFlight = true;
    restorePreviewSeedIfNeeded(baseUrl)
      .catch(() => undefined)
      .finally(() => {
        seedInFlight = false;
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function restorePreviewSeedIfNeeded(baseUrl) {
  const available = await isPreviewSeedAvailable(baseUrl);
  if (available) {
    return;
  }
  await seedPreviewRuntime(baseUrl);
  process.stdout.write('Local preview seed restored after Worker reload.\n');
}

async function isPreviewSeedAvailable(baseUrl) {
  const response = await fetch(new URL(`/notes/${encodeURIComponent(previewConfig.noteId)}`, baseUrl), {
    method: 'GET',
    headers: createPreviewHeaders(),
  });

  if (response.status === 404 || response.status === 501) {
    return false;
  }
  if (!response.ok) {
    return true;
  }

  const body = await readJsonResponse(response);
  return isRecord(body) && body.ok === true && isRecord(body.document);
}

function readLocalPreviewWranglerVars() {
  return {
    WORKER_SMOKE_NOTE_ID: readOptionalStringEnv('WORKER_SMOKE_NOTE_ID') ?? previewConfig.noteId,
    WORKER_SMOKE_BLOCK_ID: readOptionalStringEnv('WORKER_SMOKE_BLOCK_ID') ?? previewConfig.blockId,
    WORKER_LOCAL_MODEL_PROTOCOL: 'ollama',
    WORKER_LOCAL_MODEL_BASE_URL: 'http://127.0.0.1:11434',
    WORKER_LOCAL_MODEL_NAME: 'llama3.2:3b',
    ...readLocalModelVars(),
  };
}

function readLocalModelVars() {
  return readOptionalEnvAliasMap({
    WORKER_LOCAL_MODEL_PROTOCOL: ['WORKER_LOCAL_MODEL_PROTOCOL', 'LOCAL_MODEL_PROTOCOL', 'LOCAL_MODEL_PROVIDER'],
    WORKER_LOCAL_MODEL_BASE_URL: [
      'WORKER_LOCAL_MODEL_BASE_URL',
      'LOCAL_MODEL_BASE_URL',
      'WORKER_LOCAL_MODEL_ENDPOINT',
      'LOCAL_MODEL_ENDPOINT',
      'OLLAMA_HOST',
    ],
    WORKER_LOCAL_MODEL_NAME: ['WORKER_LOCAL_MODEL_NAME', 'LOCAL_MODEL_NAME', 'OLLAMA_MODEL'],
    WORKER_LOCAL_MODEL_API_KEY: ['WORKER_LOCAL_MODEL_API_KEY', 'LOCAL_MODEL_API_KEY'],
    WORKER_LOCAL_MODEL_TIMEOUT_MS: ['WORKER_LOCAL_MODEL_TIMEOUT_MS', 'LOCAL_MODEL_TIMEOUT_MS'],
    LOCAL_MODEL_PROVIDER: ['WORKER_LOCAL_MODEL_PROVIDER', 'LOCAL_MODEL_PROVIDER'],
    LOCAL_MODEL_ENDPOINT: [
      'WORKER_LOCAL_MODEL_ENDPOINT',
      'LOCAL_MODEL_ENDPOINT',
      'WORKER_LOCAL_MODEL_BASE_URL',
      'LOCAL_MODEL_BASE_URL',
    ],
    LOCAL_MODEL_BASE_URL: ['WORKER_LOCAL_MODEL_BASE_URL', 'LOCAL_MODEL_BASE_URL'],
    LOCAL_MODEL_NAME: ['WORKER_LOCAL_MODEL_NAME', 'LOCAL_MODEL_NAME'],
    LOCAL_MODEL_API_KEY: ['WORKER_LOCAL_MODEL_API_KEY', 'LOCAL_MODEL_API_KEY'],
    OLLAMA_HOST: ['WORKER_LOCAL_OLLAMA_HOST', 'OLLAMA_HOST'],
    OLLAMA_MODEL: ['WORKER_LOCAL_OLLAMA_MODEL', 'OLLAMA_MODEL'],
  });
}

function readOptionalEnvAliasMap(aliasMap) {
  return Object.fromEntries(
    Object.entries(aliasMap)
      .map(([targetName, sourceNames]) => [targetName, readFirstOptionalStringEnv(...sourceNames)])
      .filter(([, value]) => value !== undefined),
  );
}

function readFirstOptionalStringEnv(...names) {
  for (const name of names) {
    const value = readOptionalStringEnv(name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readOptionalStringEnv(name) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function createWranglerVarArgs(vars) {
  return Object.entries(vars).flatMap(([name, value]) => ['--var', `${name}:${value}`]);
}

function readPreviewLocalModelLabel() {
  const model = readFirstOptionalStringEnv('WORKER_LOCAL_MODEL_NAME', 'LOCAL_MODEL_NAME', 'OLLAMA_MODEL')
    ?? 'llama3.2:3b';
  const baseUrl = readFirstOptionalStringEnv(
    'WORKER_LOCAL_MODEL_BASE_URL',
    'LOCAL_MODEL_BASE_URL',
    'WORKER_LOCAL_MODEL_ENDPOINT',
    'LOCAL_MODEL_ENDPOINT',
    'OLLAMA_HOST',
  ) ?? 'http://127.0.0.1:11434';
  return `${model} via ${baseUrl}`;
}

function createPreviewDocument() {
  const document = createLocalSmokeDocument({
    workspaceId: previewConfig.workspaceId,
    noteId: previewConfig.noteId,
    blockId: previewConfig.blockId,
  });
  const paragraphFixtureId = blockFixtures.find((block) => block.origin === 'user' && block.type === 'paragraph')?.id;
  const now = Date.now();

  document.blocks = [
    ...document.blocks,
    {
      id: 'block_ai_memory_preview_001',
      noteId: previewConfig.noteId,
      sectionId: document.sections[0]?.id,
      type: 'ai_memory_candidate',
      contentJson: {
        text: 'エディタの操作感を覚えておきたい。',
        annotations: [
          {
            kind: 'source_span',
            sourceBlockId: previewConfig.blockId,
            startOffset: 0,
            endOffset: 24,
            reason: 'Memory candidate is source-backed.',
          },
        ],
      },
      plainText: 'エディタの操作感を覚えておきたい。',
      position: document.blocks.length,
      origin: 'ai',
      contentHash: 'hash_block_ai_memory_preview_001',
      createdAt: now,
      updatedAt: now,
    },
  ];

  if (paragraphFixtureId !== undefined && paragraphFixtureId !== previewConfig.blockId) {
    document.blocks = document.blocks.map((block) => ({
      ...block,
      contentJson: rewriteAnnotationSourceBlockIds(block.contentJson, paragraphFixtureId, previewConfig.blockId),
    }));
  }

  return document;
}

function createPreviewDigest() {
  return {
    available: true,
    noteId: previewConfig.noteId,
    triggerReason: 'next_open',
    preparedAt: Date.now(),
    recoveredJobCount: 0,
    unresolvedQuestions: [
      {
        id: 'digest_preview_001',
        text: 'MVP の優先順位を3つに整理\n執筆フローを最優先に置く',
        sourceBlockId: previewConfig.blockId,
      },
      {
        id: 'digest_preview_002',
        text: 'return layer の情報量\n最大3件・2行以内',
      },
      {
        id: 'digest_preview_003',
        text: 'AI 提案と user text の視覚的分離\n色だけに頼らない',
      },
    ],
    decisions: [
      { id: 'digest_decision_001', text: 'framework-neutral NoteSurface を維持する' },
    ],
    memoryCandidates: [
      { id: 'digest_memory_001', text: 'ローカルプレビュー用の seed を整備する' },
    ],
  };
}

function rewriteAnnotationSourceBlockIds(contentJson, previousBlockId, nextBlockId) {
  if (!isRecord(contentJson) || previousBlockId === nextBlockId) {
    return contentJson;
  }
  const annotations = Array.isArray(contentJson.annotations)
    ? contentJson.annotations.map((annotation) => (
        isRecord(annotation) && annotation.sourceBlockId === previousBlockId
          ? { ...annotation, sourceBlockId: nextBlockId }
          : annotation
      ))
    : undefined;

  return annotations === undefined ? contentJson : { ...contentJson, annotations };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: createPreviewHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`seed request failed (${response.status}): ${text}`);
  }
}

function createPreviewHeaders(extraHeaders = {}) {
  return {
    ...extraHeaders,
    'x-workspace-id': previewConfig.workspaceId,
    'x-user-id': previewConfig.userId,
  };
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function runNpmScript(name) {
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', name], {
      stdio: 'inherit',
      cwd: new URL('../', import.meta.url),
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm run ${name} failed with exit code ${code}`));
    });
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
