// Worker HTTP note structure route handlers.
// Authority: docs/contracts/backend-runtime.md

import { runNoteStructureRouteHandler } from '../../scheduler/noteStructureRouteHandler.ts';
import { readNoteLeaveCause } from './workerHttpRouteParsers.ts';
import { mapStructureResult, notConfigured } from './workerHttpRouteResponses.ts';
import type {
  WorkerHttpRequest,
  WorkerHttpResponse,
  WorkerHttpRouterPorts,
} from './workerHttpRouterTypes.ts';

export async function runStructureRoute(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'noteStructure' | 'noteStructureRoute'>,
  noteId: string,
  route: 'note_leave' | 'manual_organize',
): Promise<WorkerHttpResponse> {
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
