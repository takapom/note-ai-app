// Framework-neutral Worker HTTP routing boundary for the MVP API surface.
// Authority: docs/contracts/api-events.md

import { methodAllowedForKnownPath, matchWorkerRoute } from './workerHttpRouteMatcher.ts';
import { validateBaseRequest } from './workerHttpRouteParsers.ts';
import { badRequest, notConfigured } from './workerHttpRouteResponses.ts';
import type {
  WorkerHttpRequest,
  WorkerHttpResponse,
  WorkerHttpRouterPorts,
} from './workerHttpRouterTypes.ts';
import { bindCommand, delegateCommand } from './workerHttpCommandDelegation.ts';
import { listNoteDocumentsRoute, loadNoteDocumentRoute, saveNoteDocumentRoute } from './workerHttpNoteDocumentRoutes.ts';
import { runOperationApprovalRoute } from './workerHttpOperationApprovalRoutes.ts';
import { runProvenanceLookupRoute } from './workerHttpProvenanceRoutes.ts';
import { runStructureRoute } from './workerHttpStructureRoutes.ts';

export async function handleWorkerHttpRequest(
  request: WorkerHttpRequest,
  ports: WorkerHttpRouterPorts,
): Promise<WorkerHttpResponse> {
  const method = request.method.toUpperCase();
  const route = matchWorkerRoute(method, request.path);

  if (route === undefined) {
    return {
      status: methodAllowedForKnownPath(method, request.path) ? 405 : 404,
      body: { ok: false, errors: ['route not found'] },
    };
  }

  const identityErrors = validateBaseRequest(request);
  if (identityErrors.length > 0) {
    return badRequest(identityErrors);
  }

  switch (route.name) {
    case 'list_notes':
      return listNoteDocumentsRoute(request, ports.noteList);
    case 'create_note':
      return saveNoteDocumentRoute(request, ports.noteDocument, 201);
    case 'get_note':
      return loadNoteDocumentRoute(request, ports.noteDocument, route.params.noteId);
    case 'update_note':
      return saveNoteDocumentRoute(request, ports.noteDocument, 200);
    case 'create_block':
      return delegateCommand(
        bindCommand(ports.noteBlocks, 'createBlock'),
        request,
        { noteId: route.params.noteId },
        201,
        'note block create port is not configured',
      );
    case 'update_block':
      return delegateCommand(
        bindCommand(ports.noteBlocks, 'updateBlock'),
        request,
        { blockId: route.params.blockId },
        200,
        'note block update port is not configured',
      );
    case 'delete_block':
      return delegateCommand(
        bindCommand(ports.noteBlocks, 'deleteBlock'),
        request,
        { blockId: route.params.blockId },
        204,
        'note block delete port is not configured',
      );
    case 'leave_note':
      return runStructureRoute(request, ports, route.params.noteId, 'note_leave');
    case 'manual_organize_note':
      return runStructureRoute(request, ports, route.params.noteId, 'manual_organize');
    case 'get_digest':
      return delegateCommand(
        bindCommand(ports.digestRead, 'getDigest'),
        request,
        { noteId: route.params.noteId },
        200,
        'digest read port is not configured',
      );
    case 'lookup_provenance_source':
      return runProvenanceLookupRoute(request, ports.provenanceLookup);
    case 'accept_operation':
      return runOperationApprovalRoute(request, ports, route.params.operationId, 'accept');
    case 'dismiss_operation':
      return runOperationApprovalRoute(request, ports, route.params.operationId, 'dismiss');
    case 'accept_memory':
      return delegateCommand(
        bindCommand(ports.memoryReview, 'acceptMemory'),
        request,
        { memoryId: route.params.memoryId },
        200,
        'memory accept port is not configured',
      );
    case 'reject_memory':
      return delegateCommand(
        bindCommand(ports.memoryReview, 'rejectMemory'),
        request,
        { memoryId: route.params.memoryId },
        200,
        'memory reject port is not configured',
      );
    case 'edit_memory':
      return delegateCommand(
        bindCommand(ports.memoryReview, 'editMemory'),
        request,
        { memoryId: route.params.memoryId },
        200,
        'memory edit port is not configured',
      );
    case 'delete_memory':
      return delegateCommand(
        bindCommand(ports.memoryReview, 'deleteMemory'),
        request,
        { memoryId: route.params.memoryId },
        200,
        'memory delete port is not configured',
      );
    case 'hold_memory':
      return delegateCommand(
        bindCommand(ports.memoryReview, 'holdMemory'),
        request,
        { memoryId: route.params.memoryId },
        200,
        'memory hold port is not configured',
      );
  }
}
