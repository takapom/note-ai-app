#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  blockFixtures,
  noteDocumentFixture,
} from '../contexts/note-model/src/contract/noteFixtures.ts';

const defaultPort = 8787;
const defaultPersistTo = '.wrangler/state';
const startupTimeoutMs = readPositiveIntegerEnv('WORKER_LOCAL_STARTUP_TIMEOUT_MS', 30_000);
const requestTimeoutMs = readPositiveIntegerEnv('WORKER_LOCAL_REQUEST_TIMEOUT_MS', 8_000);
const maxBodyLogChars = readPositiveIntegerEnv('WORKER_LOCAL_SMOKE_BODY_LOG_CHARS', 1_200);

class SetupFailure extends Error {}
class SmokeFailure extends Error {}
class BlockerFailure extends Error {}

async function main() {
  const serveOnly = process.argv.includes('--serve-only');
  const config = readConfig({ serveOnly });
  const wrangler = config.externalUrl === undefined
    ? await requireWrangler()
    : undefined;

  if (serveOnly) {
    if (wrangler === undefined) {
      throw new SetupFailure('worker:local --serve-only cannot use WORKER_LOCAL_URL; unset WORKER_LOCAL_URL so Wrangler can be launched.');
    }
    const child = startWrangler({ wrangler, config, stdio: 'inherit' });
    await waitForChildExit(child);
    return;
  }

  let child;
  let removeSignalHandlers = () => {};
  if (config.externalUrl === undefined) {
    child = startWrangler({ wrangler, config, stdio: 'pipe' });
    removeSignalHandlers = installChildCleanupHandlers(child);
    await waitForWorkerReadiness(config.baseUrl, child);
  }

  try {
    await runSmoke(config);
  } finally {
    removeSignalHandlers();
    if (child !== undefined) {
      await stopChild(child);
    }
  }
}

function readConfig({ serveOnly }) {
  const port = readPositiveIntegerEnv('WORKER_LOCAL_PORT', defaultPort);
  const persistTo = process.env.WORKER_LOCAL_PERSIST_TO ?? defaultPersistTo;
  const externalUrl = process.env.WORKER_LOCAL_URL;
  const baseUrl = externalUrl === undefined
    ? `http://127.0.0.1:${port}`
    : normalizeBaseUrl(externalUrl, 'WORKER_LOCAL_URL');

  if (serveOnly) {
    return { port, persistTo, baseUrl, externalUrl };
  }

  return {
    port,
    persistTo,
    baseUrl,
    externalUrl,
    workspaceId: readRequiredEnv('WORKER_SMOKE_WORKSPACE_ID'),
    userId: readRequiredEnv('WORKER_SMOKE_USER_ID'),
    authSecret: readRequiredEnv('WORKER_SMOKE_AUTH_SECRET'),
    noteId: readRequiredEnv('WORKER_SMOKE_NOTE_ID'),
    blockId: readRequiredEnv('WORKER_SMOKE_BLOCK_ID'),
    workspaceBrainPath: readOptionalPathEnv('WORKER_SMOKE_WORKSPACE_BRAIN_PATH')
      ?? '/__local/agents/workspace/process',
  };
}

async function requireWrangler() {
  const command = process.env.WRANGLER_BIN ?? 'wrangler';
  const result = await runCommand(command, ['--version'], 5_000);

  if (result.error?.code === 'ENOENT') {
    throw new SetupFailure(
      'wrangler is required for local Worker smoke. Install the Cloudflare Wrangler CLI or set WRANGLER_BIN to an installed executable.',
    );
  }
  if (result.exitCode !== 0) {
    throw new SetupFailure(
      `wrangler was found but could not run --version. ${formatCommandFailure(result)}`,
    );
  }

  return command;
}

function startWrangler({ wrangler, config, stdio }) {
  const args = [
    'dev',
    '--port',
    String(config.port),
    '--persist-to',
    config.persistTo,
    '--var',
    `LOCAL_AGENT_SMOKE_ENABLED:${process.env.LOCAL_AGENT_SMOKE_ENABLED ?? '1'}`,
  ];
  if (config.authSecret !== undefined) {
    args.push('--var', `WORKER_AUTH_SHARED_SECRET:${config.authSecret}`);
  }
  const child = spawn(wrangler, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: process.env.NO_COLOR ?? '1',
    },
    stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });

  if (stdio === 'pipe') {
    child.stdout?.on('data', (chunk) => writePrefixedOutput('wrangler', chunk));
    child.stderr?.on('data', (chunk) => writePrefixedOutput('wrangler', chunk));
  }

  child.once('error', (error) => {
    if (error.code === 'ENOENT') {
      process.stderr.write('setup failure: wrangler executable was not found\n');
    } else {
      process.stderr.write(`setup failure: wrangler failed to start: ${error.message}\n`);
    }
  });

  return child;
}

