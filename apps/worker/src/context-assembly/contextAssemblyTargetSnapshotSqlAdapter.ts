// Facade for context assembly target snapshot reads.
// Authority: docs/contracts/context-assembly.md
// ContextAssemblyTargetSnapshotPort reads canonical note/section/block snapshots.
// Evidence: from notes; from sections; from blocks; notes.workspace_id = ?; blocks.origin = ?.

export * from './target-snapshot/contextAssemblyTargetSnapshotSqlAdapter.ts';
