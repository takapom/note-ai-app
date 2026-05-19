export type NoteSurfaceWorkerRequestMethod = 'GET' | 'POST';

export type NoteSurfaceApiIntentKind =
  | 'ai_assist.accept'
  | 'ai_assist.dismiss'
  | 'memory.remember'
  | 'memory.reject'
  | 'memory.edit'
  | 'memory.delete'
  | 'memory.snooze'
  | 'digest.read'
  | 'provenance.lookup';

export interface NoteSurfaceWorkerRequestDescriptor {
  method: NoteSurfaceWorkerRequestMethod;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface NoteSurfaceApiIntentResult {
  ok: boolean;
  request?: NoteSurfaceWorkerRequestDescriptor;
  unavailableReason?: string;
  errors: readonly string[];
}

export interface NoteSurfaceApiIntentBaseInput {
  intent: NoteSurfaceApiIntentKind;
  workspaceId: string;
  userId?: string;
}

export interface AiAssistApiIntentInput extends NoteSurfaceApiIntentBaseInput {
  intent: 'ai_assist.accept' | 'ai_assist.dismiss';
  operationId: string;
}

export interface MemoryApiIntentInput extends NoteSurfaceApiIntentBaseInput {
  intent: 'memory.remember' | 'memory.reject' | 'memory.edit' | 'memory.delete' | 'memory.snooze';
  memoryId: string;
}

export interface DigestApiIntentInput extends NoteSurfaceApiIntentBaseInput {
  intent: 'digest.read';
  noteId: string;
}

export interface ProvenanceLookupInput {
  sourceSpanId: string;
  sourceBlockId: string;
  startOffset: number;
  endOffset: number;
}

export interface ProvenanceApiIntentInput extends NoteSurfaceApiIntentBaseInput {
  intent: 'provenance.lookup';
  provenance: ProvenanceLookupInput;
}

export type NoteSurfaceApiIntentInput =
  | AiAssistApiIntentInput
  | MemoryApiIntentInput
  | DigestApiIntentInput
  | ProvenanceApiIntentInput;

const unavailableMemoryIntents = new Set<NoteSurfaceApiIntentKind>([
  'memory.edit',
  'memory.delete',
  'memory.snooze',
]);

const supportedIntents = new Set<NoteSurfaceApiIntentKind>([
  'ai_assist.accept',
  'ai_assist.dismiss',
  'memory.remember',
  'memory.reject',
  'memory.edit',
  'memory.delete',
  'memory.snooze',
  'digest.read',
  'provenance.lookup',
]);

export function createNoteSurfaceApiRequest(input: unknown): NoteSurfaceApiIntentResult {
  return mapNoteSurfaceIntentToWorkerRequest(input);
}

export function mapNoteSurfaceIntentToWorkerRequest(input: unknown): NoteSurfaceApiIntentResult {
  const errors = validateBaseInput(input);
  if (input === null || typeof input !== 'object') {
    return { ok: false, errors };
  }

  const intent = getStringField(input, 'intent') as NoteSurfaceApiIntentKind | undefined;

  if (intent === undefined || !supportedIntents.has(intent)) {
    return unavailable(`unsupported intent: ${String(intent)}`, errors);
  }

  if (unavailableMemoryIntents.has(intent)) {
    validatePathSegment('memoryId', getStringField(input, 'memoryId'), errors);
    return unavailable(`${intent} has no Worker route in the current MVP API surface`, errors);
  }

  switch (intent) {
    case 'ai_assist.accept':
      validatePathSegment('operationId', getStringField(input, 'operationId'), errors);
      return requestResult(errors, {
        method: 'POST',
        path: `/ai-operations/${getStringField(input, 'operationId')}/accept`,
        headers: createMetadataHeaders(input),
      });
    case 'ai_assist.dismiss':
      validatePathSegment('operationId', getStringField(input, 'operationId'), errors);
      return requestResult(errors, {
        method: 'POST',
        path: `/ai-operations/${getStringField(input, 'operationId')}/dismiss`,
        headers: createMetadataHeaders(input),
      });
    case 'memory.remember':
      validatePathSegment('memoryId', getStringField(input, 'memoryId'), errors);
      return requestResult(errors, {
        method: 'POST',
        path: `/memory/${getStringField(input, 'memoryId')}/accept`,
        headers: createMetadataHeaders(input),
      });
    case 'memory.reject':
      validatePathSegment('memoryId', getStringField(input, 'memoryId'), errors);
      return requestResult(errors, {
        method: 'POST',
        path: `/memory/${getStringField(input, 'memoryId')}/reject`,
        headers: createMetadataHeaders(input),
      });
    case 'digest.read':
      validatePathSegment('noteId', getStringField(input, 'noteId'), errors);
      return requestResult(errors, {
        method: 'GET',
        path: `/notes/${getStringField(input, 'noteId')}/digest`,
        headers: createMetadataHeaders(input),
      });
    case 'provenance.lookup':
      validateProvenance((input as Record<string, unknown>).provenance, errors);
      return requestResult(errors, {
        method: 'POST',
        path: '/provenance/source',
        headers: {
          ...createMetadataHeaders(input),
          'Content-Type': 'application/json',
        },
        body: {
          sourceSpanId: getProvenanceStringField(input, 'sourceSpanId'),
          sourceBlockId: getProvenanceStringField(input, 'sourceBlockId'),
          startOffset: getProvenanceNumberField(input, 'startOffset'),
          endOffset: getProvenanceNumberField(input, 'endOffset'),
        },
      });
    default:
      return unavailable(`unsupported intent: ${String(intent)}`, errors);
  }
}

function requestResult(
  errors: readonly string[],
  request: NoteSurfaceWorkerRequestDescriptor,
): NoteSurfaceApiIntentResult {
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, request, errors: [] };
}