async function waitForWorkerReadiness(baseUrl, child) {
  const deadline = Date.now() + startupTimeoutMs;
  const readyUrl = new URL('/__lcwa_smoke_readiness__', baseUrl);

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new SetupFailure(`wrangler exited before the Worker became ready with status ${child.exitCode}`);
    }

    try {
      await fetchWithTimeout(readyUrl, { method: 'GET' });
      return;
    } catch {
      await delay(250);
    }
  }

  throw new SetupFailure(`local Worker did not respond at ${baseUrl} within ${startupTimeoutMs}ms`);
}

async function runSmoke(config) {
  await seedLocalSmokeRuntime(config);

  const patchContent = 'LCWA local HTTP smoke block update reached the Worker boundary.';
  const cases = [
    {
      label: 'get note',
      method: 'GET',
      path: `/notes/${encodeURIComponent(config.noteId)}`,
      expectStatus: 200,
      validateBody(body) {
        assertEqual(body.ok, true, 'body.ok');
        assertEqual(body.document?.note?.id, config.noteId, 'body.document.note.id');
      },
    },
    {
      label: 'patch block',
      method: 'PATCH',
      path: `/blocks/${encodeURIComponent(config.blockId)}`,
      body: {
        noteId: config.noteId,
        content: patchContent,
      },
      expectStatus: 200,
      validateBody(body) {
        assertEqual(body.ok, true, 'body.ok');
        assertEqual(body.result?.block?.id, config.blockId, 'body.result.block.id');
        assertEqual(body.result?.block?.plainText, patchContent, 'body.result.block.plainText');
      },
    },
    {
      label: 'note leave',
      method: 'POST',
      path: `/notes/${encodeURIComponent(config.noteId)}/leave`,
      body: { cause: 'tab_switch' },
      expectStatus: 202,
      validateBody(body) {
        assertEqual(body.ok, true, 'body.ok');
        assertEqual(body.route, 'note_leave', 'body.route');
        assertEqual(body.triggerReason, 'tab_switched', 'body.triggerReason');
      },
    },
    {
      label: 'manual structure',
      method: 'POST',
      path: `/notes/${encodeURIComponent(config.noteId)}/structure/manual`,
      expectStatus: 202,
      validateBody(body) {
        assertEqual(body.ok, true, 'body.ok');
        assertEqual(body.route, 'manual_organize', 'body.route');
        assertEqual(body.triggerReason, 'manual_organize', 'body.triggerReason');
      },
    },
    {
      label: 'get digest',
      method: 'GET',
      path: `/notes/${encodeURIComponent(config.noteId)}/digest`,
      expectStatus: 200,
      validateBody(body) {
        assertEqual(body.ok, true, 'body.ok');
        assertEqual(body.result?.noteId, config.noteId, 'body.result.noteId');
      },
    },
    {
      label: 'invalid auth',
      method: 'GET',
      path: `/notes/${encodeURIComponent(config.noteId)}`,
      authSecret: `${config.authSecret}:invalid`,
      expectStatus: 401,
      validateBody(body) {
        assertEqual(body.ok, false, 'body.ok');
        assertArrayIncludes(body.errors, 'worker auth credentials are invalid', 'body.errors');
      },
    },
  ];

  for (const smokeCase of cases) {
    await runSmokeCase(config, smokeCase);
  }

  await runBlockerCase(config, {
    label: 'workspace brain process trigger',
    method: 'POST',
    path: config.workspaceBrainPath,
    body: {
      workspaceId: config.workspaceId,
      userId: config.userId,
      now: Date.now(),
    },
    expectStatus: 202,
    validateBody(body, FailureClass) {
      assertEqual(body.ok, true, 'body.ok', FailureClass);
    },
  });

  process.stdout.write('local Worker HTTP smoke passed\n');
}

