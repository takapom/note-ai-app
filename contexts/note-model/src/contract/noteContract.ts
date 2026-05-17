// Live product semantics for the app-specific Note / Section / Block model.
// Authority: docs/contracts/app-note-model.md
// Companion: docs/contracts/data-model.md

export const blockOrigins = ['user', 'ai', 'user_modified_ai', 'system'] as const;
export type BlockOrigin = (typeof blockOrigins)[number];

export const userBlockTypes = [
  'paragraph',
  'heading',
  'bullet_list_item',
  'numbered_list_item',
  'todo',
  'quote',
  'code',
  'divider',
] as const;
export type UserBlockType = (typeof userBlockTypes)[number];

export const aiBlockTypes = [
  'ai_summary',
  'ai_question',
  'ai_decision',
  'ai_related_context',
  'ai_memory_candidate',
] as const;
export type AiBlockType = (typeof aiBlockTypes)[number];

export type BlockType = UserBlockType | AiBlockType;

export const headingLevels = [1, 2, 3] as const;
export type HeadingLevel = (typeof headingLevels)[number];

export type InlineSpanKind = 'text' | 'strong' | 'emphasis' | 'code' | 'link';

export interface InlineSpanContract {
  kind: InlineSpanKind;
  text: string;
  href?: string;
}

export type AnnotationKind = 'source_span' | 'provenance' | 'comment';

export interface AnnotationContract {
  kind: AnnotationKind;
  sourceBlockId?: string;
  startOffset?: number;
  endOffset?: number;
  reason?: string;
}

export interface TextBlockContentContract {
  text: string;
  spans?: InlineSpanContract[];
  annotations?: AnnotationContract[];
}

export interface HeadingBlockContentContract extends TextBlockContentContract {
  level: HeadingLevel;
}

export interface TodoBlockContentContract extends TextBlockContentContract {
  checked: boolean;
}

export interface DividerBlockContentContract {
  variant?: 'line';
}

export type BlockContentContract =
  | TextBlockContentContract
  | HeadingBlockContentContract
  | TodoBlockContentContract
  | DividerBlockContentContract;

export interface NoteContract {
  id: string;
  workspaceId: string;
  title: string;
  descriptionUser?: string;
  descriptionAi?: string;
  descriptionAiApproved?: boolean;
  descriptionEffective?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SectionContract {
  id: string;
  noteId: string;
  parentSectionId?: string;
  headingBlockId?: string;
  headingLevel?: HeadingLevel;
  title?: string;
  descriptionAi?: string;
  contentHash: string;
  lastStructuredHash?: string;
  lastStructuredAt?: number;
  isDirty: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface BlockContract {
  id: string;
  noteId: string;
  sectionId?: string;
  parentBlockId?: string;
  type: BlockType;
  contentJson: BlockContentContract;
  plainText: string;
  position: number;
  origin: BlockOrigin;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface StableChunkContract {
  id: string;
  noteId: string;
  sourceBlockIds: string[];
  contentHash: string;
  position: number;
}

export interface NoteDocumentContract {
  note: NoteContract;
  sections: SectionContract[];
  blocks: BlockContract[];
  implicitChunks?: StableChunkContract[];
}

export interface BlockValidationResult {
  valid: boolean;
  errors: string[];
}

export interface NoteCardInput {
  title: string;
  descriptionUser?: string;
  descriptionAi?: string;
  descriptionAiApproved?: boolean;
}

export interface OutlineItemContract {
  sectionId: string;
  title: string;
  level: HeadingLevel;
}

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
  return block.origin === 'user' || block.origin === 'system';
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

  return { valid: errors.length === 0, errors };
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
