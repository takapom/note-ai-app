import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import {
  allowedImportTopologyEdges,
  allowedRuntimeTopologyEdges,
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
    from === 'apps/web' && to === 'contexts/*/src/contract/*',
  ));
  assert.ok(allowedImportTopologyEdges.some(([from, to]) =>
    from === 'apps/worker' && to === 'contexts/*/src/contract/*',
  ));
  assert.equal(
    allowedImportTopologyEdges.some(([from, to]) =>
      from === 'contexts/*/src/contract/*' && to === 'apps/*',
    ),
    false,
  );
  assert.equal(
    allowedImportTopologyEdges.some(([from, to]) => from === 'apps/web' && to === 'apps/worker'),
    false,
  );
  assert.ok(allowedRuntimeTopologyEdges.some(([from, to]) =>
    from === 'apps/worker scheduler runtime flow' && to === 'SchedulerNoteSnapshotPort',
  ));
  assert.ok(allowedRuntimeTopologyEdges.some(([from, to]) =>
    from === 'apps/worker note structure route handler' && to === 'apps/worker scheduler runtime flow',
  ));
  assert.ok(allowedRuntimeTopologyEdges.some(([from, to]) =>
    from === 'SchedulerNoteSnapshotPort' && to === 'Turso canonical sections',
  ));
  assert.ok(allowedRuntimeTopologyEdges.some(([from, to]) =>
    from === 'SchedulerNoteSnapshotPort' && to === 'Agent-local dirty section marks',
  ));
  for (const edge of [
    ['StructureJob queue', 'apps/worker context assembly runtime flow'],
    ['apps/worker structure job Agent handler', 'apps/worker context assembly runtime flow'],
    ['apps/worker structure job Agent handler', 'apps/worker structure job operation orchestration flow'],
    ['apps/worker context assembly runtime flow', 'contexts/context-assembly contract'],
    ['apps/worker context assembly runtime flow', 'ContextAssemblyTargetSnapshotPort'],
    ['apps/worker context assembly runtime flow', 'ContextAssemblyLocalStructurePort'],
    ['apps/worker context assembly runtime flow', 'ContextAssemblyRelatedContextRetrievalPort'],
    ['apps/worker context assembly runtime flow', 'ContextAssemblyMemoryRetrievalPort'],
    ['ContextAssemblyTargetSnapshotPort', 'Turso canonical notes/sections/blocks'],
    ['ContextAssemblyLocalStructurePort', 'semantic-unit projections'],
    ['ContextAssemblyRelatedContextRetrievalPort', 'semantic-unit projections'],
    ['ContextAssemblyRelatedContextRetrievalPort', 'Turso canonical note/block excerpts'],
    ['ContextAssemblyMemoryRetrievalPort', 'memory projections'],
    ['ContextEnvelopeBuilt', 'ai-engine'],
    ['ai-engine', 'provider-registry'],
    ['provider-registry', 'operation-generation-provider'],
    ['operation-generation-provider', 'apps/worker structure job operation orchestration flow'],
    ['apps/worker structure job operation orchestration flow', 'completed StructureJob response'],
    ['completed StructureJob response', 'structure job operation flow'],
    ['structure job operation flow', 'runtime operation routing adapter'],
    ['runtime operation routing adapter', 'operation-router'],
  ]) {
    assert.ok(allowedRuntimeTopologyEdges.some(([from, to]) => from === edge[0] && to === edge[1]));
  }
});

