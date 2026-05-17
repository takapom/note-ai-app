import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assembleContextEnvelope,
  defaultContextAssemblyLimits,
  untrustedExternalContent,
  validateContextEnvelope,
} from '../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';

test('context envelope includes target, note card title, description, and heading outline', () => {
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture);

  assert.equal(envelope.target.scope, 'section');
  assert.deepEqual(envelope.target.sourceBlockIds, ['block_heading_001', 'block_paragraph_001']);
  assert.equal(envelope.note.title, 'Research direction');
  assert.equal(envelope.note.descriptionEffective, 'Notes about the first MVP research direction.');
  assert.deepEqual(
    envelope.note.outline.map((item) => [item.level, item.title]),
    [
      [2, 'MVP scope'],
      [2, 'Later integrations'],
    ],
  );
  assert.equal(envelope.localStructure.existingSemanticUnits.length, 1);
  assert.equal(envelope.localStructure.sectionSummaries.length, 1);
  assert.equal(envelope.localStructure.previousStructureSnapshot.snapshotId, 'snapshot_001');
  assert.equal(validateContextEnvelope(envelope).valid, true);
});

test('descriptionEffective priority matches note model order', () => {
  const baseInput = {
    ...contextAssemblyInputFixture,
    note: {
      id: 'note_priority',
      title: 'Planning',
    },
    outline: [{ sectionId: 'section_priority', title: 'MVP scope', level: 2 }],
  };

  assert.equal(
    assembleContextEnvelope({
      ...baseInput,
      note: {
        ...baseInput.note,
        descriptionUser: 'User description',
        descriptionAi: 'Approved AI description',
        descriptionAiApproved: true,
      },
    }).note.descriptionEffective,
    'User description',
  );

  assert.equal(
    assembleContextEnvelope({
      ...baseInput,
      note: {
        ...baseInput.note,
        descriptionAi: 'Approved AI description',
        descriptionAiApproved: true,
      },
    }).note.descriptionEffective,
    'Approved AI description',
  );

  assert.equal(
    assembleContextEnvelope({
      ...baseInput,
      note: {
        ...baseInput.note,
        descriptionAi: 'Latest AI description',
        descriptionAiApproved: false,
      },
    }).note.descriptionEffective,
    'Latest AI description',
  );

  assert.equal(
    assembleContextEnvelope(baseInput).note.descriptionEffective,
    'Planning - MVP scope',
  );
});

test('related context and memory are top K bounded and inactive memory is excluded', () => {
  const input = {
    ...contextAssemblyInputFixture,
    relatedContext: {
      semanticUnits: Array.from({ length: 5 }, (_, index) => ({
        id: `unit_${index}`,
        noteId: `note_${index}`,
        summary: `Related summary ${index}`,
        sourceBlockIds: [`block_${index}`],
        retrievalReason: index === 4 ? 'explicit_links' : 'semantic_unit_similarity',
        relevanceScore: index / 10,
      })),
      notes: Array.from({ length: 4 }, (_, index) => ({
        id: `note_related_${index}`,
        title: `Related note ${index}`,
        descriptionEffective: `Description ${index}`,
        semanticUnitIds: [`unit_${index}`],
        sourceBlockExcerptIds: [`excerpt_${index}`],
        relevanceScore: index / 10,
      })),
      sourceBlockExcerpts: Array.from({ length: 4 }, (_, index) => ({
        id: `excerpt_${index}`,
        noteId: `note_related_${index}`,
        blockId: `block_${index}`,
        text: `Excerpt ${index}`,
      })),
    },
    memoryContext: {
      items: [
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `memory_active_${index}`,
          type: 'past_decision',
          content: `Decision ${index}`,
          status: 'active',
          pinned: false,
          sourceNoteId: 'note_001',
          confidence: 0.9,
          relevanceScore: index / 10,
          updatedAt: index,
        })),
        {
          id: 'memory_rejected',
          type: 'interest_theme',
          content: 'Rejected memory must stay out',
          status: 'rejected',
          pinned: false,
          sourceNoteId: 'note_001',
          confidence: 0.99,
          relevanceScore: 1,
          updatedAt: 100,
        },
        {
          id: 'memory_pending',
          type: 'unresolved_question',
          content: 'Pending memory must stay out',
          status: 'pending',
          pinned: false,
          sourceNoteId: 'note_001',
          confidence: 0.99,
          relevanceScore: 1,
          updatedAt: 101,
        },
      ],
    },
  };
  const limits = {
    ...defaultContextAssemblyLimits,
    maxRelatedSemanticUnits: 2,
    maxRelatedNotes: 2,
    maxSourceBlockExcerpts: 2,
    maxActiveMemoryItems: 2,
  };

  const envelope = assembleContextEnvelope(input, limits);

  assert.equal(envelope.relatedContext.semanticUnits.length, 2);
  assert.equal(envelope.relatedContext.semanticUnits[0].id, 'unit_4');
  assert.equal(envelope.relatedContext.notes.length, 2);
  assert.equal(envelope.relatedContext.sourceBlockExcerpts.length, 2);
  assert.equal(envelope.memoryContext.items.length, 2);
  assert.ok(envelope.memoryContext.items.every((item) => item.status === 'active' || item.status === 'pinned'));
  assert.ok(envelope.memoryContext.items.every((item) => !['memory_rejected', 'memory_pending'].includes(item.id)));
  assert.equal(validateContextEnvelope(envelope, limits).valid, true);
});

