// Live product semantics for the app-specific Note / Section / Block model.
// Authority: docs/contracts/app-note-model.md
// Companion: docs/contracts/data-model.md

import {
  aiBlockTypes,
  blockOrigins,
  headingLevels,
  userAuthoredBlockOrigin,
  userBlockTypes,
  type AiBlockType,
  type AnnotationKind,
  type BlockContract,
  type BlockOrigin,
  type BlockType,
  type BlockValidationResult,
  type HeadingBlockContentContract,
  type HeadingLevel,
  type NoteCardInput,
  type NoteDocumentValidationResult,
  type OutlineItemContract,
  type StableChunkContract,
  type UserBlockType,
} from './noteTypes.ts';


export function isUserBlockType(type: BlockType): type is UserBlockType {
  return (userBlockTypes as readonly string[]).includes(type);
}

export function isAiBlockType(type: BlockType): type is AiBlockType {
  return (aiBlockTypes as readonly string[]).includes(type);
}

export function blockOriginMatchesType(block: Pick<BlockContract, 'type' | 'origin'>): boolean {
  if (isAiBlockType(block.type)) {
    return block.origin === 'ai' || block.origin === 'user_modified_ai';
  }
  return block.origin === userAuthoredBlockOrigin || block.origin === 'system';
}

export function isHeadingLevel(value: number): value is HeadingLevel {
  return (headingLevels as readonly number[]).includes(value);
}

export function isStructuralHeading(block: Pick<BlockContract, 'type' | 'contentJson'>): boolean {
  if (block.type !== 'heading') {
    return false;
  }

  const maybeHeading = block.contentJson as Partial<HeadingBlockContentContract>;
  return typeof maybeHeading.text === 'string' && typeof maybeHeading.level === 'number' && isHeadingLevel(maybeHeading.level);
}

export function validateBlockContract(block: unknown): BlockValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(block);

  if (!candidate) {
    return { valid: false, errors: ['block must be an object'] };
  }

  if (!isNonEmptyString(candidate.id)) {
    errors.push('block id must be a non-empty string');
  }

  if (!isNonEmptyString(candidate.noteId)) {
    errors.push('block noteId must be a non-empty string');
  }

  for (const field of ['sectionId', 'parentBlockId'] as const) {
    if (candidate[field] !== undefined && !isNonEmptyString(candidate[field])) {
      errors.push(`block ${field} must be a non-empty string when provided`);
    }
  }

  if (!isBlockType(candidate.type)) {
    errors.push(`block type must be one of ${[...userBlockTypes, ...aiBlockTypes].join(', ')}`);
  }

  if (!isBlockOrigin(candidate.origin)) {
    errors.push(`block origin must be one of ${blockOrigins.join(', ')}`);
  }

  if (
    isBlockType(candidate.type) &&
    isBlockOrigin(candidate.origin) &&
    !blockOriginMatchesType({ type: candidate.type, origin: candidate.origin })
  ) {
    errors.push('block origin must match block type');
  }

  const content = asRecord(candidate.contentJson);
  if (!content) {
    errors.push('block contentJson must be an object');
  } else if (candidate.type === 'heading') {
    if (!isNonEmptyString(content.text)) {
      errors.push('heading block content text must be a non-empty string');
    }
    if (typeof content.level !== 'number' || !isHeadingLevel(content.level)) {
      errors.push('heading block content level must be H1, H2, or H3');
    }
  } else if (candidate.type === 'todo') {
    if (!isNonEmptyString(content.text)) {
      errors.push('todo block content text must be a non-empty string');
    }
    if (typeof content.checked !== 'boolean') {
      errors.push('todo block content checked must be a boolean');
    }
  } else if (candidate.type === 'divider') {
    if (content.variant !== undefined && content.variant !== 'line') {
      errors.push('divider block content variant must be line when provided');
    }
  } else if (candidate.type !== undefined && candidate.type !== 'divider') {
    if (!isNonEmptyString(content.text)) {
      errors.push('text block content text must be a non-empty string');
    }
    if ('level' in content) {
      errors.push('non-heading block content must not carry a heading level');
    }
  }

  if (!isNonEmptyString(candidate.plainText) && candidate.type !== 'divider') {
    errors.push('block plainText must be a non-empty string except for divider blocks');
  }

  if (!isNonEmptyString(candidate.contentHash)) {
    errors.push('block contentHash must be a non-empty string');
  }

  if (typeof candidate.position !== 'number' || !Number.isFinite(candidate.position)) {
    errors.push('block position must be a finite number');
  }

  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) {
    errors.push('block createdAt must be a finite timestamp');
  }

  if (typeof candidate.updatedAt !== 'number' || !Number.isFinite(candidate.updatedAt)) {
    errors.push('block updatedAt must be a finite timestamp');
  }

  validateAnnotations(content, errors);

  return { valid: errors.length === 0, errors };
}

