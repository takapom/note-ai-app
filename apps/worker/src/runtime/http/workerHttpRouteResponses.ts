// Response mapping for the framework-neutral Worker HTTP boundary.
// Authority: docs/contracts/api-events.md

import type { OperationApprovalRuntimeHandlerResult } from '../../ai-operations/operationApprovalRuntimeHandlers.ts';
import type { MemoryCandidateProposalBoundaryResult } from '../../memory/memoryCandidateProposalBoundary.ts';
import type { NoteStructureRouteHandlerResult } from '../../scheduler/noteStructureRouteHandler.ts';
import type { NoteDocumentLoadResult, NoteDocumentSaveResult } from '../../note-model/noteDocumentPersistencePort.ts';
import type { ProvenanceLookupResult } from '../../note-model/provenanceLookupPort.ts';
import type { NoteStructureBackgroundDispatchResult, WorkerHttpResponse, WorkerRouteCommandResult } from './workerHttpRouterTypes.ts';

export function mapPortResult(
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

export function mapStructureResult(result: Pick<
  NoteStructureRouteHandlerResult,
  'ok' | 'route' | 'triggerReason' | 'scheduledJobs' | 'errors'
> & { backgroundDispatch?: NoteStructureBackgroundDispatchResult }): WorkerHttpResponse {
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
      ...(result.backgroundDispatch === undefined ? {} : { backgroundDispatch: result.backgroundDispatch }),
      errors: [],
    },
  };
}

export function mapOperationApprovalResult(
  result: OperationApprovalRuntimeHandlerResult,
  memoryCandidate?: MemoryCandidateProposalBoundaryResult,
): WorkerHttpResponse {
  if (!result.ok) {
    return badRequest(result.errors);
  }
  if (memoryCandidate !== undefined && !memoryCandidate.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        proposal: result.proposal,
        ...(result.approvedIntent === undefined ? {} : { approvedIntent: result.approvedIntent }),
        memoryCandidate: mapMemoryCandidateRouteResult(memoryCandidate),
        errors: sanitizePublicRouteErrors(memoryCandidate.errors),
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      proposal: result.proposal,
      ...(result.approvedIntent === undefined ? {} : { approvedIntent: result.approvedIntent }),
      ...(memoryCandidate === undefined ? {} : { memoryCandidate: mapMemoryCandidateRouteResult(memoryCandidate) }),
      errors: [],
    },
  };
}

export function mapMemoryCandidateRouteResult(
  result: MemoryCandidateProposalBoundaryResult,
): { ok: boolean; errors: string[]; memory?: unknown } {
  return {
    ok: result.ok,
    errors: sanitizePublicRouteErrors(result.errors),
    ...(result.memory === undefined ? {} : { memory: result.memory }),
  };
}

export function badRequest(errors: readonly string[]): WorkerHttpResponse {
  return {
    status: 400,
    body: { ok: false, errors: sanitizePublicRouteErrors(errors) },
  };
}

export function notConfigured(message: string): WorkerHttpResponse {
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

export function sanitizePublicRouteErrors(errors: readonly string[]): string[] {
  return errors.map((error) => {
    if (containsVolatileRuntimeDetail(error)) {
      return 'runtime dependency unavailable';
    }
    return error;
  });
}

export function containsVolatileRuntimeDetail(message: string): boolean {
  return /\b(sql|sqlite|libsql|turso|database|db|executor|connection|network|timeout|provider sdk|auth0|clerk|token|secret)\b/i.test(message);
}
