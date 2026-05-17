import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockOriginMatchesType,
  createImplicitStableChunk,
  isAiBlockType,
  isStructuralHeading,
  isUserBlockType,
  resolveDescriptionEffective,
  shouldUseImplicitSection,
  validateBlockContract,
} from '../../contexts/note-model/src/contract/noteContract.ts';
import {
  implicitSectionDocumentFixture,
  noteDocumentFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('description precedence prefers user text, then approved AI, then latest AI, then title outline fallback', () => {
  assert.equal(
    resolveDescriptionEffective({
      title: 'Planning',
      descriptionUser: 'User description',
      descriptionAi: 'AI description',
      descriptionAiApproved: true,
    }),
    'User description',
  );

  assert.equal(
    resolveDescriptionEffective({
      title: 'Planning',
      descriptionAi: 'Approved AI description',
      descriptionAiApproved: true,
    }),
    'Approved AI description',
  );

  assert.equal(
    resolveDescriptionEffective({
      title: 'Planning',
      descriptionAi: 'Latest AI description',
      descriptionAiApproved: false,
    }),
    'Latest AI description',
  );

  assert.equal(
    resolveDescriptionEffective(
      { title: 'Planning' },
      [{ sectionId: 'section_1', title: 'MVP scope', level: 2 }],
    ),
    'Planning - MVP scope',
  );
});

test('heading blocks with H1/H2/H3 content are structural section boundaries', () => {
  const [headingBlock, paragraphBlock] = noteDocumentFixture.blocks;

  assert.equal(isStructuralHeading(headingBlock), true);
  assert.equal(isStructuralHeading(paragraphBlock), false);
});

test('notes without headings use an implicit stable chunk', () => {
  assert.equal(shouldUseImplicitSection(noteDocumentFixture.blocks), false);
  assert.equal(shouldUseImplicitSection(implicitSectionDocumentFixture.blocks), true);

  const chunk = createImplicitStableChunk(
    implicitSectionDocumentFixture.note.id,
    implicitSectionDocumentFixture.blocks,
  );

  assert.deepEqual(chunk.sourceBlockIds, ['block_loose_001']);
  assert.equal(chunk.contentHash, 'hash_block_loose_001');
});

test('block type and origin constraints separate user-authored blocks from AI projections', () => {
  assert.equal(isUserBlockType('paragraph'), true);
  assert.equal(isUserBlockType('ai_question'), false);
  assert.equal(isAiBlockType('ai_question'), true);
  assert.equal(isAiBlockType('paragraph'), false);

  assert.equal(blockOriginMatchesType({ type: 'paragraph', origin: 'user' }), true);
  assert.equal(blockOriginMatchesType({ type: 'paragraph', origin: 'ai' }), false);
  assert.equal(blockOriginMatchesType({ type: 'ai_question', origin: 'ai' }), true);
  assert.equal(blockOriginMatchesType({ type: 'ai_question', origin: 'user_modified_ai' }), true);
  assert.equal(blockOriginMatchesType({ type: 'ai_question', origin: 'user' }), false);
});

test('block content validation keeps heading semantics always valid', () => {
  const [headingBlock, paragraphBlock] = noteDocumentFixture.blocks;

  assert.equal(validateBlockContract(headingBlock).valid, true);
  assert.equal(validateBlockContract(paragraphBlock).valid, true);

  assert.deepEqual(
    validateBlockContract({
      ...headingBlock,
      contentJson: { text: 'Styled large text without a heading level.' },
    }).errors,
    ['heading block content level must be H1, H2, or H3'],
  );

  assert.deepEqual(
    validateBlockContract({
      ...paragraphBlock,
      contentJson: { text: 'Paragraph carrying a heading level.', level: 2 },
    }).errors,
    ['non-heading block content must not carry a heading level'],
  );
});
