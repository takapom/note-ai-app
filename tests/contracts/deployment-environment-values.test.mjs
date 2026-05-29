import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

const wranglerPath = 'wrangler.toml';
const publicHtmlPath = 'apps/web/public/index.html';
const browserMountPath = 'apps/web/src/browserNoteSurfaceMount.ts';
const workerEntrypointPath = 'apps/worker/src/runtime/http/workerEntrypoint.ts';
const workerEntrypointEnvPath = 'apps/worker/src/runtime/composition/workerEntrypointEnv.ts';
const workerAuthBoundaryPath = 'apps/worker/src/runtime/http/workerAuthBoundary.ts';

const trackedRuntimeValueNames = [
  'TURSO',
  'TURSO_CLIENT',
  'AGENT_LOCAL_SQL',
  'LIBSQL',
  'DATABASE',
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'API_KEY',
  'WORKSPACE_ID',
  'USER_ID',
  'NOTE_ID',
  'WORKER_AUTH_SHARED_SECRET',
  'AUTH_SHARED_SECRET',
];

const allowedDatasetKeys = new Set([
  'apiBaseUrl',
  'workspaceId',
  'noteId',
  'userId',
  'workspaceName',
  'expandedDigest',
  'viewStateJson',
  'projectionMapsJson',
]);

test('wrangler config stays a deployment descriptor without runtime values', async () => {
  const source = await readText(wranglerPath);

  assert.doesNotMatch(source, /\[\[?(?:vars|secrets)\]?\]/i);
  assert.doesNotMatch(source, forbiddenRuntimeIdentifierPattern());
  assert.doesNotMatch(source, runtimeValueAssignmentPattern());
  assert.doesNotMatch(source, sentinelRuntimeIdPattern());
});

test('public HTML leaves browser root metadata for deployment injection', async () => {
  const html = await readText(publicHtmlPath);

  assert.match(html, /<main data-note-surface-root><\/main>/);
  assert.match(html, /Deployment runtime supplies required metadata through \/__ann\/bootstrap\./);
  assert.match(html, /\/__ann\/bootstrap/);

  for (const key of ['api-base-url', 'workspace-id', 'note-id', 'user-id']) {
    assert.doesNotMatch(
      html,
      new RegExp(`\\bdata-${key}\\s*=\\s*["'][^"']*["']`, 'i'),
      `public HTML must not inline data-${key}`,
    );
  }

  assert.doesNotMatch(html, sentinelRuntimeIdPattern());
  assert.doesNotMatch(html, /\b(?:https?:\/\/|libsql:\/\/)[^"'\s<>]+/i);
});

test('browser mount adapter only reads deployment-owned dataset keys', async () => {
  const source = await readText(browserMountPath);
  const readDatasetKeys = new Set([...source.matchAll(/\bdataset\.([A-Za-z][A-Za-z0-9_]*)\b/g)].map((match) => match[1]));

  assert.deepEqual([...readDatasetKeys].sort(), [...allowedDatasetKeys].sort());
  assert.doesNotMatch(source, /\b(?:workspace_001|user_001|note_001|placeholder|sentinel|unset)\b/i);
});

test('Worker env interfaces declare optional deployment-supplied bindings without values', async () => {
  const entrypointEnvSource = await readText(workerEntrypointEnvPath);
  const authBoundarySource = await readText(workerAuthBoundaryPath);
  const entrypointEnv = interfaceBody(entrypointEnvSource, 'WorkerEntrypointEnv');
  const authBoundaryEnv = interfaceBody(authBoundarySource, 'WorkerAuthBoundaryEnv');

  for (const key of ['WORKSPACE_ID', 'USER_ID', 'WORKER_AUTH_SHARED_SECRET', 'AUTH_SHARED_SECRET']) {
    assert.match(authBoundaryEnv, new RegExp(`\\b${key}\\?:\\s*unknown\\b`));
    assert.match(entrypointEnv, new RegExp(`\\b${key}\\?:\\s*string\\b`));
  }

  assert.match(entrypointEnv, /\bNOTE_ID\?:\s*string\b/);
  assert.doesNotMatch(authBoundaryEnv, /\bNOTE_ID\b/);

  for (const key of ['TURSO', 'TURSO_CLIENT', 'AGENT_LOCAL_SQL']) {
    assert.match(entrypointEnv, new RegExp(`\\b${key}\\?:\\s*WorkerTursoClient\\b`));
  }
  for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'LIBSQL_DATABASE_URL', 'LIBSQL_AUTH_TOKEN']) {
    assert.match(entrypointEnv, new RegExp(`\\b${key}\\?:\\s*string\\b`));
  }

  assert.doesNotMatch(entrypointEnv, /=\s*["'][^"']+["']/);
  assert.doesNotMatch(authBoundaryEnv, /=\s*["'][^"']+["']/);
});

function runtimeValueAssignmentPattern() {
  return new RegExp(`\\b[A-Z0-9_]*(?:${trackedRuntimeValueNames.join('|')})[A-Z0-9_]*\\b\\s*=\\s*["'][^"']+["']`, 'i');
}

function forbiddenRuntimeIdentifierPattern() {
  return new RegExp(`\\b[A-Z0-9_]*(?:${trackedRuntimeValueNames.join('|')})[A-Z0-9_]*\\b`, 'i');
}

function sentinelRuntimeIdPattern() {
  return /\b(?:workspace|user|note)_(?:001|example|placeholder|sentinel|unset|unknown|null|undefined)\b/i;
}

function interfaceBody(source, interfaceName) {
  const match = new RegExp(`export\\s+interface\\s+${interfaceName}\\s+extends[^\\{]*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(source)
    ?? new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(source);
  assert.notEqual(match, null, `${interfaceName} interface must exist`);
  return match[1];
}

async function readText(path) {
  return readFile(new URL(path, root), 'utf8');
}
