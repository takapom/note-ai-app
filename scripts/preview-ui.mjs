#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

import { blockFixtures } from '../contexts/note-model/src/contract/noteFixtures.ts';
import { createLocalSmokeDocument } from './worker-local-smoke/fixtures.mjs';
import { defaultPort, readWranglerBaseConfig, waitForWorkerReadiness } from './worker-local-smoke/wranglerDev.mjs';

async function requireWranglerViaNpx() {
  const child = spawn('npx', ['wrangler', '--version'], { stdio: 'pipe' });
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error('Wrangler is required. Install with: npm install -g wrangler (or use: npm run preview:ui:static)');
  }
}

const previewConfig = {
  workspaceId: 'workspace_local_preview',
  userId: 'user_local_preview',
  noteId: 'note_local_preview',
  blockId: 'block_local_preview',
};

async function main() {
  if (!process.argv.includes('--no-build')) {
    await runNpmScript('build:web');
  }

  const baseConfig = readWranglerBaseConfig();
  const wrangler = process.env.WRANGLER_BIN ?? 'npx';
  const wranglerArgs = process.env.WRANGLER_BIN === undefined
    ? ['wrangler']
    : [];
  if (process.env.WRANGLER_BIN === undefined) {
    await requireWranglerViaNpx();
  }
  const child = spawn(
    wrangler,
    [
      ...wranglerArgs,
      'dev',
      '--port',
      String(baseConfig.port ?? defaultPort),
      '--persist-to',
      baseConfig.persistTo,
      '--var',
      `LOCAL_AGENT_SMOKE_ENABLED:${process.env.LOCAL_AGENT_SMOKE_ENABLED ?? '1'}`,
    ],
    {
      stdio: 'inherit',
      cwd: new URL('../', import.meta.url),
    },
  );

  process.stdout.write('Waiting for local Worker...\n');
  await waitForWorkerReadiness(baseConfig.baseUrl, child, fetch);
  await seedPreviewRuntime(baseConfig.baseUrl);
  process.stdout.write('\n');
  process.stdout.write('Open: http://127.0.0.1:8787/dev.html\n');
  process.stdout.write('Press Ctrl+C to stop Wrangler.\n\n');

  await new Promise((resolve, reject) => {
    child.on('exit', (code) => {
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
    headers: {
      'content-type': 'application/json',
      'x-workspace-id': previewConfig.workspaceId,
      'x-user-id': previewConfig.userId,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`seed request failed (${response.status}): ${text}`);
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
