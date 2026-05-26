// Framework-neutral Worker HTTP routing boundary for the MVP API surface.
// Authority: docs/contracts/api-events.md

import { mapApprovedOperationIntentToMemoryCandidateApprovalInput } from '../../ai-operations/memoryCandidateApprovalMapping.ts';
import { runOperationAcceptHandler, runOperationDismissHandler, type OperationApprovalRuntimeHandlerInput, type OperationApprovalRuntimeHandlerResult } from '../../ai-operations/operationApprovalRuntimeHandlers.ts';
import { prepareMemoryCandidateWriteIntent, runMemoryCandidateProposalBoundary, type MemoryCandidatePersistencePort, type MemoryCandidateProposalBoundaryResult } from '../../memory/memoryCandidateProposalBoundary.ts';
import { runNoteStructureRouteHandler } from '../../scheduler/noteStructureRouteHandler.ts';
import type { NoteDocumentContract } from '../../../../../contexts/note-model/src/contract/noteContract.ts';
import type { NoteDocumentLoadRequest, NoteDocumentLoadResult, NoteDocumentPersistencePort } from '../../note-model/noteDocumentPersistencePort.ts';
import type { ProvenanceLookupPort } from '../../note-model/provenanceLookupPort.ts';
import { methodAllowedForKnownPath, matchWorkerRoute } from './workerHttpRouteMatcher.ts';
import { isRecord, isStableRuntimeId, parseProvenanceLookupRouteInput, readNoteLeaveCause, validateBaseRequest } from './workerHttpRouteParsers.ts';
import { badRequest, mapOperationApprovalResult, mapPortResult, mapStructureResult, notConfigured } from './workerHttpRouteResponses.ts';
import type {
  NoteStructureRoutePort,
  WorkerHttpRequest,
  WorkerHttpResponse,
  WorkerHttpRouterPorts,
  WorkerRouteCommandInput,
  WorkerRouteCommandResult,
} from './workerHttpRouterTypes.ts';

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
      return notConfigured('note list port is not configured');
    case 'create_note':
      return saveNoteDocument(request, ports.noteDocument, 201);
    case 'get_note':
      return loadNoteDocument(request, ports.noteDocument, route.params.noteId);
    case 'update_note':
      return saveNoteDocument(request, ports.noteDocument, 200);
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