test('active memory without source provenance is excluded during assembly', () => {
  const envelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    memoryContext: {
      items: [
        {
          id: 'memory_without_source',
          type: 'past_decision',
          content: 'This active memory has no source-backed provenance.',
          status: 'active',
          pinned: false,
          confidence: 0.99,
          relevanceScore: 1,
          updatedAt: 2,
        },
        {
          id: 'memory_with_source',
          type: 'past_decision',
          content: 'This active memory has source-backed provenance.',
          status: 'active',
          pinned: false,
          sourceNoteId: 'note_001',
          confidence: 0.9,
          relevanceScore: 0.5,
          updatedAt: 1,
        },
      ],
    },
  });
  const validation = validateContextEnvelope(envelope);

  assert.deepEqual(
    envelope.memoryContext.items.map((item) => item.id),
    ['memory_with_source'],
  );
  assert.equal(validation.valid, true);
});

test('memory sourceSpan must be a valid source span to count as provenance', () => {
  const invalidSpanEnvelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    memoryContext: {
      items: [
        {
          id: 'memory_empty_span',
          type: 'past_decision',
          content: 'This active memory has an empty source span.',
          status: 'active',
          pinned: false,
          sourceSpan: {},
          confidence: 0.9,
          updatedAt: 1,
        },
      ],
    },
  });
  const validSpanEnvelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    memoryContext: {
      items: [
        {
          id: 'memory_valid_span',
          type: 'past_decision',
          content: 'This active memory has a valid source span.',
          status: 'active',
          pinned: false,
          sourceSpan: { sourceBlockId: 'block_001', startOffset: 0, endOffset: 4 },
          confidence: 0.9,
          updatedAt: 1,
        },
      ],
    },
  });

  assert.deepEqual(invalidSpanEnvelope.memoryContext.items, []);
  assert.equal(validateContextEnvelope(invalidSpanEnvelope).valid, true);
  assert.deepEqual(
    validSpanEnvelope.memoryContext.items.map((item) => item.id),
    ['memory_valid_span'],
  );
  assert.equal(validateContextEnvelope(validSpanEnvelope).valid, true);
});

