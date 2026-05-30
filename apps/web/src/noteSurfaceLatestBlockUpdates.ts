export interface NoteLeaveLatestBlockUpdateInput {
  blockId: string;
  content: string;
}

export function readLatestBlockUpdates(
  input: object,
  errors: string[],
): NoteLeaveLatestBlockUpdateInput[] | undefined {
  const value = (input as Record<string, unknown>).latestBlockUpdates;
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push('latestBlockUpdates must be an array');
    return undefined;
  }

  const updates: NoteLeaveLatestBlockUpdateInput[] = [];
  const seenBlockIds = new Set<string>();
  value.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`latestBlockUpdates[${index}] must be an object`);
      return;
    }

    const source = entry as Record<string, unknown>;
    const blockId = getStringField(source, 'blockId');
    const content = getStringField(source, 'content');
    validatePathSegment(`latestBlockUpdates[${index}].blockId`, blockId, errors);
    validateBlockUpdateContent(content, errors);

    if (blockId !== undefined && seenBlockIds.has(blockId)) {
      errors.push(`latestBlockUpdates[${index}].blockId must be unique`);
    }
    if (blockId !== undefined) {
      seenBlockIds.add(blockId);
    }
    if (blockId !== undefined && content !== undefined) {
      updates.push({ blockId, content });
    }
  });

  return updates;
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

function validateBlockUpdateContent(value: string | undefined, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push('content is required');
  }
}

function getStringField(input: object, fieldName: string): string | undefined {
  const value = (input as Record<string, unknown>)[fieldName];
  return typeof value === 'string' ? value : undefined;
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
