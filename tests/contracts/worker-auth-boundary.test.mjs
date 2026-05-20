import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  isStableRuntimeId,
  normalizeWorkerAuthBoundary,
} from '../../apps/worker/src/runtime/http/workerAuthBoundary.ts';

const root = new URL('../../', import.meta.url);

test('worker auth boundary normalizes workspace and optional user identity from request headers', () => {
  const result = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: {
        'x-workspace-id': 'workspace_001',
        'x-user-id': 'user_001',
      },
    }),
    env: {
      WORKSPACE_ID: 'workspace_from_env',
      USER_ID: 'user_from_env',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    identity: {
      workspaceId: 'workspace_001',
      userId: 'user_001',
    },
  });
});

test('worker auth boundary keeps the existing env identity fallback path', () => {
  const result = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes'),
    env: {
      WORKSPACE_ID: 'workspace_from_env',
      USER_ID: 'user_from_env',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    identity: {
      workspaceId: 'workspace_from_env',
      userId: 'user_from_env',
    },
  });
});

test('worker auth boundary can use entrypoint context as a framework-neutral identity source', () => {
  const result = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes'),
    context: {
      workspaceId: 'workspace_from_context',
      userId: 'user_from_context',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    identity: {
      workspaceId: 'workspace_from_context',
      userId: 'user_from_context',
    },
  });
});

test('worker auth boundary accepts deployment verified identity without trusting spoofable request identity', () => {
  const result = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: {
        'x-workspace-id': 'workspace_spoofed',
        'x-user-id': 'user_spoofed',
      },
    }),
    env: {
      WORKSPACE_ID: 'workspace_from_env',
      USER_ID: 'user_from_env',
    },
    verifiedIdentity: {
      workspaceId: 'workspace_verified',
      userId: 'user_verified',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    identity: {
      workspaceId: 'workspace_verified',
      userId: 'user_verified',
    },
  });
});

test('worker auth boundary rejects missing workspace and sentinel user identity', () => {
  const missingWorkspace = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes'),
  });
  const sentinelUser = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: {
        'x-workspace-id': 'workspace_001',
        'x-user-id': 'user_unknown',
      },
    }),
  });

  assert.deepEqual(missingWorkspace, {
    ok: false,
    status: 400,
    errors: ['workspaceId must be a stable non-sentinel runtime id'],
  });
  assert.deepEqual(sentinelUser, {
    ok: false,
    status: 400,
    errors: ['userId must be a stable non-sentinel runtime id when provided'],
  });
});

test('worker auth boundary rejects invalid deployment verified identity', () => {
  const result = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes'),
    verifiedIdentity: {
      workspaceId: 'workspace_unknown',
      userId: 'user_001',
    },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    errors: ['workspaceId must be a stable non-sentinel runtime id'],
  });
});

test('worker auth boundary accepts an optional configured shared secret without choosing an auth provider', () => {
  const headerSecret = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: {
        'x-workspace-id': 'workspace_001',
        'x-worker-auth-secret': 'secret_001',
      },
    }),
    env: { WORKER_AUTH_SHARED_SECRET: 'secret_001' },
  });
  const bearerSecret = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: {
        authorization: 'Bearer secret_002',
        'x-workspace-id': 'workspace_001',
      },
    }),
    env: { AUTH_SHARED_SECRET: 'secret_002' },
  });

  assert.equal(headerSecret.ok, true);
  assert.equal(bearerSecret.ok, true);
});

test('worker auth boundary rejects missing or mismatched configured shared secret', () => {
  const missing = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: { 'x-workspace-id': 'workspace_001' },
    }),
    env: { WORKER_AUTH_SHARED_SECRET: 'secret_001' },
  });
  const mismatch = normalizeWorkerAuthBoundary({
    request: new Request('https://worker.test/notes', {
      headers: {
        'x-workspace-id': 'workspace_001',
        'x-worker-auth-secret': 'wrong_secret',
      },
    }),
    env: { WORKER_AUTH_SHARED_SECRET: 'secret_001' },
  });

  assert.deepEqual(missing, {
    ok: false,
    status: 401,
    errors: ['worker auth credentials are invalid'],
  });
  assert.deepEqual(mismatch, {
    ok: false,
    status: 401,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker auth boundary stable runtime id validator rejects blank, trimmed, and sentinel values', () => {
  assert.equal(isStableRuntimeId('workspace_001'), true);
  assert.equal(isStableRuntimeId(' workspace_001 '), false);
  assert.equal(isStableRuntimeId(''), false);
  assert.equal(isStableRuntimeId('workspace_unknown'), false);
  assert.equal(isStableRuntimeId('workspace/sneaky'), false);
});

test('worker auth boundary source stays provider-neutral and policy-free', async () => {
  const source = await readFile(new URL('apps/worker/src/runtime/http/workerAuthBoundary.ts', root), 'utf8');

  assert.match(source, /normalizeWorkerAuthBoundary/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(jsonwebtoken|jose|auth0|clerk|next-auth|passport)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouter/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(turso|libsql|sqlite|sql)/i);
  assert.doesNotMatch(source, /\b(select|insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
  assert.doesNotMatch(source, /workspaceMembership|authorizeWorkspace|rolePolicy/i);
});
