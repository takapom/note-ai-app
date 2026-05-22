// Live product semantics for the app-specific Note / Section / Block model.
// Authority: docs/contracts/app-note-model.md
// Companion: docs/contracts/data-model.md


export const blockOrigins = ['user', 'ai', 'user_modified_ai', 'system'] as const;
export type BlockOrigin = (typeof blockOrigins)[number];
export const userAuthoredBlockOrigin: Extract<BlockOrigin, 'user'> = 'user';

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

export interface NoteDocumentValidationResult {
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
