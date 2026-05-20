// Read model port for next-open digest projections.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/ai-structuring-lifecycle.md, docs/contracts/backend-runtime.md

export interface NextOpenDigestReadInput {
  workspaceId: string;
  noteId?: string;
  now: number;
}

export interface NextOpenDigestReadModel {
  available: boolean;
  noteId: string;
  triggerReason?: string;
  preparedAt?: number;
  recoveredJobCount?: number;
  sections?: readonly unknown[];
  items?: readonly unknown[];
}

export interface NextOpenDigestReadResult {
  ok: boolean;
  errors: string[];
  body?: NextOpenDigestReadModel;
}

export interface DigestReadPort {
  getDigest(input: NextOpenDigestReadInput): Promise<NextOpenDigestReadResult>;
}

export interface NextOpenDigestReadSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface NextOpenDigestReadSqlExecutor {
  query(statement: NextOpenDigestReadSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export class InMemoryNextOpenDigestReadPort implements DigestReadPort {
  private readonly digests = new Map<string, NextOpenDigestReadModel>();

  constructor(initialDigests: readonly NextOpenDigestReadModel[] = [], workspaceId?: string) {
    for (const digest of initialDigests) {
      const errors = validateStoredDigest(digest);
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }
      if (!isStableRuntimeId(workspaceId)) {
        throw new Error('workspaceId must be a stable non-sentinel runtime id');
      }
      this.digests.set(digestKey(workspaceId, digest.noteId), cloneDigest(digest));
    }
  }

  async getDigest(input: NextOpenDigestReadInput): Promise<NextOpenDigestReadResult> {
    const errors = validateDigestReadInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const noteId = input.noteId as string;
    const digest = this.digests.get(digestKey(input.workspaceId, noteId));
    return {
      ok: true,
      errors: [],
      body: digest === undefined
        ? unavailableDigest(noteId)
        : cloneDigest(digest),
    };
  }
}

export class AgentLocalNextOpenDigestReadAdapter implements DigestReadPort {
  private readonly executor: NextOpenDigestReadSqlExecutor;

  constructor(executor: NextOpenDigestReadSqlExecutor) {
    this.executor = executor;
  }

  async getDigest(input: NextOpenDigestReadInput): Promise<NextOpenDigestReadResult> {
    const errors = validateDigestReadInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const statements = mapNextOpenDigestReadToAgentLocalSql(input);
    if (statements.length === 0) {
      return {
        ok: false,
        errors: ['next_open digest read produced no statements'],
      };
    }

    try {
      const rows = await this.executor.query(statements[0]);
      return mapNextOpenDigestRows(rows, input);
    } catch (error) {
      return {
        ok: false,
        errors: [toReadErrorMessage('next_open digest read failed', error)],
      };
    }
  }
}

export function mapNextOpenDigestReadToAgentLocalSql(
  input: NextOpenDigestReadInput,
): NextOpenDigestReadSqlStatement[] {
  const errors = validateDigestReadInput(input);
  if (errors.length > 0) {
    return [];
  }

  const noteId = input.noteId as string;
  return [{
    sql: [
      'select workspace_id, note_id, trigger_reason, recovered_job_count, prepared, payload_json',
      'from agent_local_next_open_digest_preparation_intents',
      'where workspace_id = ? and note_id = ?',
      'order by rowid desc',
      'limit 1',
    ].join(' '),
    args: [
      input.workspaceId,
      noteId,
    ],
  }];
}

export function mapNextOpenDigestRows(
  rows: readonly Record<string, unknown>[],
  input: NextOpenDigestReadInput,
): NextOpenDigestReadResult {
  const inputErrors = validateDigestReadInput(input);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }

  const requestedNoteId = input.noteId as string;
  if (rows.length === 0) {
    return {
      ok: true,
      errors: [],
      body: unavailableDigest(requestedNoteId),
    };
  }

  const row = rows[0];
  const payloadResult = parsePayload(row.payload_json ?? row.payloadJson);
  if (!payloadResult.ok) {
    return {
      ok: false,
      errors: payloadResult.errors,
    };
  }

  const payload = payloadResult.payload;
  const workspaceId = readString(row.workspace_id ?? row.workspaceId) ?? readString(payload.workspaceId);
  const noteId = readString(row.note_id ?? row.noteId) ?? readString(payload.noteId);
  const prepared = readBoolean(row.prepared) ?? readBoolean(payload.prepared);
  const recoveredJobCount = readNonNegativeInteger(row.recovered_job_count ?? row.recoveredJobCount)
    ?? readNonNegativeInteger(payload.recoveredJobCount);
  const triggerReason = readString(row.trigger_reason ?? row.triggerReason) ?? readString(payload.triggerReason);
  const preparedAt = readFiniteNumber(row.prepared_at ?? row.preparedAt) ?? readFiniteNumber(payload.preparedAt);

