// Live product semantics for memory items.
// Authority: docs/contracts/memory.md

export const memoryTypes = ['unresolved_question', 'past_decision', 'interest_theme'] as const;
export type MemoryType = (typeof memoryTypes)[number];

export const memoryStatuses = ['candidate', 'pending', 'active', 'pinned', 'rejected', 'archived'] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

export const memoryUserActions = ['remember', 'edit', 'different', 'delete', 'hold'] as const;
export type MemoryUserAction = (typeof memoryUserActions)[number];

export interface MemorySourceSpanContract {
  sourceBlockId: string;
  startOffset: number;
  endOffset: number;
}

export interface MemoryItemContract {
  id: string;
  workspaceId: string;
  userId: string;
  type: MemoryType;
  content: string;
  sourceUnitId?: string;
  sourceNoteId?: string;
  sourceSpan?: MemorySourceSpanContract;
  confidence: number;
  status: MemoryStatus;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMemoryItem(memory: unknown): MemoryValidationResult {
  const errors: string[] = [];
  const item = asRecord(memory);

  if (!item) {
    return { valid: false, errors: ['memory item must be an object'] };
  }

  for (const field of ['id', 'workspaceId', 'userId', 'content'] as const) {
    if (!isNonEmptyString(item[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (!isMemoryType(item.type)) {
    errors.push(`type must be one of ${memoryTypes.join(', ')}`);
  }

  if (!isMemoryStatus(item.status)) {
    errors.push(`status must be one of ${memoryStatuses.join(', ')}`);
  }

  if (typeof item.pinned !== 'boolean') {
    errors.push('pinned must be a boolean');
  }

  if (!isConfidence(item.confidence)) {
    errors.push('confidence must be a number between 0 and 1');
  }

  if (!isFiniteTimestamp(item.createdAt)) {
    errors.push('createdAt must be a finite timestamp');
  }

  if (!isFiniteTimestamp(item.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  if (!hasMemorySourceProvenance(item)) {
    errors.push('memory item must include source provenance');
  }

  if (item.sourceSpan !== undefined && !isValidMemorySourceSpan(item.sourceSpan)) {
    errors.push('sourceSpan must be valid');
  }

  return { valid: errors.length === 0, errors };
}

export function isContextEligibleMemory(memory: Pick<MemoryItemContract, 'status'> & {
  sourceUnitId?: unknown;
  sourceNoteId?: unknown;
  sourceSpan?: unknown;
}): memory is MemoryItemContract & { status: Extract<MemoryStatus, 'active' | 'pinned'> } {
  return (memory.status === 'active' || memory.status === 'pinned') && hasMemorySourceProvenance(memory);
}

export function transitionMemoryStatus(
  memory: MemoryItemContract,
  action: MemoryUserAction,
  now: number,
): MemoryItemContract {
  if (!isFiniteTimestamp(now)) {
    throw new Error('now must be a finite timestamp');
  }

  const validation = validateMemoryItem(memory);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  switch (action) {
    case 'remember':
      return { ...memory, status: memory.pinned ? 'pinned' : 'active', updatedAt: now };
    case 'edit':
      return { ...memory, status: 'pending', updatedAt: now };
    case 'different':
      return { ...memory, status: 'rejected', pinned: false, updatedAt: now };
    case 'delete':
      return { ...memory, status: 'archived', pinned: false, updatedAt: now };
    case 'hold':
      return { ...memory, status: 'pending', updatedAt: now };
  }
}

export function hasMemorySourceProvenance(memory: {
  sourceUnitId?: unknown;
  sourceNoteId?: unknown;
  sourceSpan?: unknown;
}): boolean {
  return isNonEmptyString(memory.sourceUnitId) ||
    isNonEmptyString(memory.sourceNoteId) ||
    isValidMemorySourceSpan(memory.sourceSpan);
}

export function isValidMemorySourceSpan(value: unknown): value is MemorySourceSpanContract {
  const span = asRecord(value);
  if (!span || !isNonEmptyString(span.sourceBlockId)) {
    return false;
  }

  if (!isNonNegativeFiniteNumber(span.startOffset) || !isNonNegativeFiniteNumber(span.endOffset)) {
    return false;
  }

  return span.endOffset >= span.startOffset;
}

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === 'string' && (memoryTypes as readonly string[]).includes(value);
}

export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return typeof value === 'string' && (memoryStatuses as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
