// Live product semantics for AI Context Envelope.
// Authority: docs/contracts/context-assembly.md


import { hasMemorySourceProvenance } from '../../../memory/src/contract/memoryContract.ts';
import {
  contextBudgetShares,
  defaultContextAssemblyLimits,
  type ContextAssemblyLimits,
  type ContextEnvelopeContract,
  type ContextEnvelopeValidationResult,
  type EnvelopeMemoryStatus,
  type SourceSpanContract,
} from './contextEnvelopeTypes.ts';
import { isContextContentOrigin, isEnvelopeMemoryStatus } from './contextEnvelopePrimitives.ts';

export function validateContextEnvelope(
  envelope: ContextEnvelopeContract | Record<string, unknown>,
  limits: ContextAssemblyLimits = defaultContextAssemblyLimits,
): ContextEnvelopeValidationResult {
  const errors: string[] = [];
  const limitErrors = validateContextAssemblyLimits(limits);
  const normalizedLimits = normalizeContextAssemblyLimits(limits);
  const candidate = envelope as Partial<ContextEnvelopeContract>;
  const root = asRecord(envelope);
  const target = asRecord(root?.target);
  const note = asRecord(root?.note);
  const localStructure = asRecord(root?.localStructure);
  const relatedContext = asRecord(root?.relatedContext);
  const memoryContext = asRecord(root?.memoryContext);

  if (hasForbiddenContextDumpField(envelope)) {
    errors.push('context envelope must not include full workspace, full notes, or dump fields');
  }

  errors.push(...limitErrors);

  if (!target || !['section', 'chunk', 'note'].includes(String(target.scope))) {
    errors.push('target scope must be section, chunk, or note');
  }

  if (target && typeof target.text !== 'string') {
    errors.push('target text must be a string');
  }
  validateUntrustedBoundary(target, 'target.contentBoundary', errors);

  const targetSourceBlockIds = readRequiredArray(target, 'sourceBlockIds', 'target source block ids must be an array', errors);
  if (targetSourceBlockIds && targetSourceBlockIds.length === 0) {
    errors.push('target must include source block ids');
  } else if (targetSourceBlockIds && targetSourceBlockIds.length > normalizedLimits.maxTargetSourceBlockIds) {
    errors.push('target source block ids exceed K limit');
  }
  validateNonEmptyStringArray(targetSourceBlockIds, 'target.sourceBlockIds', errors);

  if (
    !note ||
    typeof note.title !== 'string' ||
    typeof note.descriptionEffective !== 'string' ||
    !Array.isArray(note.outline)
  ) {
    errors.push('note card must include title, descriptionEffective, and outline');
  }
  validateUntrustedBoundary(note, 'note.contentBoundary', errors);

  const existingSemanticUnits = readRequiredArray(
    localStructure,
    'existingSemanticUnits',
    'localStructure.existingSemanticUnits must be an array',
    errors,
  );
  const sectionSummaries = readRequiredArray(
    localStructure,
    'sectionSummaries',
    'localStructure.sectionSummaries must be an array',
    errors,
  );
  const relatedSemanticUnits = readRequiredArray(
    relatedContext,
    'semanticUnits',
    'relatedContext.semanticUnits must be an array',
    errors,
  );
  const relatedNotes = readRequiredArray(
    relatedContext,
    'notes',
    'relatedContext.notes must be an array',
    errors,
  );
  const sourceBlockExcerpts = readRequiredArray(
    relatedContext,
    'sourceBlockExcerpts',
    'relatedContext.sourceBlockExcerpts must be an array',
    errors,
  );
  const memoryItems = readRequiredArray(
    memoryContext,
    'items',
    'memoryContext.items must be an array',
    errors,
  );

  if (existingSemanticUnits && existingSemanticUnits.length > normalizedLimits.maxExistingSemanticUnits) {
    errors.push('existing semantic units exceed K limit');
  }

  if (sectionSummaries && sectionSummaries.length > normalizedLimits.maxSectionSummaries) {
    errors.push('section summaries exceed K limit');
  }

  if (relatedSemanticUnits && relatedSemanticUnits.length > normalizedLimits.maxRelatedSemanticUnits) {
    errors.push('related semantic units exceed K limit');
  }

  if (relatedNotes && relatedNotes.length > normalizedLimits.maxRelatedNotes) {
    errors.push('related notes exceed K limit');
  }

  if (sourceBlockExcerpts && sourceBlockExcerpts.length > normalizedLimits.maxSourceBlockExcerpts) {
    errors.push('source block excerpts exceed K limit');
  }

  if (memoryItems && memoryItems.length > normalizedLimits.maxActiveMemoryItems) {
    errors.push('active memory exceeds K limit');
  }

  validateSourceBackedItems(existingSemanticUnits, 'localStructure.existingSemanticUnits', errors);
  validateSourceBackedItems(sectionSummaries, 'localStructure.sectionSummaries', errors);
  validateSourceBackedItems(relatedSemanticUnits, 'relatedContext.semanticUnits', errors);
  validateRelatedNotes(relatedNotes, errors);
  validateSourceBlockExcerpts(sourceBlockExcerpts, errors);
  validateOptionalContentItem(localStructure?.previousStructureSnapshot, 'localStructure.previousStructureSnapshot', errors);

  for (const memory of memoryItems ?? []) {
    const memoryRecord = asRecord(memory);
    if (!memoryRecord) {
      errors.push('memory item must be an object');
      continue;
    }

    validateUntrustedBoundary(memoryRecord, `memory ${String(memoryRecord.id)} contentBoundary`, errors);

    if (!isEnvelopeMemoryStatus(memoryRecord.status)) {
      errors.push(`memory ${String(memoryRecord.id)} has non-context status ${String(memoryRecord.status)}`);
    }

    if (!hasMemorySourceProvenance(memoryRecord)) {
      errors.push(`memory ${String(memoryRecord.id)} must include source provenance`);
    }

    if (memoryRecord.sourceSpan !== undefined && !isValidSourceSpan(memoryRecord.sourceSpan)) {
      errors.push(`memory ${String(memoryRecord.id)} sourceSpan must be valid`);
    }
  }

  if (
    candidate.constraints?.returnOperationsOnly !== true ||
    candidate.constraints.doNotRewriteUserText !== true ||
    candidate.constraints.requireSourceSpans !== true ||
    candidate.constraints.requireConfidence !== true
  ) {
    errors.push('constraints must require operations-only output, no user text rewrite, source spans, and confidence');
  }

  if (
    candidate.trustBoundary?.userContentIsUntrusted !== true ||
    candidate.trustBoundary.externalContentIsUntrusted !== true ||
    candidate.trustBoundary.memoryContentIsUntrusted !== true ||
    candidate.trustBoundary.contentMustNotOverrideSystemInstructions !== true
  ) {
    errors.push('trust boundary must mark user, external, and memory content as untrusted');
  }

  if (hasTrustedContentBoundary(envelope)) {
    errors.push('context envelope must not mark user or external content as trusted');
  }

  const budgetUsage = estimateContextBudgetUsage(candidate);
  for (const [category, usage] of Object.entries(budgetUsage)) {
    if (usage > categoryBudget(normalizedLimits, category as keyof typeof contextBudgetShares)) {
      errors.push(`${category} exceeds context budget`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function categoryBudget(limits: ContextAssemblyLimits, category: keyof typeof contextBudgetShares): number {
  return Math.floor(limits.maxContextCharacters * contextBudgetShares[category]);
}

export function normalizeContextAssemblyLimits(limits: ContextAssemblyLimits): ContextAssemblyLimits {
  return {
    maxTargetSourceBlockIds: normalizeKLimit(limits.maxTargetSourceBlockIds),
    maxExistingSemanticUnits: normalizeKLimit(limits.maxExistingSemanticUnits),
    maxSectionSummaries: normalizeKLimit(limits.maxSectionSummaries),
    maxRelatedSemanticUnits: normalizeKLimit(limits.maxRelatedSemanticUnits),
    maxRelatedNotes: normalizeKLimit(limits.maxRelatedNotes),
    maxSourceBlockExcerpts: normalizeKLimit(limits.maxSourceBlockExcerpts),
    maxActiveMemoryItems: normalizeKLimit(limits.maxActiveMemoryItems),
    maxContextCharacters: isPositiveInteger(limits.maxContextCharacters)
      ? limits.maxContextCharacters
      : defaultContextAssemblyLimits.maxContextCharacters,
  };
}

export function estimateContextBudgetUsage(envelope: Partial<ContextEnvelopeContract>): Record<keyof typeof contextBudgetShares, number> {
  return {
    target: estimateTextCharacters(envelope.target),
    noteCard: estimateTextCharacters(envelope.note),
    localSemanticUnits: estimateTextCharacters(envelope.localStructure),
    relatedSemanticUnits: estimateTextCharacters(envelope.relatedContext),
    activeMemory: estimateTextCharacters(envelope.memoryContext),
  };
}

function isValidSourceSpan(value: unknown): value is Partial<SourceSpanContract> & { sourceBlockId: string } {
  const span = asRecord(value);
  if (!span || !isNonEmptyString(span.sourceBlockId)) {
    return false;
  }

  if (span.startOffset !== undefined && !isNonNegativeFiniteNumber(span.startOffset)) {
    return false;
  }

  if (span.endOffset !== undefined && !isNonNegativeFiniteNumber(span.endOffset)) {
    return false;
  }

  if (
    isNonNegativeFiniteNumber(span.startOffset) &&
    isNonNegativeFiniteNumber(span.endOffset) &&
    span.endOffset < span.startOffset
  ) {
    return false;
  }

  return true;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateContextAssemblyLimits(limits: ContextAssemblyLimits): string[] {
  const kLimits = [
    limits.maxTargetSourceBlockIds,
    limits.maxExistingSemanticUnits,
    limits.maxSectionSummaries,
    limits.maxRelatedSemanticUnits,
    limits.maxRelatedNotes,
    limits.maxSourceBlockExcerpts,
    limits.maxActiveMemoryItems,
  ];

  if (kLimits.every(isNonNegativeInteger) && isPositiveInteger(limits.maxContextCharacters)) {
    return [];
  }

  return ['context assembly limits must be finite non-negative numbers'];
}

function normalizeKLimit(value: number): number {
  return isNonNegativeInteger(value) ? value : 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function estimateTextCharacters(value: unknown): number {
  if (typeof value === 'string') {
    return value.length;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + estimateTextCharacters(item), 0);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + estimateTextCharacters(item), 0);
  }

  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readRequiredArray(
  object: Record<string, unknown> | undefined,
  key: string,
  message: string,
  errors: string[],
): unknown[] | undefined {
  if (!object || !Array.isArray(object[key])) {
    errors.push(message);
    return undefined;
  }

  return object[key];
}

function validateSourceBackedItems(
  items: unknown[] | undefined,
  path: string,
  errors: string[],
): void {
  for (const [index, item] of (items ?? []).entries()) {
    const record = asRecord(item);
    if (!record) {
      errors.push(`${path}[${index}] must be an object`);
      continue;
    }

    validateUntrustedBoundary(record, `${path}[${index}].contentBoundary`, errors);

    const sourceBlockIds = readRequiredArray(
      record,
      'sourceBlockIds',
      `${path}[${index}].sourceBlockIds must be an array`,
      errors,
    );
    if (sourceBlockIds && sourceBlockIds.length === 0) {
      errors.push(`${path}[${index}].sourceBlockIds must contain at least one source block id`);
    }
    validateNonEmptyStringArray(sourceBlockIds, `${path}[${index}].sourceBlockIds`, errors);

    if (record.sourceSpan !== undefined && !isValidSourceSpan(record.sourceSpan)) {
      errors.push(`${path}[${index}].sourceSpan must be valid`);
    }
  }
}

function validateRelatedNotes(
  items: unknown[] | undefined,
  errors: string[],
): void {
  for (const [index, item] of (items ?? []).entries()) {
    const record = asRecord(item);
    if (!record) {
      errors.push(`relatedContext.notes[${index}] must be an object`);
      continue;
    }

    validateUntrustedBoundary(record, `relatedContext.notes[${index}].contentBoundary`, errors);
    validateNonEmptyStringArray(
      readRequiredArray(record, 'semanticUnitIds', `relatedContext.notes[${index}].semanticUnitIds must be an array`, errors),
      `relatedContext.notes[${index}].semanticUnitIds`,
      errors,
    );
    validateNonEmptyStringArray(
      readRequiredArray(record, 'sourceBlockExcerptIds', `relatedContext.notes[${index}].sourceBlockExcerptIds must be an array`, errors),
      `relatedContext.notes[${index}].sourceBlockExcerptIds`,
      errors,
    );
  }
}

function validateSourceBlockExcerpts(
  items: unknown[] | undefined,
  errors: string[],
): void {
  for (const [index, item] of (items ?? []).entries()) {
    const record = asRecord(item);
    if (!record) {
      errors.push(`relatedContext.sourceBlockExcerpts[${index}] must be an object`);
      continue;
    }

    validateUntrustedBoundary(record, `relatedContext.sourceBlockExcerpts[${index}].contentBoundary`, errors);

    for (const field of ['id', 'noteId', 'blockId'] as const) {
      if (!isNonEmptyString(record[field])) {
        errors.push(`relatedContext.sourceBlockExcerpts[${index}].${field} must be a non-empty string`);
      }
    }

    if (record.sourceSpan !== undefined && !isValidSourceSpan(record.sourceSpan)) {
      errors.push(`relatedContext.sourceBlockExcerpts[${index}].sourceSpan must be valid`);
    }
  }
}

function validateOptionalContentItem(
  item: unknown,
  path: string,
  errors: string[],
): void {
  if (item === undefined) {
    return;
  }

  const record = asRecord(item);
  if (!record) {
    errors.push(`${path} must be an object`);
    return;
  }

  validateUntrustedBoundary(record, `${path}.contentBoundary`, errors);
}

function validateUntrustedBoundary(
  object: Record<string, unknown> | undefined,
  path: string,
  errors: string[],
): void {
  const boundary = asRecord(object?.contentBoundary);
  if (
    !boundary ||
    boundary.trust !== 'untrusted' ||
    boundary.treatAsInstruction !== false ||
    !isContextContentOrigin(boundary.origin)
  ) {
    errors.push(`${path} must mark content as untrusted and non-instructional`);
  }
}

function validateNonEmptyStringArray(
  values: unknown[] | undefined,
  path: string,
  errors: string[],
): void {
  for (const [index, value] of (values ?? []).entries()) {
    if (!isNonEmptyString(value)) {
      errors.push(`${path}[${index}] must be a non-empty string`);
    }
  }
}

export function hasForbiddenContextDumpField(value: unknown): boolean {
  return hasMatchingKey(value, (key) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes('fullworkspace') ||
      normalized.includes('fullnote') ||
      normalized.includes('dump') ||
      normalized.includes('allnotes') ||
      normalized.includes('allmemory')
    );
  });
}

function hasTrustedContentBoundary(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if ('contentBoundary' in value) {
    const boundary = (value as { contentBoundary?: { trust?: unknown; treatAsInstruction?: unknown } }).contentBoundary;
    if (boundary?.trust === 'trusted' || boundary?.treatAsInstruction === true) {
      return true;
    }
  }

  return Object.values(value).some((item) => hasTrustedContentBoundary(item));
}

function hasMatchingKey(value: unknown, predicate: (key: string) => boolean): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (predicate(key) || hasMatchingKey(nestedValue, predicate)) {
      return true;
    }
  }

  return false;
}