export function validateNoteDocumentContract(document: unknown): NoteDocumentValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(document);

  if (!candidate) {
    return { valid: false, errors: ['note document must be an object'] };
  }

  errors.push(...validateNoteContract(candidate.note).map((error) => `note.${error}`));
  const note = asRecord(candidate.note);
  const noteId = typeof note?.id === 'string' ? note.id : undefined;

  if (!Array.isArray(candidate.sections)) {
    errors.push('sections must be an array');
  } else {
    for (const [index, section] of candidate.sections.entries()) {
      errors.push(...validateSectionContract(section, noteId).map((error) => `sections[${index}].${error}`));
    }
    errors.push(...validateUniqueIds(candidate.sections, 'sections', 'section id'));
  }

  if (!Array.isArray(candidate.blocks)) {
    errors.push('blocks must be an array');
  } else {
    for (const [index, block] of candidate.blocks.entries()) {
      errors.push(...validateBlockContract(block).errors.map((error) => `blocks[${index}].${error}`));
      const record = asRecord(block);
      if (record && noteId && record.noteId !== noteId) {
        errors.push(`blocks[${index}].block noteId must match document note.id`);
      }
    }
    errors.push(...validateUniqueIds(candidate.blocks, 'blocks', 'block id'));
  }

  if (Array.isArray(candidate.sections) && Array.isArray(candidate.blocks)) {
    errors.push(...validateDocumentReferences(candidate.sections, candidate.blocks));
  }

  return { valid: errors.length === 0, errors };
}

