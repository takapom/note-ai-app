// Facade for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md
// ContextAssemblyRelatedContextRetrievalPort reads bounded related candidates.
// Evidence: from semantic_unit_related_candidates; inner join semantic_units; inner join notes; inner join blocks.
// Evidence: notes.description_effective; blocks.origin = ?.

export type { ContextAssemblyRelatedContextSqlExecutor, ContextAssemblyRelatedContextSqlStatement } from './contextAssemblyRelatedContextSqlTypes.ts';
export { TursoContextAssemblyRelatedContextSqlAdapter } from './contextAssemblyRelatedContextSqlAdapterImpl.ts';
export { mapRelatedNotesLookupToSql, mapRelatedSemanticUnitsLookupToSql, mapRelatedSourceBlockExcerptsLookupToSql } from './contextAssemblyRelatedContextSqlStatements.ts';
export { mapRelatedNoteRowsToRelatedContextNotes } from './contextAssemblyRelatedNoteRows.ts';
export { mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits } from './contextAssemblyRelatedSemanticUnitRows.ts';
export { mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts } from './contextAssemblyRelatedSourceBlockExcerptRows.ts';
