// Read-only source lookup boundary for Provenance Popover.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/frontend-ui.md, docs/contracts/operation-return-contract.md

export const provenanceExcerptMaxChars = 240;
const provenanceExcerptContextChars = 48;

export interface ProvenanceSourceSpanReference {
  sourceSpanId: string;
  sourceBlockId: string;
  startOffset: number;
  endOffset: number;
}

export interface ProvenanceLookupInput extends ProvenanceSourceSpanReference {
  workspaceId: string;
}

export interface ProvenanceSourceMetadata {
  sourceSpanId: string;
  sourceBlockId: string;
  reason?: string;
  noteId: string;
  sectionId?: string;
  startOffset: number;
  endOffset: number;
  excerptStartOffset: number;
  excerptEndOffset: number;
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

export interface ProvenanceLookupReadModel {
  available: boolean;
  sourceSpanId: string;
  sourceBlockId: string;
  excerpt?: string;
  source?: ProvenanceSourceMetadata;
}

export interface ProvenanceLookupResult {
  ok: boolean;
  errors: string[];
  body?: ProvenanceLookupReadModel;
}

export interface ProvenanceLookupPort {
  lookupSource(input: ProvenanceLookupInput): Promise<ProvenanceLookupResult>;
}

export interface ProvenanceLookupSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ProvenanceLookupSqlExecutor {
  query(statement: ProvenanceLookupSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

export interface InMemoryProvenanceSourceBlock {
  workspaceId: string;
  noteId: string;
  sectionId?: string;
  blockId: string;
  plainText: string;
  origin?: string;
}

export class InMemoryProvenanceLookupPort implements ProvenanceLookupPort {
  private readonly sources = new Map<string, InMemoryProvenanceSourceBlock>();

  constructor(initialSources: readonly InMemoryProvenanceSourceBlock[] = []) {
    for (const source of initialSources) {
      const errors = validateStoredSource(source);
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }
      this.sources.set(sourceKey(source.workspaceId, source.blockId), cloneSource(source));
    }
  }

  async lookupSource(input: ProvenanceLookupInput): Promise<ProvenanceLookupResult> {
    const errors = validateProvenanceLookupInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const source = this.sources.get(sourceKey(input.workspaceId, input.sourceBlockId));
    if (source === undefined) {
      return {
        ok: true,
        errors: [],
        body: unavailableSource(input),
      };
    }

    return mapProvenanceSourceRowsToLookupResult([{
      workspace_id: source.workspaceId,
      source_span_id: input.sourceSpanId,
      source_block_id: source.blockId,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      note_id: source.noteId,
      section_id: source.sectionId,
      block_id: source.blockId,
      plain_text: source.plainText,
      origin: source.origin ?? 'user',
    }], input);
  }
}

export class TursoProvenanceLookupSqlAdapter implements ProvenanceLookupPort {
  private readonly executor: ProvenanceLookupSqlExecutor;

  constructor(input: { executor: ProvenanceLookupSqlExecutor }) {
    this.executor = input.executor;
  }

  async lookupSource(input: ProvenanceLookupInput): Promise<ProvenanceLookupResult> {
    const errors = validateProvenanceLookupInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      const rows = await this.executor.query(mapProvenanceSourceLookupToSql(input));
      return mapProvenanceSourceRowsToLookupResult(rows, input);
    } catch (error) {
      return {
        ok: false,
        errors: [toLookupErrorMessage('provenance source lookup failed', error)],
      };
    }
  }
}

export function mapProvenanceSourceLookupToSql(
  input: ProvenanceLookupInput,
): ProvenanceLookupSqlStatement {
  const errors = validateProvenanceLookupInput(input);
  if (errors.length > 0) {
    return { sql: '', args: [] };
  }

  return {
    sql: [
      'select ai_operations.workspace_id, source_spans.target_id as source_span_id, source_spans.source_block_id, source_spans.start_offset, source_spans.end_offset, source_spans.reason, blocks.note_id, blocks.section_id, blocks.id as block_id, blocks.plain_text, blocks.origin',
      'from source_spans',
      'inner join ai_operations on ai_operations.id = source_spans.target_id and source_spans.target_type = ?',
      'inner join blocks on blocks.id = source_spans.source_block_id',
      'inner join notes on notes.id = blocks.note_id and notes.workspace_id = ai_operations.workspace_id',
      'where ai_operations.workspace_id = ? and source_spans.target_id = ? and source_spans.source_block_id = ? and source_spans.start_offset = ? and source_spans.end_offset = ? and blocks.origin = ?',
      'limit 2',
    ].join(' '),
    args: [
      'operation',
      input.workspaceId,
      input.sourceSpanId,
      input.sourceBlockId,
      input.startOffset,
      input.endOffset,
      'user',
    ],
  };
}

export function mapProvenanceSourceRowsToLookupResult(
  rows: readonly Record<string, unknown>[],
  input: ProvenanceLookupInput,
): ProvenanceLookupResult {
  const inputErrors = validateProvenanceLookupInput(input);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }

  if (rows.length === 0) {
    return {
      ok: true,
      errors: [],
      body: unavailableSource(input),
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      errors: [`source span ${input.sourceSpanId} matched multiple source rows`],
    };
  }

  const row = rows[0];
  const workspaceId = readRequiredStringColumn(row, 'workspace_id', 'workspaceId');
  const sourceSpanId = readRequiredStringColumn(row, 'source_span_id', 'sourceSpanId', 'target_id');
  const sourceBlockId = readRequiredStringColumn(row, 'source_block_id', 'sourceBlockId');
  const sourceStartOffset = readRequiredIntegerColumn(row, 'start_offset', 'startOffset');
  const sourceEndOffset = readRequiredIntegerColumn(row, 'end_offset', 'endOffset');
  const reason = readOptionalStringColumn(row, 'reason');
  const noteId = readRequiredStringColumn(row, 'note_id', 'noteId');
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const blockId = readRequiredStringColumn(row, 'block_id', 'blockId', 'id');
  const plainText = readRequiredTextColumn(row, 'plain_text', 'plainText');
  const origin = readRequiredStringColumn(row, 'origin');

  const errors: string[] = [];
  if (workspaceId === undefined) {
    errors.push('source row workspace_id must be a non-empty string');
  } else if (workspaceId !== input.workspaceId) {
    errors.push('source row workspace_id must match requested workspaceId');
  }
  if (sourceSpanId === undefined) {
    errors.push('source row source_span_id must be a non-empty string');
  } else if (sourceSpanId !== input.sourceSpanId) {
    errors.push('source row source_span_id must match requested sourceSpanId');
  }
  if (sourceBlockId === undefined) {
    errors.push('source row source_block_id must be a non-empty string');
  } else if (sourceBlockId !== input.sourceBlockId) {
    errors.push('source row source_block_id must match requested sourceBlockId');
  }
  if (sourceStartOffset === undefined) {
    errors.push('source row start_offset must be a non-negative finite integer');
  } else if (sourceStartOffset !== input.startOffset) {
    errors.push('source row start_offset must match requested startOffset');
  }
  if (sourceEndOffset === undefined) {
    errors.push('source row end_offset must be a non-negative finite integer');
  } else if (sourceEndOffset !== input.endOffset) {
    errors.push('source row end_offset must match requested endOffset');
  }
  if (reason === null) errors.push('source row reason must be a non-empty string when provided');
  if (noteId === undefined) errors.push('source row note_id must be a non-empty string');
  if (sectionId === null) errors.push('source row section_id must be a non-empty string when provided');
  if (blockId === undefined) {
    errors.push('source row block_id must be a non-empty string');
  } else if (blockId !== input.sourceBlockId) {
    errors.push('source row block_id must match requested sourceBlockId');
  }
  if (plainText === undefined) errors.push('source row plain_text must be a string');
  if (origin === undefined) {
    errors.push('source row origin must be user');
  } else if (origin !== 'user') {
    errors.push('source row origin must be user');
  }
  if (typeof plainText === 'string' && input.endOffset > plainText.length) {
    errors.push('source span endOffset must not exceed source text length');
  }

  if (
    errors.length > 0 ||
    noteId === undefined ||
    sourceSpanId === undefined ||
    sourceBlockId === undefined ||
    sourceStartOffset === undefined ||
    sourceEndOffset === undefined ||
    blockId === undefined ||
    plainText === undefined ||
    sectionId === null ||
    reason === null
  ) {
    return { ok: false, errors };
  }

  const excerpt = buildBoundedExcerpt(plainText, input.startOffset, input.endOffset);
  return {
    ok: true,
    errors: [],
    body: {
      available: true,
      sourceSpanId: input.sourceSpanId,
      sourceBlockId: input.sourceBlockId,
      excerpt: excerpt.text,
      source: {
        sourceSpanId: input.sourceSpanId,
        sourceBlockId: input.sourceBlockId,
        ...(reason === undefined ? {} : { reason }),
        noteId,
        ...(typeof sectionId === 'string' ? { sectionId } : {}),
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        excerptStartOffset: excerpt.startOffset,
        excerptEndOffset: excerpt.endOffset,
        truncatedBefore: excerpt.startOffset > 0,
        truncatedAfter: excerpt.endOffset < plainText.length,
      },
    },
  };
}

