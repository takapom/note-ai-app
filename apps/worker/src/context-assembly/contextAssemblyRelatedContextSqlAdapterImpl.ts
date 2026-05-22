// SQL adapter for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md

import type { ContextAssemblyInput } from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { ContextAssemblyRelatedContextRetrievalPort, ContextAssemblyRuntimeRequest } from './contextAssemblyRuntimeFlow.ts';
import { validateSupportedRelatedContextRequest } from './contextAssemblyRelatedContextRowReaders.ts';
import { mapRelatedNoteRowsToRelatedContextNotes } from './contextAssemblyRelatedNoteRows.ts';
import { mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits } from './contextAssemblyRelatedSemanticUnitRows.ts';
import { mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts } from './contextAssemblyRelatedSourceBlockExcerptRows.ts';
import {
  mapRelatedNotesLookupToSql,
  mapRelatedSemanticUnitsLookupToSql,
  mapRelatedSourceBlockExcerptsLookupToSql,
} from './contextAssemblyRelatedContextSqlStatements.ts';
import type { ContextAssemblyRelatedContextSqlExecutor } from './contextAssemblyRelatedContextSqlTypes.ts';

export class TursoContextAssemblyRelatedContextSqlAdapter
  implements ContextAssemblyRelatedContextRetrievalPort
{
  private readonly executor: ContextAssemblyRelatedContextSqlExecutor;

  constructor(input: { executor: ContextAssemblyRelatedContextSqlExecutor }) {
    this.executor = input.executor;
  }

  async loadRelatedContext(
    input: ContextAssemblyRuntimeRequest,
  ): Promise<ContextAssemblyInput['relatedContext']> {
    const requestResult = validateSupportedRelatedContextRequest(input);
    if (!requestResult.ok) {
      throw new Error(requestResult.errors.join('; '));
    }

    const semanticUnitRows = await this.executor.query(mapRelatedSemanticUnitsLookupToSql(input));
    const semanticUnitsResult = mapRelatedSemanticUnitRowsToRelatedContextSemanticUnits(semanticUnitRows, input);
    if (!semanticUnitsResult.ok) {
      throw new Error(semanticUnitsResult.errors.join('; '));
    }

    const noteRows = await this.executor.query(mapRelatedNotesLookupToSql(input));
    const notesResult = mapRelatedNoteRowsToRelatedContextNotes(noteRows, input);
    if (!notesResult.ok) {
      throw new Error(notesResult.errors.join('; '));
    }

    const excerptRows = await this.executor.query(mapRelatedSourceBlockExcerptsLookupToSql(input));
    const excerptsResult = mapRelatedSourceBlockExcerptRowsToRelatedContextSourceBlockExcerpts(
      excerptRows,
      input,
    );
    if (!excerptsResult.ok) {
      throw new Error(excerptsResult.errors.join('; '));
    }

    return {
      semanticUnits: semanticUnitsResult.semanticUnits,
      notes: notesResult.notes,
      sourceBlockExcerpts: excerptsResult.sourceBlockExcerpts,
    };
  }
}
