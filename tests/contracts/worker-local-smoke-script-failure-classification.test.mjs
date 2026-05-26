import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';

const repoRoot = new URL('../..', import.meta.url);
const scriptPath = new URL('../../scripts/smoke-worker-local-runtime.mjs', import.meta.url);
const wranglerDevPath = new URL('../../scripts/worker-local-smoke/wranglerDev.mjs', import.meta.url);
const failureClassificationPath = new URL('../../scripts/worker-local-smoke/failureClassification.mjs', import.meta.url);
const httpSmokeRunnerPath = new URL('../../scripts/worker-local-smoke/httpSmokeRunner.mjs', import.meta.url);

test('local smoke script injects only required local Worker vars into script-launched Wrangler', async () => {
  const wranglerSource = await readFile(wranglerDevPath, 'utf8');
  const entrypointSource = await readFile(scriptPath, 'utf8');

  assert.match(wranglerSource, /'--var'[\s\S]*`LOCAL_AGENT_SMOKE_ENABLED:\$\{process\.env\.LOCAL_AGENT_SMOKE_ENABLED\s*\?\?\s*'1'\}`/);
  assert.match(wranglerSource, /args\.push\('--var',\s*`WORKER_AUTH_SHARED_SECRET:\$\{authSecret\}`\)/);
  assert.match(wranglerSource, /WRANGLER_LOG_PATH:\s*process\.env\.WRANGLER_LOG_PATH\s*\?\?\s*defaultWranglerLogPath/);
  assert.match(wranglerSource, /WRANGLER_REGISTRY_PATH:\s*process\.env\.WRANGLER_REGISTRY_PATH\s*\?\?\s*defaultWranglerRegistryPath/);
  assert.match(wranglerSource, /WRANGLER_CI_DISABLE_CONFIG_WATCHING:\s*process\.env\.WRANGLER_CI_DISABLE_CONFIG_WATCHING\s*\?\?\s*'true'/);
  assert.match(wranglerSource, /XDG_CONFIG_HOME:\s*process\.env\.XDG_CONFIG_HOME\s*\?\?\s*defaultWranglerXdgConfigHome/);
  assert.doesNotMatch(wranglerSource, /CLOUDFLARE_INCLUDE_PROCESS_ENV/);
  assert.doesNotMatch(entrypointSource, /spawn\(/);
});

test('local smoke modules keep failure classification separated from HTTP runner', async () => {
  const failureSource = await readFile(failureClassificationPath, 'utf8');
  const httpSource = await readFile(httpSmokeRunnerPath, 'utf8');

  assert.match(failureSource, /export class SetupFailure/);
  assert.match(failureSource, /export class SmokeFailure/);
  assert.match(failureSource, /export class BlockerFailure/);
  assert.doesNotMatch(httpSource, /export class (?:SetupFailure|SmokeFailure|BlockerFailure)/);
});

test('local smoke script reports setup failure for invalid seed/reset setup body', async () => {
  await withServer(async (request, response) => {
    if (request.url === '/__local/smoke/reset') {
      writeJson(response, 200, {
        ok: true,
        reset: true,
        localAgents: {
          noteAgentSchema: { ok: true },
        },
      });
      return;
    }

    writeJson(response, 500, { ok: false });
  }, async (baseUrl) => {
    const result = await runSmokeScript(baseUrl);

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /^setup failure: body\.localAgents\.workspaceBrainSchema\.ok expected true/m);
    assert.doesNotMatch(result.stderr, /^smoke failure:/m);
  });
});

test('local smoke script reports blocked for missing local WorkspaceBrain trigger', async () => {
  await withServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://worker.test');

    if (url.pathname === '/__local/smoke/reset') {
      writeJson(response, 200, {
        ok: true,
        reset: true,
        localAgents: localAgentSetup(),
      });
      return;
    }

    if (url.pathname === '/__local/smoke/seed') {
      writeJson(response, 200, {
        ok: true,
        seeded: {
          workspaceId: 'workspace_local',
          noteId: 'note_local',
        },
        localAgents: {
          ...localAgentSetup(),
          noteAgentSchedulerSnapshot: { ok: true },
        },
      });
      return;
    }

    if (url.pathname === '/notes/note_local' && request.method === 'GET') {
      if (request.headers['x-worker-auth-secret'] === 'secret_local:invalid') {
        writeJson(response, 401, {
          ok: false,
          errors: ['worker auth credentials are invalid'],
        });
        return;
      }

      writeJson(response, 200, {
        ok: true,
        document: {
          note: { id: 'note_local' },
        },
      });
      return;
    }

    if (url.pathname === '/blocks/block_local' && request.method === 'PATCH') {
      const body = await readJson(request);
      writeJson(response, 200, {
        ok: true,
        result: {
          block: {
            id: 'block_local',
            plainText: body.content,
          },
        },
      });
      return;
    }

    if (url.pathname === '/notes/note_local/leave' && request.method === 'POST') {
      writeJson(response, 202, {
        ok: true,
        route: 'note_leave',
        triggerReason: 'tab_switched',
      });
      return;
    }

    if (url.pathname === '/notes/note_local/structure/manual' && request.method === 'POST') {
      writeJson(response, 202, {
        ok: true,
        route: 'manual_organize',
        triggerReason: 'manual_organize',
      });
      return;
    }

    if (url.pathname === '/notes/note_local/digest' && request.method === 'GET') {
      writeJson(response, 200, {
        ok: true,
        result: { noteId: 'note_local' },
      });
      return;
    }

    writeJson(response, 404, { ok: false, errors: ['not found'] });
  }, async (baseUrl) => {
    const result = await runSmokeScript(baseUrl);

    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /^blocked: workspace brain process trigger expected HTTP 202 but received 404/m);
    assert.doesNotMatch(result.stderr, /^smoke failure:/m);
  });
});

function localAgentSetup() {
  return {
    noteAgentSchema: { ok: true },
    workspaceBrainSchema: { ok: true },
  };
}

async function withServer(handler, callback) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(JSON.stringify({ ok: false, error: error.message }));
    });
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

async function runSmokeScript(baseUrl) {
  const child = spawn(process.execPath, [scriptPath.pathname], {
    cwd: repoRoot.pathname,
    env: {
      ...sanitizedProcessEnv(),
      WORKER_LOCAL_URL: baseUrl,
      WORKER_SMOKE_WORKSPACE_ID: 'workspace_local',
      WORKER_SMOKE_USER_ID: 'user_local',
      WORKER_SMOKE_AUTH_SECRET: 'secret_local',
      WORKER_SMOKE_NOTE_ID: 'note_local',
      WORKER_SMOKE_BLOCK_ID: 'block_local',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  let timeout;
  const exitCode = await Promise.race([
    new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1))),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(124);
      }, 10_000);
    }),
  ]);
  clearTimeout(timeout);

  return { exitCode, stdout, stderr };
}

function sanitizedProcessEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => (
      !key.startsWith('WORKER_')
      && key !== 'LOCAL_AGENT_SMOKE_ENABLED'
      && key !== 'WRANGLER_BIN'
    )),
  );
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
