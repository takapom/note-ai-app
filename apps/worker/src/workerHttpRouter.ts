// Framework-neutral Worker HTTP routing boundary for the MVP API surface.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/cloudflare-agents-turso.md

import {
  runOperationAcceptHandler,
  runOperationDismissHandler,
  type OperationApprovalRuntimeHandlerInput,
  type OperationApprovalRuntimeHandlerResult,
} from './operationApprovalRuntimeHandlers.ts';
import {
  runNoteStructureRouteHandler,
  type NoteLeaveCause,
  type NoteStructureRouteHandlerResult,
} from './noteStructureRuntimeHandlers.ts';
import type {
  NoteDocumentContract,
} from '../../../contexts/note-model/src/contract/noteContract.ts';
import type {
  NoteDocumentLoadRequest,
  NoteDocumentLoadResult,
  NoteDocumentPersistencePort,
  NoteDocumentSaveResult,
} from './noteDocumentPersistencePort.ts';
import type { NoteBlockCommandPort } from './noteBlockCommandPort.ts';
import type { DigestReadPort } from './nextOpenDigestReadPort.ts';
import type { ProvenanceLookupInput, ProvenanceLookupPort, ProvenanceLookupResult } from './provenanceLookupPort.ts';
import type { StructureTriggerSchedulerFlowInput } from './structureSchedulerRuntimeFlow.ts';

export interface WorkerHttpRequest {
  method: string;
  path: string;
  workspaceId: string;
  userId?: string;
  now: number;
  body?: unknown;
}

export interface WorkerHttpResponse {
  status: number;
  body: unknown;
}

export type { DigestReadPort } from './nextOpenDigestReadPort.ts';
export type { NoteBlockCommandPort } from './noteBlockCommandPort.ts';

export interface MemoryReviewPort {
  acceptMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
  rejectMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
}

export interface WorkerRouteCommandInput {
  workspaceId: string;
  userId?: string;
  noteId?: string;
  blockId?: string;
  operationId?: string;
  memoryId?: string;
  now: number;
  body?: unknown;
}

export interface WorkerRouteCommandResult {
  ok: boolean;
  errors: string[];
  body?: unknown;
}

export interface WorkerHttpRouterPorts {
  noteDocument?: NoteDocumentPersistencePort;
  noteBlocks?: NoteBlockCommandPort;
  noteStructure?: StructureTriggerSchedulerFlowInput['ports'];
  operationApproval?: OperationApprovalRuntimeHandlerInput['proposalPersistence'];
  digestRead?: DigestReadPort;
  memoryReview?: MemoryReviewPort;
  provenanceLookup?: ProvenanceLookupPort;
}

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
      return delegateCommand(ports.noteBlocks?.createBlock, request, { noteId: route.params.noteId }, 201, 'note block create port is not configured');
    case 'update_block':
      return delegateCommand(ports.noteBlocks?.updateBlock, request, { blockId: route.params.blockId }, 200, 'note block update port is not configured');
    case 'delete_block':
      return delegateCommand(ports.noteBlocks?.deleteBlock, request, { blockId: route.params.blockId }, 204, 'note block delete port is not configured');
    case 'leave_note':
      return runStructureRoute(request, ports.noteStructure, route.params.noteId, 'note_leave');
    case 'manual_organize_note':
      return runStructureRoute(request, ports.noteStructure, route.params.noteId, 'manual_organize');
    case 'get_digest':
      return delegateCommand(ports.digestRead?.getDigest, request, { noteId: route.params.noteId }, 200, 'digest read port is not configured');
    case 'lookup_provenance_source':
      return runProvenanceLookupRoute(request, ports.provenanceLookup);
    case 'accept_operation':
      return runOperationApprovalRoute(request, ports.operationApproval, route.params.operationId, 'accept');
    case 'dismiss_operation':
      return runOperationApprovalRoute(request, ports.operationApproval, route.params.operationId, 'dismiss');
    case 'accept_memory':
      return delegateCommand(ports.memoryReview?.acceptMemory, request, { memoryId: route.params.memoryId }, 200, 'memory accept port is not configured');
    case 'reject_memory':
      return delegateCommand(ports.memoryReview?.rejectMemory, request, { memoryId: route.params.memoryId }, 200, 'memory reject port is not configured');
  }
}

