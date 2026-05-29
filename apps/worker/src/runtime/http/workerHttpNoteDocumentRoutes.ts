// Worker HTTP note document route handlers.
// Authority: docs/contracts/api-events.md

import type { NoteDocumentContract } from '../../../../../contexts/note-model/src/contract/noteContract.ts';
import type {
  NoteDocumentLoadRequest,
  NoteDocumentLoadResult,
  NoteDocumentPersistencePort,
} from '../../note-model/noteDocumentPersistencePort.ts';
import type { NoteListPort, NoteListResult } from '../../note-model/noteListPort.ts';
import { isRecord } from './workerHttpRouteParsers.ts';
import { badRequest, mapPortResult, notConfigured } from './workerHttpRouteResponses.ts';
import type { WorkerHttpRequest, WorkerHttpResponse } from './workerHttpRouterTypes.ts';

export async function listNoteDocumentsRoute(
  request: WorkerHttpRequest,
  port: NoteListPort | undefined,
): Promise<WorkerHttpResponse> {
  if (port === undefined) {
    return notConfigured('note list port is not configured');
  }

  const result: NoteListResult = await port.listNotes({
    workspaceId: request.workspaceId,
  });
  if (!result.ok) {
    return badRequest(result.errors);
  }

  return {
    status: 200,
    body: {
      ok: true,
      notes: result.notes ?? [],
    },
  };
}

export async function saveNoteDocumentRoute(
  request: WorkerHttpRequest,
  port: NoteDocumentPersistencePort | undefined,
  successStatus: number,
): Promise<WorkerHttpResponse> {
  if (port === undefined) {
    return notConfigured('note document persistence port is not configured');
  }

  const body = request.body;
  if (!isRecord(body) || !isRecord(body.document)) {
    return badRequest(['body.document must be provided']);
  }

  const result = await port.saveDocument(body.document as unknown as NoteDocumentContract);
  return mapPortResult(result, successStatus);
}

export async function loadNoteDocumentRoute(
  request: WorkerHttpRequest,
  port: NoteDocumentPersistencePort | undefined,
  noteId: string,
): Promise<WorkerHttpResponse> {
  if (port === undefined) {
    return notConfigured('note document persistence port is not configured');
  }

  const result: NoteDocumentLoadResult = await port.loadDocument({
    workspaceId: request.workspaceId,
    noteId,
  } satisfies NoteDocumentLoadRequest);
  return mapPortResult(result, 200);
}