  const errors: string[] = [];
  if (workspaceId !== input.workspaceId) {
    errors.push('digest row workspaceId must match requested workspaceId');
  }
  if (noteId !== requestedNoteId) {
    errors.push('digest row noteId must match requested noteId');
  }
  if (prepared === undefined) {
    errors.push('digest row prepared must be a boolean or 0/1');
  }
  if (prepared === true && recoveredJobCount === undefined) {
    errors.push('digest row recoveredJobCount must be a non-negative integer');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (prepared !== true) {
    return {
      ok: true,
      errors: [],
      body: unavailableDigest(requestedNoteId),
    };
  }

  return {
    ok: true,
    errors: [],
    body: cloneDigest({
      available: true,
      noteId: requestedNoteId,
      ...(triggerReason === undefined ? {} : { triggerReason }),
      ...(preparedAt === undefined ? {} : { preparedAt }),
      ...(recoveredJobCount === undefined ? {} : { recoveredJobCount }),
      ...(Array.isArray(payload.sections) ? { sections: cloneUnknown(payload.sections) } : {}),
      ...(Array.isArray(payload.items) ? { items: cloneUnknown(payload.items) } : {}),
    }),
  };
}

export function validateDigestReadInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['digest read input must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.noteId)) {
    errors.push('noteId must be a stable non-sentinel runtime id');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

function validateStoredDigest(digest: unknown): string[] {
  if (!isRecord(digest)) {
    return ['digest must be an object'];
  }

  const errors: string[] = [];
  if (digest.available !== true) {
    errors.push('digest.available must be true for stored digests');
  }
  if (!isStableRuntimeId(digest.noteId)) {
    errors.push('digest.noteId must be a stable non-sentinel runtime id');
  }
  if (digest.triggerReason !== undefined && !isNonEmptyString(digest.triggerReason)) {
    errors.push('digest.triggerReason must be a non-empty string when provided');
  }
  if (digest.preparedAt !== undefined && !Number.isFinite(digest.preparedAt)) {
    errors.push('digest.preparedAt must be a finite number when provided');
  }
  if (digest.recoveredJobCount !== undefined && readNonNegativeInteger(digest.recoveredJobCount) === undefined) {
    errors.push('digest.recoveredJobCount must be a non-negative integer when provided');
  }
  if (digest.sections !== undefined && !Array.isArray(digest.sections)) {
    errors.push('digest.sections must be an array when provided');
  }
  if (digest.items !== undefined && !Array.isArray(digest.items)) {
    errors.push('digest.items must be an array when provided');
  }

  return errors;
}

function unavailableDigest(noteId: string): NextOpenDigestReadModel {
  return {
    available: false,
    noteId,
  };
}

function digestKey(workspaceId: string, noteId: string): string {
  return `${workspaceId}:${noteId}`;
}

function parsePayload(value: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; errors: string[] } {
  if (value === undefined || value === null) {
    return { ok: true, payload: {} };
  }

  if (isRecord(value)) {
    return { ok: true, payload: value };
  }

  if (typeof value !== 'string') {
    return { ok: false, errors: ['digest payload_json must be a JSON object when present'] };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, errors: ['digest payload_json must decode to an object'] };
    }
    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, errors: ['digest payload_json must be valid JSON'] };
  }
}

function cloneDigest(digest: NextOpenDigestReadModel): NextOpenDigestReadModel {
  return {
    available: digest.available,
    noteId: digest.noteId,
    ...(digest.triggerReason === undefined ? {} : { triggerReason: digest.triggerReason }),
    ...(digest.preparedAt === undefined ? {} : { preparedAt: digest.preparedAt }),
    ...(digest.recoveredJobCount === undefined ? {} : { recoveredJobCount: digest.recoveredJobCount }),
    ...(digest.sections === undefined ? {} : { sections: cloneUnknown(digest.sections) }),
    ...(digest.items === undefined ? {} : { items: cloneUnknown(digest.items) }),
  };
}

function cloneUnknown<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function readString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return undefined;
  }

  return value;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value;
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

function toReadErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `${prefix}: ${error.trim()}`;
  }

  return prefix;
}
