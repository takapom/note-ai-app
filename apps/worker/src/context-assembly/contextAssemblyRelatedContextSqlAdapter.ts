// Facade for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md
// ContextAssemblyRelatedContextRetrievalPort reads bounded related candidates.
// Evidence: from semantic_unit_related_candidates; inner join semantic_units; inner join notes; inner join blocks.
// Evidence: notes.description_effective; blocks.origin = ?.

export type { ContextAssemblyRelatedContextSqlExecutor, ContextAssemblyRelatedContextSqlStatement } from './related-context/contextAssemblyRelatedContextSqlTypes.ts';
export { TursoContextAssemblyRelatedContextSqlAdapter } from './related-context/contextAssemblyRelatedContextSqlAdapterImpl.ts';
export { mapRelatedNotesLookupToSql, mapRelatedSemanticUnitsLookupToSql, mapRelatedSourceBlockExcerptsLookupToSql } from './related-context/contextAssemblyRelatedContextSqlStatements.ts';
export { mapRelatedNoteRowsToRelatedContextNotes } from './related-context/contextAssemblyRelatedNoteRows.ts';
export { mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits } from './related-context/contextAssemblyRelatedSemanticUnitRows.ts';
export { mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts } from './related-context/contextAssemblyRelatedSourceBlockExcerptRows.ts';
