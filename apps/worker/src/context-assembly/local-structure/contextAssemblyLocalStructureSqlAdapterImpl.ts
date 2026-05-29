// SQL adapter for context assembly local structure projections.
// Authority: docs/contracts/context-assembly.md

import type { ContextAssemblyInput } from '../../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { ContextAssemblyLocalStructurePort, ContextAssemblyRuntimeRequest } from '../contextAssemblyRuntimeFlow.ts';
import {
  mapLocalPreviousStructureSnapshotLookupToSql,
  mapLocalSectionSummariesLookupToSql,
  mapLocalSemanticUnitsLookupToSql,
} from './contextAssemblyLocalStructureSqlStatements.ts';
import {
  mapPreviousStructureSnapshotRowsToLocalStructureSnapshot,
  mapSectionSummaryRowsToLocalStructureSectionSummaries,
  mapSemanticUnitRowsToLocalStructureSemanticUnits,
  validateSupportedLocalStructureRequest,
} from './contextAssemblyLocalStructureRowMappers.ts';
import type { ContextAssemblyLocalStructureSqlExecutor } from './contextAssemblyLocalStructureSqlTypes.ts';

export class TursoContextAssemblyLocalStructureSqlAdapter implements ContextAssemblyLocalStructurePort {
  private readonly executor: ContextAssemblyLocalStructureSqlExecutor;

  constructor(input: { executor: ContextAssemblyLocalStructureSqlExecutor }) {
    this.executor = input.executor;
  }

  async loadLocalStructure(
    input: ContextAssemblyRuntimeRequest,
  ): Promise<ContextAssemblyInput['localStructure']> {
    const requestResult = validateSupportedLocalStructureRequest(input);
    if (!requestResult.ok) {
      throw new Error(requestResult.errors.join('; '));
    }

    const semanticUnitRows = await this.executor.query(mapLocalSemanticUnitsLookupToSql(input));
    const semanticUnitsResult = mapSemanticUnitRowsToLocalStructureSemanticUnits(semanticUnitRows, input);
    if (!semanticUnitsResult.ok) {
      throw new Error(semanticUnitsResult.errors.join('; '));
    }

    const sectionSummaryRows = await this.executor.query(mapLocalSectionSummariesLookupToSql(input));
    const sectionSummariesResult = mapSectionSummaryRowsToLocalStructureSectionSummaries(sectionSummaryRows, input);
    if (!sectionSummariesResult.ok) {
      throw new Error(sectionSummariesResult.errors.join('; '));
    }

    const snapshotRows = await this.executor.query(mapLocalPreviousStructureSnapshotLookupToSql(input));
    const snapshotResult = mapPreviousStructureSnapshotRowsToLocalStructureSnapshot(snapshotRows, input);
    if (!snapshotResult.ok) {
      throw new Error(snapshotResult.errors.join('; '));
    }

    return {
      existingSemanticUnits: semanticUnitsResult.existingSemanticUnits,
      sectionSummaries: sectionSummariesResult.sectionSummaries,
      ...(snapshotResult.snapshot === undefined ? {} : { previousStructureSnapshot: snapshotResult.snapshot }),
    };
  }
}
