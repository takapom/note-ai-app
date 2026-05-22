// Facade for context assembly local structure projections.
// Authority: docs/contracts/context-assembly.md
// ContextAssemblyLocalStructurePort reads bounded projections only.
// Evidence: from semantic_units; from semantic_unit_section_summaries; from semantic_unit_structure_snapshots; inner join notes.

export type { ContextAssemblyLocalStructureSqlExecutor, ContextAssemblyLocalStructureSqlStatement } from './contextAssemblyLocalStructureSqlTypes.ts';
export { TursoContextAssemblyLocalStructureSqlAdapter } from './contextAssemblyLocalStructureSqlAdapterImpl.ts';
export {
  mapLocalPreviousStructureSnapshotLookupToSql,
  mapLocalSectionSummariesLookupToSql,
  mapLocalSemanticUnitsLookupToSql,
} from './contextAssemblyLocalStructureSqlStatements.ts';
export {
  mapPreviousStructureSnapshotRowsToLocalStructureSnapshot,
  mapSectionSummaryRowsToLocalStructureSectionSummaries,
  mapSemanticUnitRowsToLocalStructureSemanticUnits,
} from './contextAssemblyLocalStructureRowMappers.ts';