async function seedLocalSmokeRuntime(config) {
  const document = createLocalSmokeDocument(config);
  const nextOpenDigest = {
    available: true,
    noteId: config.noteId,
    triggerReason: 'next_open',
    preparedAt: Date.now(),
    recoveredJobCount: 0,
    sections: [],
    items: [],
  };

  await runSetupCase(config, {
    label: 'reset local smoke runtime',
    method: 'POST',
    path: '/__local/smoke/reset',
    body: { noteId: config.noteId },
    validateBody(body, FailureClass) {
      assertEqual(body.ok, true, 'body.ok', FailureClass);
      assertEqual(body.reset, true, 'body.reset', FailureClass);
      assertLocalAgentSetup(body, FailureClass);
    },
  });
  await runSetupCase(config, {
    label: 'seed local smoke runtime',
    method: 'POST',
    path: '/__local/smoke/seed',
    body: { document, nextOpenDigest },
    validateBody(body, FailureClass) {
      assertEqual(body.ok, true, 'body.ok', FailureClass);
      assertEqual(body.seeded?.workspaceId, config.workspaceId, 'body.seeded.workspaceId', FailureClass);
      assertEqual(body.seeded?.noteId, config.noteId, 'body.seeded.noteId', FailureClass);
      assertLocalAgentSetup(body, FailureClass);
      if (body.localAgents?.noteAgentSchedulerSnapshot !== undefined) {
        assertEqual(
          body.localAgents.noteAgentSchedulerSnapshot.ok,
          true,
          'body.localAgents.noteAgentSchedulerSnapshot.ok',
          FailureClass,
        );
      }
    },
  });
}

async function runSetupCase(config, setupCase) {
  process.stdout.write(`\n# ${setupCase.label}\n${formatCurl(setupCase, config)}\n`);
  const response = await fetchWithTimeout(new URL(setupCase.path, config.baseUrl), {
    method: setupCase.method,
    headers: {
      'x-workspace-id': config.workspaceId,
      'x-user-id': config.userId,
      'x-worker-auth-secret': config.authSecret,
      'content-type': 'application/json',
    },
    body: JSON.stringify(setupCase.body),
  });
  const text = await response.text();
  process.stdout.write(`status: ${response.status}\nbody: ${truncateBody(text)}\n`);

  if (response.status !== 200) {
    throw new SetupFailure(`${setupCase.label} expected HTTP 200 but received ${response.status}`);
  }

  const body = parseJsonResponse(text, setupCase.label, SetupFailure);
  setupCase.validateBody(body, SetupFailure);
}

async function runSmokeCase(config, smokeCase) {
  const url = new URL(smokeCase.path, config.baseUrl);
  const headers = {
    'x-workspace-id': config.workspaceId,
    'x-user-id': config.userId,
    'x-worker-auth-secret': smokeCase.authSecret ?? config.authSecret,
  };
  let requestBody;
  if (smokeCase.body !== undefined) {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(smokeCase.body);
  }

  process.stdout.write(`\n# ${smokeCase.label}\n${formatCurl(smokeCase, config)}\n`);
  const response = await fetchWithTimeout(url, {
    method: smokeCase.method,
    headers,
    body: requestBody,
  });
  const text = await response.text();
  process.stdout.write(`status: ${response.status}\nbody: ${truncateBody(text)}\n`);

  if (response.status !== smokeCase.expectStatus) {
    throw new SmokeFailure(`${smokeCase.label} expected HTTP ${smokeCase.expectStatus} but received ${response.status}`);
  }

  const body = parseJsonResponse(text, smokeCase.label);
  smokeCase.validateBody(body);
}