async function saveNoteDocument(
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

async function loadNoteDocument(
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

async function runStructureRoute(
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

async function runOperationApprovalRoute(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'operationApproval' | 'memoryCandidatePersistence'>,
  operationId: string,
  action: 'accept' | 'dismiss',
): Promise<WorkerHttpResponse> {
  const proposalPersistence = ports.operationApproval;
  if (proposalPersistence === undefined) {
    return notConfigured('operation proposal persistence port is not configured');
  }

  if (action === 'accept') {
    const preflight = await preflightMemoryCandidateProposalAccept(request, ports, operationId);
    if (preflight !== undefined) {
      return preflight;
    }
  }

  const input: OperationApprovalRuntimeHandlerInput = {
    proposalPersistence,
    workspaceId: request.workspaceId,
    operationId,
    now: request.now,
  };
  const result = action === 'accept'
    ? await runOperationAcceptHandler(input)
    : await runOperationDismissHandler(input);

  if (!result.ok || action === 'dismiss') {
    return mapOperationApprovalResult(result);
  }

  const memoryCandidate = await runAcceptedOperationMemoryCandidateBoundary(
    request,
    ports.memoryCandidatePersistence,
    result,
  );

  return mapOperationApprovalResult(result, memoryCandidate);
}

async function preflightMemoryCandidateProposalAccept(
  request: WorkerHttpRequest,
  ports: Pick<WorkerHttpRouterPorts, 'operationApproval' | 'memoryCandidatePersistence'>,
  operationId: string,
): Promise<WorkerHttpResponse | undefined> {
  const proposal = await ports.operationApproval?.findProposal({
    workspaceId: request.workspaceId,
    operationId,
  });
  if (
    proposal === undefined ||
    proposal.state !== 'pending' ||
    proposal.auditRecord.operationType !== 'create_memory_candidate'
  ) {
    return undefined;
  }

  if (!isStableRuntimeId(request.userId)) {
    return badRequest(['userId must be a stable non-sentinel runtime id for memory candidate proposal persistence']);
  }
  if (ports.memoryCandidatePersistence === undefined) {
    return notConfigured('memory candidate proposal persistence port is not configured');
  }

  const prepared = prepareMemoryCandidateWriteIntent({
    memoryCandidatePersistence: ports.memoryCandidatePersistence,
    workspaceId: request.workspaceId,
    userId: request.userId,
    approvalInput: mapApprovedOperationIntentToMemoryCandidateApprovalInput({
      type: 'operation_proposal_accepted',
      workspaceId: request.workspaceId,
      operationId,
      auditRecord: proposal.auditRecord,
      acceptedAt: request.now,
    }),
    now: request.now,
  });

  return prepared.ok ? undefined : badRequest(prepared.errors);
}

async function runAcceptedOperationMemoryCandidateBoundary(
  request: WorkerHttpRequest,
  memoryCandidatePersistence: MemoryCandidatePersistencePort | undefined,
  approval: OperationApprovalRuntimeHandlerResult,
): Promise<MemoryCandidateProposalBoundaryResult> {
  if (
    approval.approvedIntent === undefined ||
    approval.approvedIntent.auditRecord.operationType !== 'create_memory_candidate'
  ) {
    return { ok: true, errors: [] };
  }

  if (!isStableRuntimeId(request.userId)) {
    return {
      ok: false,
      errors: ['userId must be a stable non-sentinel runtime id for memory candidate proposal persistence'],
    };
  }

  if (memoryCandidatePersistence === undefined) {
    return {
      ok: false,
      errors: ['memory candidate proposal persistence port is not configured'],
    };
  }

  return runMemoryCandidateProposalBoundary({
    memoryCandidatePersistence,
    workspaceId: request.workspaceId,
    userId: request.userId,
    approvalInput: mapApprovedOperationIntentToMemoryCandidateApprovalInput(approval.approvedIntent),
    now: request.now,
  });
}

async function runProvenanceLookupRoute(
  request: WorkerHttpRequest,
  port: ProvenanceLookupPort | undefined,
): Promise<WorkerHttpResponse> {
  if (port === undefined) {
    return notConfigured('provenance lookup port is not configured');
  }

  const parsedInput = parseProvenanceLookupRouteInput(request);
  if (!parsedInput.ok) {
    return badRequest(parsedInput.errors);
  }

  const result = await port.lookupSource(parsedInput.input);

  return mapPortResult(result, 200);
}

async function delegateCommand(
  command: ((input: WorkerRouteCommandInput) => Promise<WorkerRouteCommandResult>) | undefined,
  request: WorkerHttpRequest,
  params: Omit<WorkerRouteCommandInput, 'workspaceId' | 'userId' | 'now' | 'body'>,
  successStatus: number,
  missingMessage: string,
): Promise<WorkerHttpResponse> {
  if (command === undefined) {
    return notConfigured(missingMessage);
  }

  const result = await command({
    workspaceId: request.workspaceId,
    ...(request.userId === undefined ? {} : { userId: request.userId }),
    now: request.now,
    ...(request.body === undefined ? {} : { body: request.body }),
    ...params,
  });

  return mapPortResult(result, successStatus);
}

function bindCommand<
  Port extends object,
  MethodName extends keyof Port,
>(
  port: Port | undefined,
  methodName: MethodName,
): ((input: WorkerRouteCommandInput) => Promise<WorkerRouteCommandResult>) | undefined {
  if (port === undefined) {
    return undefined;
  }

  const method = port?.[methodName];
  return typeof method === 'function'
    ? (method as (this: Port, input: WorkerRouteCommandInput) => Promise<WorkerRouteCommandResult>).bind(port)
    : undefined;
}