function unavailable(unavailableReason: string, errors: readonly string[]): NoteSurfaceApiIntentResult {
  return {
    ok: false,
    unavailableReason,
    errors,
  };
}

function validateBaseInput(input: unknown): string[] {
  const errors: string[] = [];

  if (input === null || typeof input !== 'object') {
    return ['input must be an object'];
  }

  validatePathSegment('workspaceId', getStringField(input, 'workspaceId'), errors);

  const userId = getStringField(input, 'userId');
  if (userId !== undefined) {
    validatePathSegment('userId', userId, errors);
  }

  return errors;
}

function validateProvenance(provenance: unknown, errors: string[]): void {
  if (provenance === null || typeof provenance !== 'object') {
    errors.push('provenance must be an object');
    return;
  }

  const source = provenance as Record<string, unknown>;
  validatePathSegment('sourceSpanId', getStringField(source, 'sourceSpanId'), errors);
  validatePathSegment('sourceBlockId', getStringField(source, 'sourceBlockId'), errors);
  validateNonNegativeInteger('startOffset', getNumberField(source, 'startOffset'), errors);
  validateNonNegativeInteger('endOffset', getNumberField(source, 'endOffset'), errors);

  if (
    Number.isInteger(source.startOffset)
    && Number.isInteger(source.endOffset)
    && Number(source.endOffset) < Number(source.startOffset)
  ) {
    errors.push('endOffset must be greater than or equal to startOffset');
  }
}

function validatePathSegment(fieldName: string, value: string | undefined, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${fieldName} is required`);
    return;
  }

  let hasPathSegmentError = false;
  if (value !== value.trim()) {
    errors.push(`${fieldName} must not include leading or trailing whitespace`);
    hasPathSegmentError = true;
  }

  if (/[/?#]/.test(value)) {
    errors.push(`${fieldName} must be a single path segment`);
    hasPathSegmentError = true;
  }

  if (!hasPathSegmentError && !isStableRuntimeId(value)) {
    errors.push(`${fieldName} must be a stable non-sentinel runtime id`);
  }
}

function validateNonNegativeInteger(fieldName: string, value: number | undefined, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`${fieldName} must be a non-negative integer`);
  }
}

function createMetadataHeaders(input: object): Record<string, string> {
  const workspaceId = getStringField(input, 'workspaceId') ?? '';
  const userId = getStringField(input, 'userId');

  return {
    'X-Workspace-Id': workspaceId,
    ...(userId === undefined ? {} : { 'X-User-Id': userId }),
  };
}

function getStringField(input: object, fieldName: string): string | undefined {
  const value = (input as Record<string, unknown>)[fieldName];
  return typeof value === 'string' ? value : undefined;
}

function getNumberField(input: object, fieldName: string): number | undefined {
  const value = (input as Record<string, unknown>)[fieldName];
  return typeof value === 'number' ? value : undefined;
}

function getProvenanceStringField(input: object, fieldName: string): string | undefined {
  const provenance = (input as Record<string, unknown>).provenance;
  if (provenance === null || typeof provenance !== 'object') {
    return undefined;
  }

  return getStringField(provenance, fieldName);
}

function getProvenanceNumberField(input: object, fieldName: string): number | undefined {
  const provenance = (input as Record<string, unknown>).provenance;
  if (provenance === null || typeof provenance !== 'object') {
    return undefined;
  }

  return getNumberField(provenance, fieldName);
}

function isStableRuntimeId(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}
