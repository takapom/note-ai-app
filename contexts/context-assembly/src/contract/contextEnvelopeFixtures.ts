// Contract fixtures for AI Context Envelope assembly.
// Authority: docs/contracts/context-assembly.md

import type { ContextAssemblyInput } from './contextEnvelopeContract.ts';
import { untrustedExternalContent } from './contextEnvelopeContract.ts';

const now = 1_764_000_000_000;

export const contextAssemblyInputFixture: ContextAssemblyInput = {
  target: {
    scope: 'section',
    text: 'The MVP should protect writing flow before adding integrations.',
    sourceBlockIds: ['block_heading_001', 'block_paragraph_001'],
  },
  note: {
    id: 'note_001',
    title: 'Research direction',
    descriptionUser: 'Notes about the first MVP research direction.',
    descriptionAi: 'AI candidate description.',
    descriptionAiApproved: false,
  },
  outline: [
    { sectionId: 'section_001', title: 'MVP scope', level: 2 },
    { sectionId: 'section_002', title: 'Later integrations', level: 2 },
  ],
  localStructure: {
    existingSemanticUnits: [
      {
        id: 'unit_local_001',
        noteId: 'note_001',
        sectionId: 'section_001',
        title: 'Writing flow first',
        summary: 'The MVP prioritizes uninterrupted user writing.',
        sourceBlockIds: ['block_paragraph_001'],
        sourceSpan: { sourceBlockId: 'block_paragraph_001', startOffset: 0, endOffset: 18 },
        confidence: 0.91,
      },
    ],
    sectionSummaries: [
      {
        sectionId: 'section_001',
        title: 'MVP scope',
        summary: 'The section defines MVP boundaries around writing flow.',
        sourceBlockIds: ['block_heading_001', 'block_paragraph_001'],
      },
    ],
    previousStructureSnapshot: {
      snapshotId: 'snapshot_001',
      semanticUnitIds: ['unit_local_000'],
      summary: 'Earlier snapshot before the section was edited.',
      generatedAt: now - 1_000,
    },
  },
  relatedContext: {
    semanticUnits: [
      {
        id: 'unit_related_001',
        noteId: 'note_related_001',
        title: 'Explicit MVP link',
        summary: 'An explicitly linked unit about MVP boundaries.',
        sourceBlockIds: ['block_related_001'],
        retrievalReason: 'explicit_links',
        relevanceScore: 0.7,
      },
      {
        id: 'unit_related_002',
        noteId: 'note_related_002',
        title: 'Similar semantic unit',
        summary: 'A semantically similar unit about structure.',
        sourceBlockIds: ['block_related_002'],
        retrievalReason: 'semantic_unit_similarity',
        relevanceScore: 0.99,
      },
    ],
    notes: [
      {
        id: 'note_related_001',
        title: 'MVP notes',
        descriptionEffective: 'Related MVP scope notes.',
        semanticUnitIds: ['unit_related_001'],
        sourceBlockExcerptIds: ['excerpt_001'],
        retrievalReason: 'note_title_description_similarity',
        relevanceScore: 0.8,
      },
    ],
    sourceBlockExcerpts: [
      {
        id: 'excerpt_001',
        noteId: 'note_related_001',
        blockId: 'block_related_001',
        text: 'Integrations are deferred until the writing surface is stable.',
        sourceSpan: { sourceBlockId: 'block_related_001', startOffset: 0, endOffset: 61 },
        contentBoundary: untrustedExternalContent,
      },
    ],
  },
  memoryContext: {
    items: [
      {
        id: 'memory_001',
        type: 'past_decision',
        content: 'Defer external integrations during MVP.',
        status: 'active',
        pinned: false,
        sourceNoteId: 'note_001',
        confidence: 0.93,
        relevanceScore: 0.8,
        updatedAt: now,
      },
      {
        id: 'memory_002',
        type: 'interest_theme',
        content: 'Writing flow protection is a recurring concern.',
        status: 'pinned',
        pinned: true,
        sourceUnitId: 'unit_local_001',
        confidence: 0.88,
        relevanceScore: 0.6,
        updatedAt: now - 100,
      },
      {
        id: 'memory_rejected_001',
        type: 'unresolved_question',
        content: 'This rejected memory must not enter context.',
        status: 'rejected',
        pinned: false,
        sourceNoteId: 'note_001',
        confidence: 0.99,
        relevanceScore: 1,
        updatedAt: now + 100,
      },
    ],
  },
};
