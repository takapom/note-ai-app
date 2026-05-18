import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import {
  allowedImportTopologyEdges,
  authorityTopologyEdges,
} from '../../contexts/topology/src/contract/topologyContract.ts';

const root = new URL('../../', import.meta.url);

async function listFiles(dir) {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

test('topology contract separates authority edges from import edges', () => {
  assert.ok(authorityTopologyEdges.some(([from, to]) =>
    from === 'docs/contracts/**' && to === 'contexts/*/src/contract/*',
  ));
  assert.ok(allowedImportTopologyEdges.some(([from, to]) =>
    from === 'apps/*' && to === 'contexts/*/src/contract/*',
  ));
  assert.equal(
    allowedImportTopologyEdges.some(([from, to]) =>
      from === 'contexts/*/src/contract/*' && to === 'apps/*',
    ),
    false,
  );
});

test('contexts do not import app implementation or generated projections', async () => {
  const files = await listFiles('contexts');

  for (const file of files.filter((path) => path.endsWith('.ts'))) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*apps\//, file);
    assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//, file);
  }
});

test('worker runtime adapters depend on contracts, not generated projections or operation schema internals', async () => {
  const files = await listFiles('apps/worker/src');

  for (const file of files.filter((path) => path.endsWith('.ts'))) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//, file);
    assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//, file);
    assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/, file);
    assert.doesNotMatch(source, /classifyOperationPolicy|validateStructureOperation/, file);
  }
});

test('worker scheduler runtime flow does not call provider, operation routing, or audit persistence boundaries', async () => {
  const source = await readFile(new URL('apps/worker/src/structureSchedulerRuntimeFlow.ts', root), 'utf8');

  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*structureJobOperationFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAuditPort\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|operationAudit|operationRouting|structureJobOperation)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|runStructureJobOperationFlow|auditPersistence/);
});

test('generated OpenAPI projection cites its owner contract', async () => {
  const source = await readFile(new URL('apps/workspace-api/generated/openapi.json', root), 'utf8');
  const openapi = JSON.parse(source);

  assert.equal(openapi['x-authority-contract'], 'docs/contracts/api-events.md');
  assert.equal(openapi['x-projection-only'], true);
  assert.deepEqual(Object.keys(openapi.paths).sort(), [
    '/ai-operations/{operationId}/accept',
    '/ai-operations/{operationId}/dismiss',
    '/blocks/{blockId}',
    '/memory/{memoryId}/accept',
    '/memory/{memoryId}/reject',
    '/notes',
    '/notes/{noteId}',
    '/notes/{noteId}/blocks',
    '/notes/{noteId}/digest',
    '/notes/{noteId}/leave',
    '/notes/{noteId}/structure/manual',
  ]);
});

test('generated authority graph cites its owner contract', async () => {
  const source = await readFile(new URL('docs/generated/authority-graph.json', root), 'utf8');
  const graph = JSON.parse(source);

  assert.equal(graph['x-authority-contract'], 'docs/contracts/authority-graph.md');
  assert.equal(graph['x-projection-only'], true);
  assert.ok(graph.topology.includes('docs/contracts/** -> contexts/*/src/contract/*'));
});
