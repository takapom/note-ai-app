// Worker HTTP note structure route handlers.
// Authority: docs/contracts/backend-runtime.md

import { runNoteStructureRouteHandler } from '../../scheduler/noteStructureRouteHandler.ts';
import { parseLatestBlockUpdates, readNoteLeaveCause } from './workerHttpRouteParsers.ts';
import { badRequest, mapStructureResult, notConfigured } from './workerHttpRouteResponses.ts';
import type {
  WorkerHttpRequest,
  WorkerHttpResponse,
  WorkerHttpRouterPorts,
} from './workerHttpRouterTypes.ts';

export async function runStructureRoute(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'noteBlocks' | 'noteStructure' | 'noteStructureRoute'>,
  noteId: string,
  route: 'note_leave' | 'manual_organize',
): Promise<WorkerHttpResponse> {
  if (route === 'note_leave') {
    const flushed = await flushLatestBlockUpdates(request, ports, noteId);
    if (!flushed.ok) {
      return flushed.response;
    }
  }

  const cause = route === 'note_leave' ? readNoteLeaveCause(request.body) : {};
  if (ports.noteStructureRoute !== undefined) {
    const result = await ports.noteStructureRoute.runNoteStructureRoute({
      workspaceId: request.workspaceId,
      ...(request.userId === undefined ? {} : { userId: request.userId }),
      noteId,
      route,
      ...cause,
      now: request.now,
    });
    return mapStructureResult(result);
  }

  if (ports.noteStructure === undefined) {
    return notConfigured('note structure scheduler ports are not configured');
  }

  const result = await runNoteStructureRouteHandler({
    workspaceId: request.workspaceId,
    noteId,
    route,
    ...cause,
    now: request.now,
    ports: ports.noteStructure,
  });

  return mapStructureResult(result);
}

async function flushLatestBlockUpdates(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'noteBlocks'>,
  noteId: string,
): Promise<{ ok: true } | { ok: false; response: WorkerHttpResponse }> {
  const parsed = parseLatestBlockUpdates(request.body);
  if (!parsed.ok) {
    return { ok: false, response: badRequest(parsed.errors) };
  }
  if (parsed.updates.length === 0) {
    return { ok: true };
  }
  if (ports.noteBlocks === undefined) {
    return { ok: false, response: notConfigured('note block update port is not configured') };
  }

  for (const update of parsed.updates) {
    const result = await ports.noteBlocks.updateBlock({
      workspaceId: request.workspaceId,
      ...(request.userId === undefined ? {} : { userId: request.userId }),
      noteId,
      blockId: update.blockId,
      now: request.now,
      body: {
        noteId,
        content: update.content,
      },
    });
    if (!result.ok) {
      return { ok: false, response: badRequest(result.errors) };
    }
  }

  return { ok: true };
}