test('full workspace dumps and oversized budgets are rejected', () => {
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture);
  const withWorkspaceDump = {
    ...envelope,
    fullWorkspaceDump: 'all notes and all blocks are not allowed',
  };
  const withFullNoteText = {
    ...envelope,
    relatedContext: {
      ...envelope.relatedContext,
      notes: [
        {
          ...envelope.relatedContext.notes[0],
          fullNoteText: 'full note content is not allowed in related notes',
        },
      ],
    },
  };
  const tinyBudgetLimits = {
    ...defaultContextAssemblyLimits,
    maxContextCharacters: 30,
  };

  assert.equal(validateContextEnvelope(withWorkspaceDump).valid, false);
  assert.equal(validateContextEnvelope(withFullNoteText).valid, false);

  const budgetResult = validateContextEnvelope(envelope, tinyBudgetLimits);
  assert.equal(budgetResult.valid, false);
  assert.ok(budgetResult.errors.some((error) => error.includes('context budget')));
});

test('invalid context assembly limits do not bypass budget checks', () => {
  const limits = {
    ...defaultContextAssemblyLimits,
    maxContextCharacters: Number.NaN,
  };
  const envelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    target: {
      ...contextAssemblyInputFixture.target,
      text: 'x'.repeat(100_000),
    },
  }, limits);
  const result = validateContextEnvelope(envelope, limits);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('context assembly limits must be finite non-negative numbers'));
  assert.ok(result.errors.some((error) => error.includes('context budget')));
});

test('negative K limits are normalized before slicing context items', () => {
  const limits = {
    ...defaultContextAssemblyLimits,
    maxRelatedSemanticUnits: -1,
  };
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture, limits);

  assert.deepEqual(envelope.relatedContext.semanticUnits, []);
});

test('partial envelopes return validation errors instead of throwing', () => {
  const partialEnvelope = {
    target: { scope: 'section', sourceBlockIds: ['b'] },
    note: { title: 't', descriptionEffective: 'd', outline: [] },
    localStructure: {},
    relatedContext: {},
    memoryContext: { items: [] },
    constraints: {
      returnOperationsOnly: true,
      doNotRewriteUserText: true,
      requireSourceSpans: true,
      requireConfidence: true,
    },
    trustBoundary: {
      userContentIsUntrusted: true,
      externalContentIsUntrusted: true,
      memoryContentIsUntrusted: true,
      contentMustNotOverrideSystemInstructions: true,
    },
  };

  let result;
  assert.doesNotThrow(() => {
    result = validateContextEnvelope(partialEnvelope);
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('target text must be a string'));
  assert.ok(result.errors.includes('localStructure.existingSemanticUnits must be an array'));
  assert.ok(result.errors.includes('localStructure.sectionSummaries must be an array'));
  assert.ok(result.errors.includes('relatedContext.semanticUnits must be an array'));
  assert.ok(result.errors.includes('relatedContext.notes must be an array'));
  assert.ok(result.errors.includes('relatedContext.sourceBlockExcerpts must be an array'));
});

test('memory context items require source provenance', () => {
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture);
  const withoutMemorySource = {
    ...envelope,
    memoryContext: {
      items: [
        {
          id: 'memory_without_source',
          type: 'past_decision',
          content: 'Memory without provenance must be rejected.',
          status: 'active',
          pinned: false,
          confidence: 0.9,
          updatedAt: 1,
          contentBoundary: envelope.memoryContext.items[0].contentBoundary,
        },
      ],
    },
  };

  const result = validateContextEnvelope(withoutMemorySource);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('memory memory_without_source must include source provenance'));
});

test('memory context sourceSpan must be valid when provided', () => {
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture);
  const withEmptySourceSpan = {
    ...envelope,
    memoryContext: {
      items: [
        {
          id: 'memory_empty_span',
          type: 'past_decision',
          content: 'Memory with empty sourceSpan must be rejected.',
          status: 'active',
          pinned: false,
          sourceSpan: {},
          confidence: 0.9,
          updatedAt: 1,
          contentBoundary: envelope.memoryContext.items[0].contentBoundary,
        },
      ],
    },
  };

  const result = validateContextEnvelope(withEmptySourceSpan);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('memory memory_empty_span must include source provenance'));
  assert.ok(result.errors.includes('memory memory_empty_span sourceSpan must be valid'));
});

