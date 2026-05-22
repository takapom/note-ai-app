// Live product semantics for AI Context Envelope.
// Authority: docs/contracts/context-assembly.md

import { resolveDescriptionEffective, type HeadingLevel, type NoteContract, type OutlineItemContract } from '../../../note-model/src/contract/noteContract.ts';
import {
  hasMemorySourceProvenance,
  isContextEligibleMemory,
  type MemoryItemContract,
  type MemoryStatus,
  type MemoryType,
} from '../../../memory/src/contract/memoryContract.ts';

export type TargetScopeKind = 'section' | 'chunk' | 'note';
export type ContentTrust = 'untrusted';
export type ContextContentOrigin = 'user' | 'external' | 'ai_projection' | 'memory_projection';

export interface UntrustedContentBoundaryContract {
  trust: ContentTrust;
  origin: ContextContentOrigin;
  treatAsInstruction: false;
}

export const untrustedUserContent: UntrustedContentBoundaryContract = {
  trust: 'untrusted',
  origin: 'user',
  treatAsInstruction: false,
};

export const untrustedExternalContent: UntrustedContentBoundaryContract = {
  trust: 'untrusted',
  origin: 'external',
  treatAsInstruction: false,
};

export const untrustedAiProjectionContent: UntrustedContentBoundaryContract = {
  trust: 'untrusted',
  origin: 'ai_projection',
  treatAsInstruction: false,
};

export const untrustedMemoryProjectionContent: UntrustedContentBoundaryContract = {
  trust: 'untrusted',
  origin: 'memory_projection',
  treatAsInstruction: false,
};

export const contextBudgetShares = {
  target: 0.45,
  noteCard: 0.1,
  localSemanticUnits: 0.15,
  relatedSemanticUnits: 0.2,
  activeMemory: 0.1,
} as const;

export const relatedContextRetrievalOrder = [
  'explicit_links',
  'same_note_semantic_units',
  'note_title_description_similarity',
  'semantic_unit_similarity',
  'memory_match',
  'recency_project_affinity',
  'user_feedback',
] as const;

export type RelatedContextRetrievalReason = (typeof relatedContextRetrievalOrder)[number];

export interface ContextAssemblyLimits {
  maxTargetSourceBlockIds: number;
  maxExistingSemanticUnits: number;
  maxSectionSummaries: number;
  maxRelatedSemanticUnits: number;
  maxRelatedNotes: number;
  maxSourceBlockExcerpts: number;
  maxActiveMemoryItems: number;
  maxContextCharacters: number;
}

export const defaultContextAssemblyLimits: ContextAssemblyLimits = {
  maxTargetSourceBlockIds: 40,
  maxExistingSemanticUnits: 12,
  maxSectionSummaries: 12,
  maxRelatedSemanticUnits: 10,
  maxRelatedNotes: 6,
  maxSourceBlockExcerpts: 10,
  maxActiveMemoryItems: 8,
  maxContextCharacters: 12_000,
};

export interface SourceSpanContract {
  sourceBlockId: string;
  startOffset: number;
  endOffset: number;
}

