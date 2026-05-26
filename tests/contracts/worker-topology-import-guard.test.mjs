import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const workerSrcRoot = fileURLToPath(new URL('apps/worker/src/', root));

const importPattern = /from\s+['"]([^'"]+)['"]/g;

const COMPOSITION_CLOUDFLARE_ALLOWLIST = new Set([
  'runtime/cloudflare/cloudflareAgentBindings',
  'runtime/cloudflare/cloudflareAgentRpcBoundary',
  'runtime/cloudflare/cloudflareWorkspaceBrainEnqueueRpc',
]);

const STRUCTURE_JOB_SCHEDULER_ALLOWLIST = new Set([
  'scheduler/structureJobWorkQueuePort',
]);

async function listTsFiles(dirPath, files = []) {
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await listTsFiles(entryPath, files);
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(path.posix.relative('apps/worker/src', entryPath));
    }
  }
  return files;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const fromDir = path.posix.dirname(fromFile);
  return path.posix.normalize(path.posix.join(fromDir, specifier)).replace(/\.ts$/, '');
}

function folderOf(filePath) {
  const normalized = filePath.replace(/\.ts$/, '');
  if (normalized.startsWith('runtime/cloudflare/')) {
    return 'runtime/cloudflare';
  }
  if (normalized.startsWith('runtime/http/')) {
    return 'runtime/http';
  }
  if (normalized.startsWith('runtime/composition/')) {
    return 'runtime/composition';
  }
  if (normalized.startsWith('runtime/local-verification/')) {
    return 'runtime/local-verification';
  }
  if (normalized.startsWith('ai-operations/structure-job/')) {
    return 'ai-operations/structure-job';
  }
  if (normalized.startsWith('ai-operations/')) {
    return 'ai-operations';
  }
  if (normalized.startsWith('scheduler/')) {
    return 'scheduler';
  }
  if (normalized.startsWith('context-assembly/')) {
    return 'context-assembly';
  }
  if (normalized.startsWith('memory/')) {
    return 'memory';
  }
  if (normalized.startsWith('note-model/')) {
    return 'note-model';
  }
  return normalized.split('/')[0] ?? normalized;
}

function importsContextsContract(resolvedPath) {
  return resolvedPath.includes('/contexts/') || resolvedPath.startsWith('contexts/');
}

function isSqlAdapterImport(resolvedPath) {
  return /SqlAdapter$/.test(resolvedPath) || resolvedPath.includes('/turso');
}

function isForbiddenImport(fromFile, fromFolder, resolvedPath, toFolder) {
  if (fromFolder === 'runtime/cloudflare' && importsContextsContract(resolvedPath)) {
    return true;
  }

  if (fromFolder === 'memory' && toFolder === 'ai-operations') {
    return true;
  }
  if (fromFolder === 'scheduler' &&
    (toFolder === 'ai-operations' || toFolder === 'ai-operations/structure-job' || toFolder === 'context-assembly' || toFolder === 'memory')) {
    return true;
  }
  if (fromFolder === 'context-assembly' && toFolder === 'ai-operations') {
    return true;
  }
  if (fromFolder === 'note-model' &&
    (toFolder === 'scheduler' || toFolder === 'context-assembly' || toFolder === 'memory' || toFolder === 'ai-operations' || toFolder === 'runtime/local-verification')) {
    return true;
  }
  if (fromFolder === 'memory' &&
    (toFolder === 'scheduler' || toFolder === 'context-assembly' || toFolder === 'ai-operations' || toFolder === 'runtime/local-verification')) {
    return true;
  }
  if (fromFolder === 'ai-operations' && !fromFile.startsWith('ai-operations/structure-job/') &&
    (toFolder === 'scheduler' || toFolder === 'context-assembly')) {
    return true;
  }
  if (fromFile.startsWith('ai-operations/structure-job/') && toFolder === 'scheduler' &&
    !STRUCTURE_JOB_SCHEDULER_ALLOWLIST.has(resolvedPath)) {
    return true;
  }
  if (fromFolder === 'runtime/http' &&
    (toFolder === 'runtime/cloudflare' || toFolder === 'runtime/local-verification' || isSqlAdapterImport(resolvedPath))) {
    return true;
  }
  if (fromFolder === 'runtime/cloudflare' && toFolder !== 'runtime/cloudflare' &&
    toFolder !== 'runtime/composition' && toFolder !== 'runtime/local-verification' &&
    !(fromFile === 'runtime/cloudflare/cloudflareWorkerEntrypoint.ts' && toFolder === 'runtime/http')) {
    return true;
  }
  if (fromFolder === 'runtime/composition' && toFolder === 'runtime/cloudflare' &&
    !COMPOSITION_CLOUDFLARE_ALLOWLIST.has(resolvedPath)) {
    return true;
  }
  if (fromFolder !== 'runtime/composition' && fromFolder !== 'runtime/cloudflare' &&
    toFolder === 'runtime/local-verification') {
    return true;
  }
  if (fromFile === 'runtime/cloudflare/cloudflareAgentBindings.ts' &&
    (toFolder === 'scheduler' || toFolder === 'context-assembly' || toFolder === 'memory' ||
      toFolder === 'ai-operations' || toFolder === 'note-model')) {
    return true;
  }
  return false;
}