export function validateNoteContract(note: unknown): string[] {
  const errors: string[] = [];
  const candidate = asRecord(note);

  if (!candidate) {
    return ['must be an object'];
  }

  for (const field of ['id', 'workspaceId', 'title'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of ['descriptionUser', 'descriptionAi', 'descriptionEffective'] as const) {
    if (candidate[field] !== undefined && !isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string when provided`);
    }
  }

  if (candidate.descriptionAiApproved !== undefined && typeof candidate.descriptionAiApproved !== 'boolean') {
    errors.push('descriptionAiApproved must be a boolean when provided');
  }

  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field])) {
      errors.push(`${field} must be a finite timestamp`);
    }
  }

  return errors;
}

export function validateSectionContract(section: unknown, expectedNoteId?: string): string[] {
  const errors: string[] = [];
  const candidate = asRecord(section);

  if (!candidate) {
    return ['must be an object'];
  }

  for (const field of ['id', 'noteId', 'contentHash'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(expectedNoteId) && candidate.noteId !== expectedNoteId) {
    errors.push('noteId must match document note.id');
  }

  for (const field of ['parentSectionId', 'headingBlockId', 'title', 'descriptionAi', 'lastStructuredHash'] as const) {
    if (candidate[field] !== undefined && !isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string when provided`);
    }
  }

  if (candidate.headingLevel !== undefined && (typeof candidate.headingLevel !== 'number' || !isHeadingLevel(candidate.headingLevel))) {
    errors.push('headingLevel must be H1, H2, or H3 when provided');
  }

  if (candidate.lastStructuredAt !== undefined && (typeof candidate.lastStructuredAt !== 'number' || !Number.isFinite(candidate.lastStructuredAt))) {
    errors.push('lastStructuredAt must be a finite timestamp when provided');
  }

  if (typeof candidate.isDirty !== 'boolean') {
    errors.push('isDirty must be a boolean');
  }
  if (typeof candidate.position !== 'number' || !Number.isFinite(candidate.position)) {
    errors.push('position must be a finite number');
  }
  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) {
    errors.push('createdAt must be a finite timestamp');
  }
  if (typeof candidate.updatedAt !== 'number' || !Number.isFinite(candidate.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  return errors;
}

export function resolveDescriptionEffective(input: NoteCardInput, outline: readonly OutlineItemContract[] = []): string {
  const user = normalizeOptionalText(input.descriptionUser);
  if (user) {
    return user;
  }

  const ai = normalizeOptionalText(input.descriptionAi);
  if (ai && input.descriptionAiApproved) {
    return ai;
  }

  if (ai) {
    return ai;
  }

  const title = normalizeOptionalText(input.title) ?? 'Untitled note';
  const outlineText = outline.map((item) => item.title).filter(Boolean).join(' / ');
  return outlineText ? `${title} - ${outlineText}` : title;
}

export function shouldUseImplicitSection(blocks: readonly BlockContract[]): boolean {
  return !blocks.some((block) => isStructuralHeading(block));
}

export function createImplicitStableChunk(noteId: string, blocks: readonly BlockContract[]): StableChunkContract {
  return {
    id: `${noteId}:implicit-chunk:0`,
    noteId,
    sourceBlockIds: blocks.map((block) => block.id),
    contentHash: blocks.map((block) => block.contentHash).join('|'),
    position: 0,
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' &&
    ([...userBlockTypes, ...aiBlockTypes] as readonly string[]).includes(value);
}

function isBlockOrigin(value: unknown): value is BlockOrigin {
  return typeof value === 'string' && (blockOrigins as readonly string[]).includes(value);
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

function validateAnnotations(content: Record<string, unknown> | undefined, errors: string[]): void {
  if (!content || content.annotations === undefined) {
    return;
  }

  if (!Array.isArray(content.annotations)) {
    errors.push('block content annotations must be an array when provided');
    return;
  }

  for (const [index, annotation] of content.annotations.entries()) {
    const record = asRecord(annotation);
    if (!record) {
      errors.push(`block content annotations[${index}] must be an object`);
      continue;
    }

    if (!isAnnotationKind(record.kind)) {
      errors.push(`block content annotations[${index}].kind must be source_span, provenance, or comment`);
      continue;
    }

    if (record.kind === 'source_span') {
      if (!isNonEmptyString(record.sourceBlockId)) {
        errors.push(`block content annotations[${index}].sourceBlockId must be a non-empty string`);
      }
      if (!isNonNegativeFiniteNumber(record.startOffset)) {
        errors.push(`block content annotations[${index}].startOffset must be non-negative`);
      }
      if (!isNonNegativeFiniteNumber(record.endOffset)) {
        errors.push(`block content annotations[${index}].endOffset must be non-negative`);
      }
      if (
        isNonNegativeFiniteNumber(record.startOffset) &&
        isNonNegativeFiniteNumber(record.endOffset) &&
        record.endOffset < record.startOffset
      ) {
        errors.push(`block content annotations[${index}].endOffset must be greater than or equal to startOffset`);
      }
    }
  }
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isAnnotationKind(value: unknown): value is AnnotationKind {
  return value === 'source_span' || value === 'provenance' || value === 'comment';
}

function validateUniqueIds(items: readonly unknown[], prefix: string, label: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    const id = asRecord(item)?.id;
    if (!isNonEmptyString(id)) {
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${prefix}[${index}].${label} must be unique`);
    }
    seen.add(id);
  }

  return errors;
}

function validateDocumentReferences(sections: readonly unknown[], blocks: readonly unknown[]): string[] {
  const errors: string[] = [];
  const sectionIds = new Set(
    sections
      .map((section) => asRecord(section)?.id)
      .filter((id): id is string => isNonEmptyString(id)),
  );
  const blockById = new Map<string, Record<string, unknown>>();

  for (const block of blocks) {
    const record = asRecord(block);
    if (record && isNonEmptyString(record.id)) {
      blockById.set(record.id, record);
    }
  }

  for (const [index, section] of sections.entries()) {
    const record = asRecord(section);
    if (!record) {
      continue;
    }
    if (typeof record.parentSectionId === 'string' && !sectionIds.has(record.parentSectionId)) {
      errors.push(`sections[${index}].parentSectionId must reference a document section`);
    }
    if (typeof record.headingBlockId === 'string') {
      const headingBlock = blockById.get(record.headingBlockId);
      if (!headingBlock) {
        errors.push(`sections[${index}].headingBlockId must reference a document block`);
      } else if (headingBlock.type !== 'heading') {
        errors.push(`sections[${index}].headingBlockId must reference a heading block`);
      } else if (isNonEmptyString(record.id) && headingBlock.sectionId !== record.id) {
        errors.push(`sections[${index}].headingBlockId must reference a block in the same section`);
      }
    }
  }

  for (const [index, block] of blocks.entries()) {
    const record = asRecord(block);
    if (!record) {
      continue;
    }
    if (typeof record.sectionId === 'string' && !sectionIds.has(record.sectionId)) {
      errors.push(`blocks[${index}].block sectionId must reference a document section`);
    }
    if (typeof record.parentBlockId === 'string' && !blockById.has(record.parentBlockId)) {
      errors.push(`blocks[${index}].parentBlockId must reference a document block`);
    }
  }

  return errors;
}