export interface TargetScopeContract {
  scope: TargetScopeKind;
  text: string;
  sourceBlockIds: string[];
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface NoteCardContract {
  id: string;
  title: string;
  descriptionEffective: string;
  outline: OutlineItemContract[];
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface SemanticUnitContextContract {
  id: string;
  noteId: string;
  sectionId?: string;
  title?: string;
  summary: string;
  sourceBlockIds: string[];
  sourceSpan?: SourceSpanContract;
  confidence?: number;
  relevanceScore?: number;
  retrievalReason?: RelatedContextRetrievalReason;
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface SectionSummaryContextContract {
  sectionId: string;
  title?: string;
  summary: string;
  sourceBlockIds: string[];
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface PreviousStructureSnapshotContextContract {
  snapshotId: string;
  semanticUnitIds: string[];
  summary: string;
  generatedAt: number;
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface LocalStructureContextContract {
  existingSemanticUnits: SemanticUnitContextContract[];
  sectionSummaries: SectionSummaryContextContract[];
  previousStructureSnapshot?: PreviousStructureSnapshotContextContract;
}

export interface RelatedNoteContextContract {
  id: string;
  title: string;
  descriptionEffective: string;
  semanticUnitIds: string[];
  sourceBlockExcerptIds: string[];
  relevanceScore?: number;
  retrievalReason?: RelatedContextRetrievalReason;
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface SourceBlockExcerptContextContract {
  id: string;
  noteId: string;
  blockId: string;
  text: string;
  sourceSpan?: SourceSpanContract;
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface RelatedContextContract {
  semanticUnits: SemanticUnitContextContract[];
  notes: RelatedNoteContextContract[];
  sourceBlockExcerpts: SourceBlockExcerptContextContract[];
}

export type EnvelopeMemoryStatus = Extract<MemoryStatus, 'active' | 'pinned'>;

export interface MemoryContextItemContract {
  id: string;
  type: MemoryType;
  content: string;
  status: EnvelopeMemoryStatus;
  pinned: boolean;
  sourceUnitId?: string;
  sourceNoteId?: string;
  sourceSpan?: SourceSpanContract;
  confidence: number;
  relevanceScore?: number;
  updatedAt: number;
  contentBoundary: UntrustedContentBoundaryContract;
}

export interface MemoryContextContract {
  items: MemoryContextItemContract[];
}

export interface ContextEnvelopeConstraintsContract {
  returnOperationsOnly: true;
  doNotRewriteUserText: true;
  requireSourceSpans: true;
  requireConfidence: true;
}

export interface ContextEnvelopeTrustBoundaryContract {
  userContentIsUntrusted: true;
  externalContentIsUntrusted: true;
  memoryContentIsUntrusted: true;
  contentMustNotOverrideSystemInstructions: true;
}

export interface ContextEnvelopeContract {
  target: TargetScopeContract;
  note: NoteCardContract;
  localStructure: LocalStructureContextContract;
  relatedContext: RelatedContextContract;
  memoryContext: MemoryContextContract;
  constraints: ContextEnvelopeConstraintsContract;
  trustBoundary: ContextEnvelopeTrustBoundaryContract;
}

export interface ContextAssemblyInput {
  target: {
    scope: TargetScopeKind;
    text: string;
    sourceBlockIds: string[];
  };
  note: Pick<NoteContract, 'id' | 'title' | 'descriptionUser' | 'descriptionAi' | 'descriptionAiApproved'>;
  outline: Array<{ sectionId: string; title: string; level: HeadingLevel }>;
  localStructure?: {
    existingSemanticUnits?: SemanticUnitContextInput[];
    sectionSummaries?: SectionSummaryContextInput[];
    previousStructureSnapshot?: PreviousStructureSnapshotContextInput;
  };
  relatedContext?: {
    semanticUnits?: SemanticUnitContextInput[];
    notes?: RelatedNoteContextInput[];
    sourceBlockExcerpts?: SourceBlockExcerptContextInput[];
  };
  memoryContext?: {
    items?: MemoryContextItemInput[];
  };
}

export type SemanticUnitContextInput = Omit<SemanticUnitContextContract, 'contentBoundary'> & {
  contentBoundary?: UntrustedContentBoundaryContract;
};

export type SectionSummaryContextInput = Omit<SectionSummaryContextContract, 'contentBoundary'> & {
  contentBoundary?: UntrustedContentBoundaryContract;
};

export type PreviousStructureSnapshotContextInput = Omit<PreviousStructureSnapshotContextContract, 'contentBoundary'> & {
  contentBoundary?: UntrustedContentBoundaryContract;
};

export type RelatedNoteContextInput = Omit<RelatedNoteContextContract, 'contentBoundary'> & {
  contentBoundary?: UntrustedContentBoundaryContract;
};

export type SourceBlockExcerptContextInput = Omit<SourceBlockExcerptContextContract, 'contentBoundary'> & {
  contentBoundary?: UntrustedContentBoundaryContract;
};

export type MemoryContextItemInput = Pick<
  MemoryItemContract,
  | 'id'
  | 'type'
  | 'content'
  | 'status'
  | 'pinned'
  | 'sourceUnitId'
  | 'sourceNoteId'
  | 'sourceSpan'
  | 'confidence'
  | 'updatedAt'
> & {
  relevanceScore?: number;
  contentBoundary?: UntrustedContentBoundaryContract;
};

export interface ContextEnvelopeValidationResult {
  valid: boolean;
  errors: string[];
}