test('worker operation generation provider flow stops before operation routing and audit persistence', async () => {
  const source = await readFile(new URL('apps/worker/src/operationGenerationProviderFlow.ts', root), 'utf8');

  assert.match(source, /validateContextEnvelope/);
  assert.match(source, /OperationGenerationProviderRegistry/);
  assert.match(source, /ContextEnvelopeBuiltEvent/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouting/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|runStructureJobOperationFlow|auditPersistence|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
});

test('worker structure job operation orchestration flow only connects provider generation to structure job operation flow', async () => {
  const source = await readFile(new URL('apps/worker/src/structureJobOperationOrchestrationFlow.ts', root), 'utf8');

  assert.match(source, /runOperationGenerationProviderFlow/);
  assert.match(source, /runStructureJobOperationFlow/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingAdapter\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|routeGeneratedOperations|auditPersistence\.save|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
});

test('worker structure job operation flow owns completed job routing only', async () => {
  const source = await readFile(new URL('apps/worker/src/structureJobOperationFlow.ts', root), 'utf8');

  assert.match(source, /runOperationRoutingFlow/);
  assert.doesNotMatch(source, /providerError|provider_failed|OperationGenerationProvider/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationGenerationProviderFlow\.ts['"]/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
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

  assert.doesNotMatch(source, /contextAssembly|ContextEnvelope|assembleContextEnvelope/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*structureJobOperationFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAuditPort\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|operationAudit|operationRouting|structureJobOperation)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|runStructureJobOperationFlow|auditPersistence/);
});

test('worker context assembly runtime flow uses Context Assembly contract and no provider or operation boundaries', async () => {
  const source = await readFile(new URL('apps/worker/src/contextAssemblyRuntimeFlow.ts', root), 'utf8');

  assert.match(source, /assembleContextEnvelope/);
  assert.match(source, /validateContextEnvelope/);
  assert.match(source, /ContextAssemblyTargetSnapshotPort/);
  assert.match(source, /ContextAssemblyLocalStructurePort/);
  assert.match(source, /ContextAssemblyRelatedContextRetrievalPort/);
  assert.match(source, /ContextAssemblyMemoryRetrievalPort/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|operationAudit|operationRouting|operationRouter|turso|sql)/i);
  assert.doesNotMatch(source, /runOperationRoutingFlow|OperationAudit|auditPersistence|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
});

test('scheduler note snapshot SQL adapter only reads sections and dirty marks', async () => {
  const source = await readFile(new URL('apps/worker/src/schedulerNoteSnapshotSqlAdapter.ts', root), 'utf8');

  assert.match(source, /SectionContract/);
  assert.match(source, /SchedulerNoteSnapshotPort/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|provider|ai-sdk/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
  assert.match(source, /from sections/);
  assert.match(source, /inner join notes/);
  assert.match(source, /from agent_local_dirty_scope_marks/);
  assert.doesNotMatch(source, /from blocks|join blocks|ai_operations|source_spans/i);
  assert.match(source, /dirtyMarkExecutor === undefined/);
});

test('context assembly target snapshot SQL adapter only reads canonical note target data', async () => {
  const source = await readFile(new URL('apps/worker/src/contextAssemblyTargetSnapshotSqlAdapter.ts', root), 'utf8');

  assert.match(source, /ContextAssemblyTargetSnapshotPort/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|provider|ai-sdk/i);
  assert.doesNotMatch(source, /semantic_units|memory_items|agent_local|dirty_scope|source_spans/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
  assert.match(source, /from notes/);
  assert.match(source, /from sections/);
  assert.match(source, /from blocks/);
  assert.match(source, /notes\.workspace_id = \?/);
  assert.match(source, /blocks\.origin = \?/);
});

test('context assembly local structure SQL adapter only reads semantic unit projections', async () => {
  const source = await readFile(new URL('apps/worker/src/contextAssemblyLocalStructureSqlAdapter.ts', root), 'utf8');

  assert.match(source, /ContextAssemblyLocalStructurePort/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|provider|ai-sdk/i);
  assert.doesNotMatch(source, /from blocks|join blocks|from sections|join sections|memory_items|source_spans|agent_local/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
  assert.match(source, /from semantic_units/);
  assert.match(source, /from semantic_unit_section_summaries/);
  assert.match(source, /from semantic_unit_structure_snapshots/);
  assert.match(source, /inner join notes/);
});

test('context assembly related context SQL adapter only reads related candidates and bounded excerpts', async () => {
  const source = await readFile(new URL('apps/worker/src/contextAssemblyRelatedContextSqlAdapter.ts', root), 'utf8');

  assert.match(source, /ContextAssemblyRelatedContextRetrievalPort/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|provider|ai-sdk/i);
  assert.doesNotMatch(source, /memory_items|source_spans|agent_local|content_json|select \*/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
  assert.match(source, /from semantic_unit_related_candidates/);
  assert.match(source, /inner join semantic_units/);
  assert.match(source, /inner join notes/);
  assert.match(source, /inner join blocks/);
  assert.match(source, /notes\.description_effective/);
  assert.match(source, /blocks\.origin = \?/);
});

test('context assembly memory context SQL adapter only reads user-scoped memory candidates', async () => {
  const source = await readFile(new URL('apps/worker/src/contextAssemblyMemoryContextSqlAdapter.ts', root), 'utf8');

  assert.match(source, /ContextAssemblyMemoryRetrievalPort/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /operationRouter|operation router|operation audit|OperationAudit|auditPersistence|provider|ai-sdk/i);
  assert.doesNotMatch(source, /from blocks|join blocks|from notes|join notes|source_spans|agent_local|content_json|select \*/i);
  assert.doesNotMatch(source, /\b(insert|update|delete|upsert|create|alter)\b/i);
  assert.match(source, /from memory_context_candidates/);
  assert.match(source, /inner join memory_items/);
  assert.match(source, /memory_context_candidates\.user_id = \?/);
  assert.match(source, /memory_items\.workspace_id = \?/);
  assert.match(source, /memory_items\.user_id = \?/);
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
  for (const edge of [
    'apps/worker note structure route handler -> apps/worker scheduler runtime flow',
    'StructureJob queue -> apps/worker context assembly runtime flow',
    'apps/worker structure job Agent handler -> apps/worker context assembly runtime flow',
    'apps/worker structure job Agent handler -> apps/worker structure job operation orchestration flow',
    'apps/worker context assembly runtime flow -> contexts/context-assembly contract',
    'apps/worker context assembly runtime flow -> ContextAssemblyTargetSnapshotPort',
    'apps/worker context assembly runtime flow -> ContextAssemblyLocalStructurePort',
    'apps/worker context assembly runtime flow -> ContextAssemblyRelatedContextRetrievalPort',
    'apps/worker context assembly runtime flow -> ContextAssemblyMemoryRetrievalPort',
    'ContextAssemblyTargetSnapshotPort -> Turso canonical notes/sections/blocks',
    'ContextAssemblyLocalStructurePort -> semantic-unit projections',
    'ContextAssemblyRelatedContextRetrievalPort -> semantic-unit projections',
    'ContextAssemblyRelatedContextRetrievalPort -> Turso canonical note/block excerpts',
    'ContextAssemblyMemoryRetrievalPort -> memory projections',
    'ContextEnvelopeBuilt -> AI Engine',
    'AI Engine -> provider registry',
    'provider registry -> operation generation provider',
    'operation generation provider -> apps/worker structure job operation orchestration flow',
    'apps/worker structure job operation orchestration flow -> completed StructureJob response',
    'completed StructureJob response -> structure job operation flow',
    'structure job operation flow -> runtime operation routing adapter',
    'runtime operation routing adapter -> Operation Router',
  ]) {
    assert.ok(graph.topology.includes(edge), edge);
  }
});

test('generated authority graph topology is an exact projection of topology contract edges', async () => {
  const source = await readFile(new URL('docs/generated/authority-graph.json', root), 'utf8');
  const graph = JSON.parse(source);
  const expected = [
    ...authorityTopologyEdges,
    ...allowedImportTopologyEdges,
    ...allowedRuntimeTopologyEdges,
  ].map(([from, to]) => `${formatTopologyNode(from)} -> ${formatTopologyNode(to)}`);

  assert.deepEqual([...graph.topology].sort(), expected.sort());
});

function formatTopologyNode(node) {
  return node
    .replace(/^ai-engine$/, 'AI Engine')
    .replace(/^provider-registry$/, 'provider registry')
    .replace(/^operation-generation-provider$/, 'operation generation provider')
    .replace(/^operation-router$/, 'Operation Router')
    .replace(/^cloudflare-agents$/, 'Cloudflare Agents')
    .replace(/^turso$/, 'Turso');
}
