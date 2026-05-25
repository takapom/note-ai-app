// Contract fixtures for AI operations.
// Authority: docs/contracts/operation-return-contract.md

import type { StructureOperation } from './operationContract.ts';

export const validOperationFixtures: StructureOperation[] = [
  {
    type: 'create_semantic_unit',
    targetSectionId: 'section_001',
    unitType: 'decision',
    content: 'MVP keeps AI assistance inside the unified note surface.',
    summary: 'AI assistance stays inside the note surface.',
    sourceSpans: [{ blockId: 'block_001', startOffset: 0, endOffset: 42 }],
    confidence: 0.92,
  },
  {
    type: 'create_relation',
    fromUnitId: 'unit_001',
    toUnitId: 'unit_existing_001',
    relationType: 'supports',
    reason: 'The decision supports the single-surface UX principle.',
    confidence: 0.81,
  },
  {
    type: 'create_memory_candidate',
    targetSectionId: 'section_001',
    memoryType: 'past_decision',
    content: 'The MVP keeps AI assistance inside the unified note surface.',
    sourceSpans: [{ blockId: 'block_001' }],
    confidence: 0.88,
  },
  {
    type: 'insert_assist_block',
    blockType: 'ai_question',
    content: 'Should this unresolved question appear in the next open digest?',
    position: { appendToSectionId: 'section_001' },
    sourceSpans: [{ blockId: 'block_002' }],
    confidence: 0.77,
  },
  {
    type: 'mark_stale',
    targetType: 'semantic_unit',
    targetId: 'unit_001',
    reason: 'The source section changed since the unit was created.',
  },
  {
    type: 'no_op',
    reason: 'No stable structure can be inferred from the target section.',
  },
  {
    type: 'create_organized_note_version',
    targetNoteId: 'note_001',
    sourceCaptureEntryIds: ['capture_001'],
    organizedBlocks: [
      {
        blockType: 'heading',
        text: 'MVP scope',
        headingLevel: 2,
        position: 0,
        sourceCaptureEntryIds: ['capture_001'],
      },
      {
        blockType: 'paragraph',
        text: 'The MVP protects writing flow before adding integrations.',
        position: 1,
        sourceCaptureEntryIds: ['capture_001'],
      },
    ],
    trustGuards: [
      'restorable_history',
      'source_inspectable_related_context',
      'no_unbacked_claims_in_organized_body',
      'no_information_loss_without_history',
    ],
    relatedContextReferences: [
      {
        kind: 'note',
        targetId: 'note_related_001',
        title: 'Unified surface principle',
        reason: 'Related prior note about keeping AI secondary.',
        sourceInspectable: true,
      },
    ],
    sourceSpans: [{ blockId: 'block_001' }, { blockId: 'block_002' }],
    confidence: 0.9,
  },
];

export const forbiddenRewriteOperationFixture = {
  type: 'rewrite_user_block',
  blockId: 'block_001',
  content: 'Replace the user-authored text.',
};