test('worker topology import guard enforces allowed import direction', async () => {
  const files = await listTsFiles(workerSrcRoot);
  const violations = [];

  for (const file of files) {
    const source = await readFile(path.join(workerSrcRoot, file), 'utf8');
    const fromFolder = folderOf(file);
    for (const match of source.matchAll(importPattern)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved === null) {
        continue;
      }
      const toFolder = folderOf(`${resolved}.ts`);
      if (isForbiddenImport(file, fromFolder, resolved, toFolder)) {
        violations.push(`${file} -> ${resolved}`);
      }
    }
  }

  const memoryBoundary = await readFile(
    path.join(workerSrcRoot, 'memory/memoryCandidateProposalBoundary.ts'),
    'utf8',
  );
  assert.doesNotMatch(memoryBoundary, /operationApprovalRuntimeHandlers/);
  assert.doesNotMatch(memoryBoundary, /ApprovedOperationIntent/);

  assert.deepEqual(violations, []);
});

test('worker topology import guard rejects runtime/cloudflare contexts contract imports', () => {
  assert.equal(
    isForbiddenImport(
      'runtime/cloudflare/cloudflareDurableObjectAgents.ts',
      'runtime/cloudflare',
      'contexts/scheduler/src/contract/structureSchedulerContract',
      'scheduler',
    ),
    true,
  );
});

test('worker topology import guard rejects structure-job scheduler shortcut imports', () => {
  assert.equal(
    isForbiddenImport(
      'ai-operations/structure-job/structureJobProcessorFlow.ts',
      'ai-operations/structure-job',
      'scheduler/structureSchedulerRuntimeFlow',
      'scheduler',
    ),
    true,
  );
  assert.equal(
    isForbiddenImport(
      'ai-operations/structure-job/structureJobProcessorFlow.ts',
      'ai-operations/structure-job',
      'scheduler/structureJobWorkQueuePort',
      'scheduler',
    ),
    false,
  );
});

test('worker topology import guard rejects composition cloudflare imports outside allowlist', () => {
  assert.equal(
    isForbiddenImport(
      'runtime/composition/workerRuntimePorts.ts',
      'runtime/composition',
      'runtime/cloudflare/cloudflareDurableObjectAgents',
      'runtime/cloudflare',
    ),
    true,
  );
  assert.equal(
    isForbiddenImport(
      'runtime/composition/cloudflareVerificationWiring.ts',
      'runtime/composition',
      'runtime/cloudflare/cloudflareAgentRpcBoundary',
      'runtime/cloudflare',
    ),
    false,
  );
});
