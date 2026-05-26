// Framework-neutral Worker HTTP routing types for the MVP API surface.
// Authority: docs/contracts/api-events.md

import type { OperationApprovalRuntimeHandlerInput } from '../../ai-operations/operationApprovalRuntimeHandlers.ts';
import type { MemoryCandidatePersistencePort } from '../../memory/memoryCandidateProposalBoundary.ts';
import type { NoteLeaveCause, NoteStructureRouteHandlerResult, NoteStructureRouteKind } from '../../scheduler/noteStructureRouteHandler.ts';
import type { NoteDocumentPersistencePort } from '../../note-model/noteDocumentPersistencePort.ts';
import type { NoteBlockCommandPort } from '../../note-model/noteBlockCommandPort.ts';
import type { DigestReadPort } from '../../scheduler/nextOpenDigestReadPort.ts';
import type { ProvenanceLookupPort } from '../../note-model/provenanceLookupPort.ts';
import type { StructureTriggerSchedulerFlowInput } from '../../scheduler/structureSchedulerRuntimeFlow.ts';

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

export interface MemoryReviewPort {
  acceptMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
  rejectMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
  editMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
  deleteMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
  holdMemory(input: WorkerRouteCommandInput): Promise<WorkerRouteCommandResult>;
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
  noteStructureRoute?: NoteStructureRoutePort;
  noteStructure?: StructureTriggerSchedulerFlowInput['ports'];
  operationApproval?: OperationApprovalRuntimeHandlerInput['proposalPersistence'];
  memoryCandidatePersistence?: MemoryCandidatePersistencePort;
  digestRead?: DigestReadPort;
  memoryReview?: MemoryReviewPort;
  provenanceLookup?: ProvenanceLookupPort;
}

export interface NoteStructureBackgroundDispatchResult {
  attempted: boolean;
  ok: boolean;
  enqueuedCount: number;
  scheduledJobIds: readonly string[];
  errors: string[];
}

export interface NoteStructureRoutePort {
  runNoteStructureRoute(input: {
    workspaceId: string;
    userId?: string;
    noteId: string;
    route: NoteStructureRouteKind;
    cause?: NoteLeaveCause;
    now: number;
  }): Promise<Pick<
    NoteStructureRouteHandlerResult,
    'ok' | 'route' | 'triggerReason' | 'scheduledJobs' | 'providerCalls' | 'operationRoutingCalls' | 'auditWrites' | 'errors'
  > & { backgroundDispatch?: NoteStructureBackgroundDispatchResult }>;
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
  | 'reject_memory'
  | 'edit_memory'
  | 'delete_memory'
  | 'hold_memory';

export interface MatchedWorkerRoute {
  name: WorkerRouteName;
  params: Record<string, string>;
}