async function runBlockerCase(config, blockerCase) {
  const url = new URL(blockerCase.path, config.baseUrl);
  const headers = {
    'x-workspace-id': config.workspaceId,
    'x-user-id': config.userId,
    'x-worker-auth-secret': blockerCase.authSecret ?? config.authSecret,
  };
  let requestBody;
  if (blockerCase.body !== undefined) {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(blockerCase.body);
  }

  process.stdout.write(`\n# ${blockerCase.label}\n${formatCurl(blockerCase, config)}\n`);
  const response = await fetchWithTimeout(url, {
    method: blockerCase.method,
    headers,
    body: requestBody,
  });
  const text = await response.text();
  process.stdout.write(`status: ${response.status}\nbody: ${truncateBody(text)}\n`);

  if (response.status !== blockerCase.expectStatus) {
    throw new BlockerFailure(`${blockerCase.label} expected HTTP ${blockerCase.expectStatus} but received ${response.status}`);
  }

  const body = parseJsonResponse(text, blockerCase.label, BlockerFailure);
  blockerCase.validateBody(body, BlockerFailure);
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonResponse(text, label, FailureClass = SmokeFailure) {
  try {
    return JSON.parse(text);
  } catch {
    throw new FailureClass(`${label} response body must be JSON`);
  }
}

function formatCurl(smokeCase, config) {
  const url = new URL(smokeCase.path, config.baseUrl);
  const parts = [
    'curl',
    '-i',
    '-X',
    shellQuote(smokeCase.method),
    shellQuote(url.toString()),
    '-H',
    shellQuote('x-workspace-id: ${WORKER_SMOKE_WORKSPACE_ID}'),
    '-H',
    shellQuote('x-user-id: ${WORKER_SMOKE_USER_ID}'),
    '-H',
    shellQuote(
      smokeCase.authSecret === undefined
        ? 'x-worker-auth-secret: ${WORKER_SMOKE_AUTH_SECRET}'
        : 'x-worker-auth-secret: ${WORKER_SMOKE_AUTH_SECRET}:invalid',
    ),
  ];
  if (smokeCase.body !== undefined) {
    parts.push('-H', shellQuote('content-type: application/json'));
    parts.push('--data', shellQuote(JSON.stringify(smokeCase.body)));
  }
  return parts.join(' ');
}

function assertEqual(actual, expected, path, FailureClass = SmokeFailure) {
  if (actual !== expected) {
    throw new FailureClass(`${path} expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`);
  }
}

function assertArrayIncludes(actual, expected, path, FailureClass = SmokeFailure) {
  if (!Array.isArray(actual) || !actual.includes(expected)) {
    throw new FailureClass(`${path} expected to include ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`);
  }
}

function assertLocalAgentSetup(body, FailureClass = SmokeFailure) {
  assertEqual(body.localAgents?.noteAgentSchema?.ok, true, 'body.localAgents.noteAgentSchema.ok', FailureClass);
  assertEqual(
    body.localAgents?.workspaceBrainSchema?.ok,
    true,
    'body.localAgents.workspaceBrainSchema.ok',
    FailureClass,
  );
}

function createLocalSmokeDocument(config) {
  const document = structuredClone(noteDocumentFixture);
  const paragraphFixtureId = blockFixtures.find((block) => block.origin === 'user' && block.type === 'paragraph')?.id;

  document.note = {
    ...document.note,
    id: config.noteId,
    workspaceId: config.workspaceId,
  };
  document.sections = document.sections.map((section) => ({
    ...section,
    noteId: config.noteId,
  }));
  document.blocks = document.blocks.map((block) => {
    const nextId = block.id === paragraphFixtureId ? config.blockId : block.id;
    return {
      ...block,
      id: nextId,
      noteId: config.noteId,
      contentJson: rewriteAnnotationSourceBlockIds(block.contentJson, paragraphFixtureId, config.blockId),
    };
  });

  return document;
}

function rewriteAnnotationSourceBlockIds(contentJson, previousBlockId, nextBlockId) {
  if (previousBlockId === undefined || previousBlockId === nextBlockId || !isRecord(contentJson)) {
    return contentJson;
  }
  const annotations = Array.isArray(contentJson.annotations)
    ? contentJson.annotations.map((annotation) => (
        isRecord(annotation) && annotation.sourceBlockId === previousBlockId
          ? { ...annotation, sourceBlockId: nextBlockId }
          : annotation
      ))
    : undefined;

  return annotations === undefined
    ? contentJson
    : { ...contentJson, annotations };
}

function readRequiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new SetupFailure(`${name} must be supplied by the local operator environment for worker:local:smoke`);
  }
  return value;
}

function readOptionalPathEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  if (!value.startsWith('/')) {
    throw new SetupFailure(`${name} must be an absolute HTTP path starting with /`);
  }
  return value;
}

function readPositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SetupFailure(`${name} must be a positive integer`);
  }
  return value;
}

function normalizeBaseUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SetupFailure(`${name} must be a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SetupFailure(`${name} must use http or https`);
  }
  return url.toString();
}

async function runCommand(command, args, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ exitCode: 124, stdout, stderr });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      resolve({ exitCode: undefined, stdout, stderr, error });
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function formatCommandFailure(result) {
  const detail = `${result.stderr}\n${result.stdout}`.trim();
  return detail === '' ? 'No output was produced.' : truncateBody(detail);
}

function writePrefixedOutput(prefix, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.length > 0) {
      process.stdout.write(`[${prefix}] ${line}\n`);
    }
  }
}

async function waitForChildExit(child) {
  await new Promise((resolve) => {
    child.once('exit', resolve);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(3_000).then(() => false),
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

function installChildCleanupHandlers(child) {
  const handleSignal = async (signal) => {
    await stopChild(child);
    process.kill(process.pid, signal);
  };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  return () => {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  };
}

function truncateBody(value) {
  return value.length <= maxBodyLogChars
    ? value
    : `${value.slice(0, maxBodyLogChars)}...<truncated>`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

main().catch((error) => {
  const prefix = error instanceof SetupFailure
    ? 'setup failure'
    : error instanceof BlockerFailure
      ? 'blocked'
      : error instanceof SmokeFailure
        ? 'smoke failure'
        : 'unexpected failure';
  process.stderr.write(`${prefix}: ${error.message}\n`);
  process.exit(
    error instanceof SetupFailure
      ? 2
      : error instanceof BlockerFailure
        ? 3
        : 1,
  );
});
