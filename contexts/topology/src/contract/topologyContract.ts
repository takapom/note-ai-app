// Live product semantics for topology constraints.
// Authority: docs/contracts/repository-topology.md

export const authorityTopologyEdges = [
  ['docs/contracts/**', 'contexts/*/src/contract/*'],
  ['docs/contracts/repository-topology.md', 'docs/generated/authority-graph.json'],
  ['docs/contracts/api-events.md', 'apps/workspace-api/generated/openapi.json'],
] as const;

export const allowedImportTopologyEdges = [
  ['apps/*', 'contexts/*/src/contract/*'],
  ['apps/web', 'apps/worker'],
  ['apps/worker', 'contexts/*/src/contract/*'],
  ['contexts/scheduler', 'contexts/note-model'],
  ['contexts/context-assembly', 'contexts/note-model'],
  ['contexts/context-assembly', 'contexts/memory'],
  ['contexts/ai-operations', 'contexts/note-model'],
  ['contexts/ai-operations', 'contexts/memory'],
] as const;

export const allowedRuntimeTopologyEdges = [
  ['apps/web', 'apps/worker'],
  ['apps/worker', 'cloudflare-agents'],
  ['apps/worker scheduler runtime flow', 'SchedulerNoteSnapshotPort'],
  ['SchedulerNoteSnapshotPort', 'Turso canonical sections'],
  ['SchedulerNoteSnapshotPort', 'Agent-local dirty section marks'],
  ['StructureJob queue', 'apps/worker context assembly runtime flow'],
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
  ['apps/worker structure job operation orchestration flow', 'structure job operation flow'],
  ['structure job operation flow', 'runtime operation routing adapter'],
  ['cloudflare-agents', 'turso'],
  ['runtime operation routing adapter', 'operation-router'],
  ['operation-router', 'semantic-unit-projections'],
  ['operation-router', 'memory-candidate-projections'],
  ['operation-router', 'assist-block-projections'],
] as const;