export type WorkerRouteName =
  | 'list_notes'
  | 'create_note'
  | 'get_note'
  | 'update_note'
  | 'create_block'
  | 'update_block'
  | 'delete_block'
  | 'leave_note'
  | 'manual_organize_note'
  | 'get_digest'
  | 'lookup_provenance_source'
  | 'accept_operation'
  | 'dismiss_operation'
  | 'accept_memory'
  | 'reject_memory';

export interface MatchedWorkerRoute {
  name: WorkerRouteName;
  params: Record<string, string>;
}

export function matchWorkerRoute(method: string, path: string): MatchedWorkerRoute | undefined {
  const normalizedMethod = method.toUpperCase();
  const segments = splitPath(path);

  if (segments.length === 1 && segments[0] === 'notes') {
    if (normalizedMethod === 'GET') return { name: 'list_notes', params: {} };
    if (normalizedMethod === 'POST') return { name: 'create_note', params: {} };
    return undefined;
  }

  if (segments.length === 2 && segments[0] === 'notes') {
    if (normalizedMethod === 'GET') return { name: 'get_note', params: { noteId: segments[1] } };
    if (normalizedMethod === 'PATCH') return { name: 'update_note', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'notes' && segments[2] === 'blocks') {
    if (normalizedMethod === 'POST') return { name: 'create_block', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 2 && segments[0] === 'blocks') {
    if (normalizedMethod === 'PATCH') return { name: 'update_block', params: { blockId: segments[1] } };
    if (normalizedMethod === 'DELETE') return { name: 'delete_block', params: { blockId: segments[1] } };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'notes' && segments[2] === 'leave') {
    if (normalizedMethod === 'POST') return { name: 'leave_note', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 4 && segments[0] === 'notes' && segments[2] === 'structure' && segments[3] === 'manual') {
    if (normalizedMethod === 'POST') return { name: 'manual_organize_note', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'notes' && segments[2] === 'digest') {
    if (normalizedMethod === 'GET') return { name: 'get_digest', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 2 && segments[0] === 'provenance' && segments[1] === 'source') {
    if (normalizedMethod === 'POST') return { name: 'lookup_provenance_source', params: {} };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'ai-operations') {
    if (normalizedMethod === 'POST' && segments[2] === 'accept') {
      return { name: 'accept_operation', params: { operationId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'dismiss') {
      return { name: 'dismiss_operation', params: { operationId: segments[1] } };
    }
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'memory') {
    if (normalizedMethod === 'POST' && segments[2] === 'accept') {
      return { name: 'accept_memory', params: { memoryId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'reject') {
      return { name: 'reject_memory', params: { memoryId: segments[1] } };
    }
  }

  return undefined;
}

function splitPath(path: string): string[] {
  return path
    .split('?')[0]
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(decodeURIComponent);
}

function methodAllowedForKnownPath(method: string, path: string): boolean {
  return matchWorkerRoute(method, path) === undefined &&
    ['GET', 'POST', 'PATCH', 'DELETE'].some((candidate) => matchWorkerRoute(candidate, path) !== undefined);
}

function validateBaseRequest(request: WorkerHttpRequest): string[] {
  const errors: string[] = [];
  if (!isStableRuntimeId(request.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(request.now)) {
    errors.push('now must be a finite number');
  }
  return errors;
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
  ports: StructureTriggerSchedulerFlowInput['ports'] | undefined,
  noteId: string,
  route: 'note_leave' | 'manual_organize',
): Promise<WorkerHttpResponse> {
  if (ports === undefined) {
    return notConfigured('note structure scheduler ports are not configured');
  }

  const result = await runNoteStructureRouteHandler({
    workspaceId: request.workspaceId,
    noteId,
    route,
    ...(route === 'note_leave' ? readNoteLeaveCause(request.body) : {}),
    now: request.now,
    ports,
  });

  return mapStructureResult(result);
}

async function runOperationApprovalRoute(
  request: WorkerHttpRequest,
  proposalPersistence: OperationApprovalRuntimeHandlerInput['proposalPersistence'] | undefined,
  operationId: string,
  action: 'accept' | 'dismiss',
): Promise<WorkerHttpResponse> {
  if (proposalPersistence === undefined) {
    return notConfigured('operation proposal persistence port is not configured');
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

  return mapOperationApprovalResult(result);
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

function parseProvenanceLookupRouteInput(
  request: WorkerHttpRequest,
): { ok: true; input: ProvenanceLookupInput } | { ok: false; errors: string[] } {
  if (!isRecord(request.body)) {
    return { ok: false, errors: ['body must be an object'] };
  }

  const sourceSpanId = request.body.sourceSpanId;
  const sourceBlockId = request.body.sourceBlockId;
  const startOffset = request.body.startOffset;
  const endOffset = request.body.endOffset;
  const errors: string[] = [];
  const sourceSpanIdIsValid = isStableRuntimeId(sourceSpanId);
  const sourceBlockIdIsValid = isStableRuntimeId(sourceBlockId);
  const startOffsetIsValid = isNonNegativeInteger(startOffset);
  const endOffsetIsValid = isNonNegativeInteger(endOffset);

  if (!sourceSpanIdIsValid) {
    errors.push('sourceSpanId must be a stable non-sentinel runtime id');
  }
  if (!sourceBlockIdIsValid) {
    errors.push('sourceBlockId must be a stable non-sentinel runtime id');
  }
  if (!startOffsetIsValid) {
    errors.push('startOffset must be a non-negative finite integer');
  }
  if (!endOffsetIsValid) {
    errors.push('endOffset must be a non-negative finite integer');
  }
  if (
    typeof startOffset === 'number' &&
    Number.isFinite(startOffset) &&
    typeof endOffset === 'number' &&
    Number.isFinite(endOffset) &&
    endOffset < startOffset
  ) {
    errors.push('endOffset must be greater than or equal to startOffset');
  }

  if (
    errors.length > 0 ||
    !sourceSpanIdIsValid ||
    !sourceBlockIdIsValid ||
    !startOffsetIsValid ||
    !endOffsetIsValid
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      workspaceId: request.workspaceId,
      sourceSpanId,
      sourceBlockId,
      startOffset,
      endOffset,
    },
  };
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

function readNoteLeaveCause(body: unknown): { cause?: NoteLeaveCause } {
  if (!isRecord(body) || body.cause === undefined) {
    return {};
  }

  return { cause: body.cause as NoteLeaveCause };
}

function mapPortResult(
  result: NoteDocumentLoadResult | NoteDocumentSaveResult | WorkerRouteCommandResult | ProvenanceLookupResult,
  successStatus: number,
): WorkerHttpResponse {
  if (!result.ok) {
    return badRequest(result.errors);
  }

  return {
    status: successStatus,
    body: {
      ok: true,
      ...('document' in result && result.document !== undefined ? { document: result.document } : {}),
      ...('body' in result && result.body !== undefined ? { result: result.body } : {}),
    },
  };
}

function mapStructureResult(result: NoteStructureRouteHandlerResult): WorkerHttpResponse {
  if (!result.ok) {
    return badRequest(result.errors);
  }

  return {
    status: 202,
    body: {
      ok: true,
      route: result.route,
      triggerReason: result.triggerReason,
      scheduledJobs: result.scheduledJobs,
      errors: [],
    },
  };
}

function mapOperationApprovalResult(result: OperationApprovalRuntimeHandlerResult): WorkerHttpResponse {
  if (!result.ok) {
    return badRequest(result.errors);
  }

  return {
    status: 200,
    body: {
      ok: true,
      proposal: result.proposal,
      ...(result.approvedIntent === undefined ? {} : { approvedIntent: result.approvedIntent }),
      errors: [],
    },
  };
}

function badRequest(errors: readonly string[]): WorkerHttpResponse {
  return {
    status: 400,
    body: { ok: false, errors: [...errors] },
  };
}

function notConfigured(message: string): WorkerHttpResponse {
  return {
    status: 501,
    body: { ok: false, errors: [message] },
  };
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