export function validateProvenanceLookupInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['provenance lookup input must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.sourceSpanId)) {
    errors.push('sourceSpanId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.sourceBlockId)) {
    errors.push('sourceBlockId must be a stable non-sentinel runtime id');
  }
  if (!isNonNegativeInteger(input.startOffset)) {
    errors.push('startOffset must be a non-negative finite integer');
  }
  if (!isNonNegativeInteger(input.endOffset)) {
    errors.push('endOffset must be a non-negative finite integer');
  }
  if (
    typeof input.startOffset === 'number' &&
    Number.isFinite(input.startOffset) &&
    typeof input.endOffset === 'number' &&
    Number.isFinite(input.endOffset) &&
    input.endOffset < input.startOffset
  ) {
    errors.push('endOffset must be greater than or equal to startOffset');
  }

  return errors;
}

function validateStoredSource(source: unknown): string[] {
  if (!isRecord(source)) {
    return ['source must be an object'];
  }

  const errors: string[] = [];
  if (!isStableRuntimeId(source.workspaceId)) {
    errors.push('source.workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(source.noteId)) {
    errors.push('source.noteId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(source.blockId)) {
    errors.push('source.blockId must be a stable non-sentinel runtime id');
  }
  if (source.sectionId !== undefined && !isStableRuntimeId(source.sectionId)) {
    errors.push('source.sectionId must be a stable non-sentinel runtime id when provided');
  }
  if (typeof source.plainText !== 'string') {
    errors.push('source.plainText must be a string');
  }
  if (source.origin !== undefined && source.origin !== 'user') {
    errors.push('source.origin must be user when provided');
  }

  return errors;
}

function buildBoundedExcerpt(
  text: string,
  startOffset: number,
  endOffset: number,
): { text: string; startOffset: number; endOffset: number } {
  const spanLength = endOffset - startOffset;
  let excerptStart = Math.max(0, startOffset - provenanceExcerptContextChars);
  let excerptEnd = Math.min(text.length, endOffset + provenanceExcerptContextChars);

  if (excerptEnd - excerptStart > provenanceExcerptMaxChars) {
    if (spanLength >= provenanceExcerptMaxChars) {
      excerptStart = startOffset;
      excerptEnd = Math.min(text.length, startOffset + provenanceExcerptMaxChars);
    } else {
      const sideContext = Math.floor((provenanceExcerptMaxChars - spanLength) / 2);
      excerptStart = Math.max(0, startOffset - sideContext);
      excerptEnd = Math.min(text.length, excerptStart + provenanceExcerptMaxChars);
      excerptStart = Math.max(0, excerptEnd - provenanceExcerptMaxChars);
    }
  }

  return {
    text: text.slice(excerptStart, excerptEnd),
    startOffset: excerptStart,
    endOffset: excerptEnd,
  };
}

function unavailableSource(input: ProvenanceSourceSpanReference): ProvenanceLookupReadModel {
  return {
    available: false,
    sourceSpanId: input.sourceSpanId,
    sourceBlockId: input.sourceBlockId,
  };
}

function sourceKey(workspaceId: string, blockId: string): string {
  return `${workspaceId}:${blockId}`;
}

function cloneSource(source: InMemoryProvenanceSourceBlock): InMemoryProvenanceSourceBlock {
  return {
    workspaceId: source.workspaceId,
    noteId: source.noteId,
    ...(source.sectionId === undefined ? {} : { sectionId: source.sectionId }),
    blockId: source.blockId,
    plainText: source.plainText,
    ...(source.origin === undefined ? {} : { origin: source.origin }),
  };
}

function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
  secondFallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn]
    ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn])
    ?? (secondFallbackColumn === undefined ? undefined : row[secondFallbackColumn]);
  return isTrimmedNonEmptyString(value) ? value : undefined;
}

function readOptionalStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return isTrimmedNonEmptyString(value) ? value : null;
}

function readRequiredTextColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'string' ? value : undefined;
}

function readRequiredIntegerColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return isNonNegativeInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function toLookupErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `${prefix}: ${error.trim()}`;
  }

  return prefix;
}
