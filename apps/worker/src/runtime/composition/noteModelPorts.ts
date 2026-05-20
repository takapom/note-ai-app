import { NoteDocumentBlockCommandPort } from '../../note-model/noteBlockCommandPort.ts';
import {
  TursoNoteDocumentPersistenceAdapter,
  type NoteDocumentSqlStatement,
} from '../../note-model/noteDocumentSqlAdapter.ts';
import {
  TursoProvenanceLookupSqlAdapter,
  type ProvenanceLookupSqlStatement,
} from '../../note-model/provenanceLookupPort.ts';
import { WorkerTursoSqlExecutor, type WorkerTursoClient } from './workerTursoSqlExecutor.ts';

export function createNoteModelPorts(tursoClient: WorkerTursoClient | undefined): {
  noteDocument?: TursoNoteDocumentPersistenceAdapter;
  noteBlocks?: NoteDocumentBlockCommandPort;
  provenanceLookup?: TursoProvenanceLookupSqlAdapter;
} {
  if (tursoClient === undefined) {
    return {};
  }

  const tursoExecutor = new WorkerTursoSqlExecutor(tursoClient);
  const noteDocument = new TursoNoteDocumentPersistenceAdapter(tursoExecutor);
  return {
    noteDocument,
    noteBlocks: new NoteDocumentBlockCommandPort(noteDocument),
    provenanceLookup: new TursoProvenanceLookupSqlAdapter({ executor: tursoExecutor }),
  };
}

export type { NoteDocumentSqlStatement, ProvenanceLookupSqlStatement };
