import process from 'node:process';

import {
  assertArrayIncludes,
  assertEqual,
  assertLocalAgentSetup,
  BlockerFailure,
  parseJsonResponse,
  SetupFailure,
  SmokeFailure,
} from './failureClassification.mjs';
import { createLocalSmokeDocument, createLocalSmokeNextOpenDigest } from './fixtures.mjs';
import {
  formatCurl,
  readOptionalPathEnv,
  readRequiredEnv,
  readPositiveIntegerEnv,
  truncateBody,
} from './logging.mjs';

export function readRequestTimeoutMs() {
  return readPositiveIntegerEnv('WORKER_LOCAL_REQUEST_TIMEOUT_MS', 8_000);
}

export function readSmokeHttpConfig(baseConfig) {
  return {
    ...baseConfig,
    workspaceId: readRequiredEnv('WORKER_SMOKE_WORKSPACE_ID'),
    userId: readRequiredEnv('WORKER_SMOKE_USER_ID'),
    authSecret: readRequiredEnv('WORKER_SMOKE_AUTH_SECRET'),
    noteId: readRequiredEnv('WORKER_SMOKE_NOTE_ID'),
    blockId: readRequiredEnv('WORKER_SMOKE_BLOCK_ID'),
    workspaceBrainPath: readOptionalPathEnv('WORKER_SMOKE_WORKSPACE_BRAIN_PATH')
      ?? '/__local/agents/workspace/process',
  };
}

export async function fetchWithTimeout(url, init) {
  const requestTimeoutMs = readRequestTimeoutMs();
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

export async function runSmoke(config) {
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
  const nextOpenDigest = createLocalSmokeNextOpenDigest(config);

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
