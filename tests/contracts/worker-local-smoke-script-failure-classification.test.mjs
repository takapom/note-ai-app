import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';

const repoRoot = new URL('../..', import.meta.url);
const scriptPath = new URL('../../scripts/smoke-worker-local-runtime.mjs', import.meta.url);
const previewUiScriptPath = new URL('../../scripts/preview-ui.mjs', import.meta.url);
const wranglerDevPath = new URL('../../scripts/worker-local-smoke/wranglerDev.mjs', import.meta.url);
const failureClassificationPath = new URL('../../scripts/worker-local-smoke/failureClassification.mjs', import.meta.url);
const httpSmokeRunnerPath = new URL('../../scripts/worker-local-smoke/httpSmokeRunner.mjs', import.meta.url);
const localModelComposePath = new URL('../../compose.local-model.yml', import.meta.url);

test('local smoke script injects required local Worker vars into script-launched Wrangler', async () => {
  const wranglerSource = await readFile(wranglerDevPath, 'utf8');
  const entrypointSource = await readFile(scriptPath, 'utf8');
  const composeSource = await readFile(localModelComposePath, 'utf8');

  assert.match(wranglerSource, /'--var'[\s\S]*`LOCAL_AGENT_SMOKE_ENABLED:\$\{process\.env\.LOCAL_AGENT_SMOKE_ENABLED\s*\?\?\s*'1'\}`/);
  assert.match(wranglerSource, /args\.push\('--var',\s*`WORKER_AUTH_SHARED_SECRET:\$\{authSecret\}`\)/);
  assert.match(wranglerSource, /Object\.entries\(vars\s*\?\?\s*\{\}\)/);
  assert.match(entrypointSource, /WORKER_LOCAL_AUTH_SECRET/);
  assert.match(entrypointSource, /WORKER_SMOKE_AUTH_SECRET/);
  assert.match(entrypointSource, /WORKER_LOCAL_TURSO_DATABASE_URL/);
  assert.match(entrypointSource, /LOCAL_TURSO_DATABASE_URL/);
  assert.match(entrypointSource, /TURSO_DATABASE_URL/);
  assert.match(entrypointSource, /WORKER_LOCAL_TURSO_AUTH_TOKEN/);
  assert.match(entrypointSource, /LOCAL_TURSO_AUTH_TOKEN/);
  assert.match(entrypointSource, /TURSO_AUTH_TOKEN/);
  assert.match(entrypointSource, /readLocalWranglerVars/);
  assert.match(entrypointSource, /WORKER_LOCAL_MODEL_PROVIDER/);
  assert.match(entrypointSource, /LOCAL_MODEL_PROVIDER/);
  assert.match(entrypointSource, /WORKER_LOCAL_MODEL_ENDPOINT/);
  assert.match(entrypointSource, /LOCAL_MODEL_ENDPOINT/);
  assert.match(entrypointSource, /WORKER_LOCAL_MODEL_BASE_URL/);
  assert.match(entrypointSource, /LOCAL_MODEL_BASE_URL/);
  assert.match(entrypointSource, /WORKER_LOCAL_MODEL_NAME/);
  assert.match(entrypointSource, /LOCAL_MODEL_NAME/);
  assert.match(entrypointSource, /WORKER_LOCAL_OLLAMA_HOST/);
  assert.match(entrypointSource, /OLLAMA_HOST/);
  assert.match(entrypointSource, /WORKER_LOCAL_OLLAMA_MODEL/);
  assert.match(entrypointSource, /OLLAMA_MODEL/);
  assert.match(wranglerSource, /WRANGLER_LOG_PATH:\s*process\.env\.WRANGLER_LOG_PATH\s*\?\?\s*defaultWranglerLogPath/);
  assert.match(wranglerSource, /WRANGLER_REGISTRY_PATH:\s*process\.env\.WRANGLER_REGISTRY_PATH\s*\?\?\s*defaultWranglerRegistryPath/);
  assert.match(wranglerSource, /WRANGLER_CI_DISABLE_CONFIG_WATCHING:\s*process\.env\.WRANGLER_CI_DISABLE_CONFIG_WATCHING\s*\?\?\s*'true'/);
  assert.match(wranglerSource, /XDG_CONFIG_HOME:\s*process\.env\.XDG_CONFIG_HOME\s*\?\?\s*defaultWranglerXdgConfigHome/);
  assert.match(composeSource, /ollama\/ollama:latest/);
  assert.match(composeSource, /127\.0\.0\.1:\$\{OLLAMA_PORT:-11434\}:11434/);
  assert.match(composeSource, /ollama-pull/);
  assert.match(composeSource, /\$\{OLLAMA_MODEL:-llama3\.2:3b\}/);
  assert.doesNotMatch(wranglerSource, /CLOUDFLARE_INCLUDE_PROCESS_ENV/);
  assert.doesNotMatch(entrypointSource, /spawn\(/);
});

test('local preview script injects local model and smoke identity vars into Wrangler', async () => {
  const previewSource = await readFile(previewUiScriptPath, 'utf8');

  assert.match(previewSource, /readLocalPreviewWranglerVars/);
  assert.match(previewSource, /createWranglerVarArgs\(readLocalPreviewWranglerVars\(\)\)/);
  assert.match(previewSource, /WORKER_SMOKE_NOTE_ID/);
  assert.match(previewSource, /WORKER_SMOKE_BLOCK_ID/);
  assert.match(previewSource, /WORKER_LOCAL_MODEL_PROTOCOL:\s*'ollama'/);
  assert.match(previewSource, /WORKER_LOCAL_MODEL_BASE_URL:\s*'http:\/\/127\.0\.0\.1:11434'/);
  assert.match(previewSource, /WORKER_LOCAL_MODEL_NAME:\s*'llama3\.2:3b'/);
  assert.match(previewSource, /WORKER_LOCAL_MODEL_PROVIDER/);
  assert.match(previewSource, /LOCAL_MODEL_PROVIDER/);
  assert.match(previewSource, /WORKER_LOCAL_MODEL_ENDPOINT/);
  assert.match(previewSource, /LOCAL_MODEL_ENDPOINT/);
  assert.match(previewSource, /WORKER_LOCAL_OLLAMA_HOST/);
  assert.match(previewSource, /OLLAMA_HOST/);
  assert.match(previewSource, /WORKER_LOCAL_OLLAMA_MODEL/);
  assert.match(previewSource, /OLLAMA_MODEL/);
  assert.match(previewSource, /Local model:/);
  assert.match(previewSource, /startPreviewSeedWatcher/);
  assert.match(previewSource, /isPreviewSeedAvailable/);
  assert.match(previewSource, /WORKER_PREVIEW_SEED_WATCH_INTERVAL_MS/);
  assert.match(previewSource, /encodeURIComponent\(previewConfig\.noteId\)/);
  assert.match(previewSource, /Local preview seed restored after Worker reload/);
});

test('local smoke modules keep failure classification separated from HTTP runner', async () => {
  const failureSource = await readFile(failureClassificationPath, 'utf8');
  const httpSource = await readFile(httpSmokeRunnerPath, 'utf8');

  assert.match(failureSource, /export class SetupFailure/);
  assert.match(failureSource, /export class SmokeFailure/);
  assert.match(failureSource, /export class BlockerFailure/);
  assert.match(failureSource, /export function assertArrayNotEmpty/);
  assert.match(failureSource, /export function assertArrayEmpty/);
  assert.doesNotMatch(httpSource, /export class (?:SetupFailure|SmokeFailure|BlockerFailure)/);
});

test('local smoke script reports blocked when WorkspaceBrain response has not completed provider router audit work', async () => {
  await withServer(async (request, response) => {
    const handled = await handleStandardSmokeRequest(request, response);
    if (handled) {
      return;
    }

    const url = new URL(request.url ?? '/', 'http://worker.test');
    if (url.pathname === '/__local/agents/workspace/process' && request.method === 'POST') {
      writeJson(response, 202, {
        ok: true,
        reason: 'local_smoke_workspace_brain_rpc_observed',
        scheduledJobIds: [],
        providerCalls: [],
        operationRoutingCalls: [],
        auditWrites: [],
        noteSotMutations: [],
        errors: [],
      });
      return;
    }

    writeJson(response, 404, { ok: false, errors: ['not found'] });
  }, async (baseUrl) => {
    const result = await runSmokeScript(baseUrl);

    assert.equal(result.exitCode, 3);
    assert.match(result.stderr, /^blocked: body\.reason expected "completed" but received "local_smoke_workspace_brain_rpc_observed"/m);
    assert.doesNotMatch(result.stderr, /^smoke failure:/m);
  });
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

    if (await handleStandardSmokeRequest(request, response)) {
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

async function handleStandardSmokeRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://worker.test');

  if (url.pathname === '/__local/smoke/reset') {
    writeJson(response, 200, {
      ok: true,
      reset: true,
      localAgents: localAgentSetup(),
    });
    return true;
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
    return true;
  }

  if (url.pathname === '/notes/note_local' && request.method === 'GET') {
    if (request.headers['x-worker-auth-secret'] === 'secret_local:invalid') {
      writeJson(response, 401, {
        ok: false,
        errors: ['worker auth credentials are invalid'],
      });
      return true;
    }

    writeJson(response, 200, {
      ok: true,
      document: {
        note: { id: 'note_local' },
      },
    });
    return true;
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
    return true;
  }

  if (url.pathname === '/notes/note_local/leave' && request.method === 'POST') {
    writeJson(response, 202, {
      ok: true,
      route: 'note_leave',
      triggerReason: 'tab_switched',
    });
    return true;
  }

  if (url.pathname === '/notes/note_local/structure/manual' && request.method === 'POST') {
    writeJson(response, 202, {
      ok: true,
      route: 'manual_organize',
      triggerReason: 'manual_organize',
    });
    return true;
  }

  if (url.pathname === '/notes/note_local/digest' && request.method === 'GET') {
    writeJson(response, 200, {
      ok: true,
      result: { noteId: 'note_local' },
    });
    return true;
  }

  return false;
}

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
      && !/^(?:LOCAL_)?(?:TURSO|LIBSQL)_/.test(key)
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
