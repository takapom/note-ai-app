import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { handleNextWorkerProxyRequest } from '../../apps/web/src/runtime/next/nextWorkerProxy.ts';

const root = new URL('../../', import.meta.url);

const nextPagePath = 'apps/web/pages/index.tsx';
const nextClientPath = 'apps/web/src/runtime/next/NextNoteSurfaceClient.tsx';
const nextRoutePath = 'apps/web/src/runtime/next/nextNoteSurfaceRoute.ts';
const nextWorkerConfigPath = 'apps/web/src/runtime/next/workerBackendConfig.ts';
const nextWorkerProxyPath = 'apps/web/src/runtime/next/nextWorkerProxy.ts';
const nextProxyPath = 'apps/web/app/api/ann/[...path]/route.ts';
const nextConfigPath = 'apps/web/next.config.mjs';
const rootPackageJsonPath = 'package.json';

test('Next.js root route mounts the Worker-backed note surface instead of the local demo app', async () => {
  const pageSource = await readText(nextPagePath);

  assert.match(pageSource, /NextNoteSurfaceClient/);
  assert.match(pageSource, /getServerSideProps/);
  assert.match(pageSource, /getNextNoteSurfaceServerSideProps/);
  assert.match(pageSource, /NextNoteSurfacePageProps/);
  assert.doesNotMatch(pageSource, /NoteSurfaceApp/);
  assert.doesNotMatch(pageSource, /localStorage|localNoteWorkspace|note-surface\/components/);
});

test('Next.js route adapter owns SSR metadata resolution without moving product semantics into the page', async () => {
  const routeSource = await readText(nextRoutePath);

  assert.match(routeSource, /NEXT_WORKER_API_PROXY_BASE_PATH/);
  assert.match(routeSource, /resolveNextWorkerBackendConfig/);
  assert.match(routeSource, /\/__ann\/bootstrap/);
  assert.match(routeSource, /ANN_WORKSPACE_ID/);
  assert.match(routeSource, /ANN_NOTE_ID/);
  assert.match(routeSource, /ANN_USER_ID/);
  assert.doesNotMatch(routeSource, /NoteSurfaceApp|localStorage|localNoteWorkspace/);
  assert.doesNotMatch(routeSource, /apps\/worker|worker\/src|workspace-api\/generated|openapi\.json/);
});

test('Next.js client adapter delegates to the browser mount boundary with caller supplied runtime metadata', async () => {
  const clientSource = await readText(nextClientPath);

  assert.match(clientSource, /mountBrowserNoteSurface/);
  assert.match(clientSource, /data-next-note-surface-root/);
  assert.match(clientSource, /rootSelector:\s*nextNoteSurfaceRootSelector/);
  assert.match(clientSource, /apiBaseUrl/);
  assert.match(clientSource, /workspaceId/);
  assert.match(clientSource, /noteId/);
  assert.match(clientSource, /fetchLike/);
  assert.doesNotMatch(clientSource, /NoteSurfaceApp|localStorage|localNoteWorkspace/);
  assert.doesNotMatch(clientSource, /apps\/worker|worker\/src|workspace-api\/generated|openapi\.json/);
});

test('Next.js API route proxies Worker requests server-side without exposing Worker auth to the browser', async () => {
  await access(new URL(nextProxyPath, root));
  const proxySource = await readText(nextProxyPath);
  const proxyAdapterSource = await readText(nextWorkerProxyPath);
  const configSource = await readText(nextWorkerConfigPath);

  assert.match(proxySource, /handleNextWorkerProxyRequest/);
  assert.match(proxySource, /runtime\s*=\s*['"]nodejs['"]/);
  assert.match(proxySource, /dynamic\s*=\s*['"]force-dynamic['"]/);
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.match(proxySource, new RegExp(`export function ${method}`));
  }
  assert.match(proxyAdapterSource, /resolveNextWorkerBackendConfig/);
  assert.match(proxyAdapterSource, /\/api\/ann/);
  assert.match(proxyAdapterSource, /x-workspace-id/);
  assert.match(proxyAdapterSource, /x-user-id/);
  assert.match(proxyAdapterSource, /authHeaders/);
  assert.match(proxyAdapterSource, /new Response/);
  assert.match(configSource, /ANN_WORKER_API_BASE_URL/);
  assert.match(configSource, /ANN_WORKER_AUTH_SHARED_SECRET/);
  assert.match(configSource, /http:\/\/127\.0\.0\.1:8787/);
  assert.match(configSource, /x-worker-auth-secret/);
  assert.doesNotMatch(proxySource, /apps\/worker|worker\/src|workspace-api\/generated|openapi\.json/);
  assert.doesNotMatch(proxyAdapterSource, /apps\/worker|worker\/src|workspace-api\/generated|openapi\.json/);
  assert.doesNotMatch(proxyAdapterSource, /NEXT_PUBLIC|ANN_WORKER_AUTH_SHARED_SECRET[^]*window|ANN_WORKER_AUTH_SHARED_SECRET[^]*globalThis/);
});

test('Next.js Worker proxy forwards path query metadata headers auth secret and body to Worker origin', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, proxied: true }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await handleNextWorkerProxyRequest(
      new Request('https://next.example.test/api/ann/blocks/block_001?view=full', {
        method: 'PATCH',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-workspace-id': 'workspace_001',
          'x-user-id': 'user_001',
        },
        body: JSON.stringify({ noteId: 'note_001', content: 'Updated text' }),
      }),
      {
        ANN_WORKER_API_BASE_URL: 'https://worker.example.test/base/',
        ANN_WORKER_AUTH_SHARED_SECRET: 'secret_001',
        NODE_ENV: 'production',
      },
    );

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, proxied: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://worker.example.test/base/blocks/block_001?view=full');
    assert.equal(calls[0].init.method, 'PATCH');
    assert.equal(calls[0].init.body, JSON.stringify({ noteId: 'note_001', content: 'Updated text' }));
    assert.equal(calls[0].init.headers.get('accept'), 'application/json');
    assert.equal(calls[0].init.headers.get('content-type'), 'application/json');
    assert.equal(calls[0].init.headers.get('x-workspace-id'), 'workspace_001');
    assert.equal(calls[0].init.headers.get('x-user-id'), 'user_001');
    assert.equal(calls[0].init.headers.get('x-worker-auth-secret'), 'secret_001');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Next.js local dev config allows the documented 127.0.0.1 verification origin', async () => {
  const nextConfigSource = await readText(nextConfigPath);
  const packageJson = JSON.parse(await readText(rootPackageJsonPath));

  assert.match(nextConfigSource, /allowedDevOrigins/);
  assert.match(nextConfigSource, /127\.0\.0\.1/);
  assert.equal(packageJson.scripts['web:dev'], 'npm --workspace @ai-native-note/web run dev');
  assert.doesNotMatch(packageJson.scripts['web:dev'], /next dev apps\/web/);
});

async function readText(path) {
  return readFile(new URL(path, root), 'utf8');
}