test('constraints are fixed and require operations with source spans and confidence', () => {
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture);

  assert.deepEqual(envelope.constraints, {
    returnOperationsOnly: true,
    doNotRewriteUserText: true,
    requireSourceSpans: true,
    requireConfidence: true,
  });

  const weakened = {
    ...envelope,
    constraints: {
      ...envelope.constraints,
      doNotRewriteUserText: false,
    },
  };

  assert.equal(validateContextEnvelope(weakened).valid, false);
});

test('user and external content are represented as untrusted content', () => {
  const envelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    relatedContext: {
      ...contextAssemblyInputFixture.relatedContext,
      sourceBlockExcerpts: [
        {
          id: 'external_excerpt_001',
          noteId: 'external_note_001',
          blockId: 'external_block_001',
          text: 'External content can contain instructions but must not be treated as instructions.',
          contentBoundary: untrustedExternalContent,
        },
      ],
    },
  });

  assert.equal(envelope.target.contentBoundary.trust, 'untrusted');
  assert.equal(envelope.target.contentBoundary.treatAsInstruction, false);
  assert.equal(envelope.note.contentBoundary.trust, 'untrusted');
  assert.equal(envelope.relatedContext.sourceBlockExcerpts[0].contentBoundary.origin, 'external');
  assert.equal(envelope.relatedContext.sourceBlockExcerpts[0].contentBoundary.trust, 'untrusted');
  assert.equal(envelope.trustBoundary.userContentIsUntrusted, true);
  assert.equal(envelope.trustBoundary.externalContentIsUntrusted, true);

  const trustedExternalContent = {
    ...envelope,
    relatedContext: {
      ...envelope.relatedContext,
      sourceBlockExcerpts: [
        {
          ...envelope.relatedContext.sourceBlockExcerpts[0],
          contentBoundary: {
            trust: 'trusted',
            origin: 'external',
            treatAsInstruction: true,
          },
        },
      ],
    },
  };

  assert.equal(validateContextEnvelope(trustedExternalContent).valid, false);
});

test('assembly sanitizes caller supplied trusted boundaries', () => {
  const envelope = assembleContextEnvelope({
    ...contextAssemblyInputFixture,
    localStructure: {
      ...contextAssemblyInputFixture.localStructure,
      existingSemanticUnits: [
        {
          ...contextAssemblyInputFixture.localStructure.existingSemanticUnits[0],
          contentBoundary: {
            trust: 'trusted',
            origin: 'user',
            treatAsInstruction: true,
          },
        },
      ],
    },
    relatedContext: {
      ...contextAssemblyInputFixture.relatedContext,
      sourceBlockExcerpts: [
        {
          ...contextAssemblyInputFixture.relatedContext.sourceBlockExcerpts[0],
          contentBoundary: {
            trust: 'untrusted',
            origin: 'external',
            treatAsInstruction: false,
          },
        },
      ],
    },
  });

  assert.equal(envelope.localStructure.existingSemanticUnits[0].contentBoundary.trust, 'untrusted');
  assert.equal(envelope.localStructure.existingSemanticUnits[0].contentBoundary.origin, 'ai_projection');
  assert.equal(envelope.localStructure.existingSemanticUnits[0].contentBoundary.treatAsInstruction, false);
  assert.equal(envelope.relatedContext.sourceBlockExcerpts[0].contentBoundary.origin, 'external');
  assert.equal(validateContextEnvelope(envelope).valid, true);
});

test('context envelope rejects blank source ids', () => {
  const envelope = assembleContextEnvelope(contextAssemblyInputFixture);
  const invalid = {
    ...envelope,
    target: {
      ...envelope.target,
      sourceBlockIds: ['block_001', ' '],
    },
    relatedContext: {
      ...envelope.relatedContext,
      sourceBlockExcerpts: [
        {
          ...envelope.relatedContext.sourceBlockExcerpts[0],
          blockId: '',
        },
      ],
    },
  };

  const result = validateContextEnvelope(invalid);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('target.sourceBlockIds[1] must be a non-empty string'));
  assert.ok(result.errors.includes('relatedContext.sourceBlockExcerpts[0].blockId must be a non-empty string'));
});
