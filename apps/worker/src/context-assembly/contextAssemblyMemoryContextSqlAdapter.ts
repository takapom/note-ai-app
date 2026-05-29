// Facade for context assembly memory context projections.
// Authority: docs/contracts/context-assembly.md
// ContextAssemblyMemoryRetrievalPort reads user-scoped memory candidates only.
// Evidence: from memory_context_candidates; inner join memory_items.
// Evidence: memory_context_candidates.user_id = ?; memory_items.workspace_id = ?; memory_items.user_id = ?.

export * from './memory-context/contextAssemblyMemoryContextSqlAdapter.ts';
