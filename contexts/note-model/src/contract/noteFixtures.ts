// Contract fixtures for the app-specific Note / Section / Block model.
// Authority: docs/contracts/app-note-model.md

import type { BlockContract, NoteContract, NoteDocumentContract, SectionContract } from './noteContract.ts';
import { createImplicitStableChunk } from './noteContract.ts';

const now = 1_764_000_000_000;

export const noteFixture: NoteContract = {
  id: 'note_001',
  workspaceId: 'workspace_001',
  title: 'Research direction',
  descriptionUser: 'Notes about the first MVP research direction.',
  descriptionAi: 'AI candidate description.',
  descriptionAiApproved: false,
  descriptionEffective: 'Notes about the first MVP research direction.',
  createdAt: now,
  updatedAt: now,
};

export const sectionFixture: SectionContract = {
  id: 'section_001',
  noteId: noteFixture.id,
  headingBlockId: 'block_heading_001',
  headingLevel: 2,
  title: 'MVP scope',
  descriptionAi: 'A section about the MVP boundary.',
  contentHash: 'hash_section_001',
  lastStructuredHash: 'hash_section_000',
  lastStructuredAt: now - 1_000,
  isDirty: true,
  position: 0,
  createdAt: now,
  updatedAt: now,
};

export const blockFixtures: BlockContract[] = [
  {
    id: 'block_heading_001',
    noteId: noteFixture.id,
    sectionId: sectionFixture.id,
    type: 'heading',
    contentJson: { text: 'MVP scope', level: 2 },
    plainText: 'MVP scope',
    position: 0,
    origin: 'user',
    contentHash: 'hash_block_heading_001',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'block_paragraph_001',
    noteId: noteFixture.id,
    sectionId: sectionFixture.id,
    type: 'paragraph',
    contentJson: { text: 'The MVP should protect writing flow before adding integrations.' },
    plainText: 'The MVP should protect writing flow before adding integrations.',
    position: 1,
    origin: 'user',
    contentHash: 'hash_block_paragraph_001',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'block_ai_question_001',
    noteId: noteFixture.id,
    sectionId: sectionFixture.id,
    type: 'ai_question',
    contentJson: {
      text: 'Should the initial digest be collapsed by default?',
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: 'block_paragraph_001',
          startOffset: 4,
          endOffset: 7,
          reason: 'Question derived from MVP scope ambiguity.',
        },
      ],
    },
    plainText: 'Should the initial digest be collapsed by default?',
    position: 2,
    origin: 'ai',
    contentHash: 'hash_block_ai_question_001',
    createdAt: now,
    updatedAt: now,
  },
];

export const noteDocumentFixture: NoteDocumentContract = {
  note: noteFixture,
  sections: [sectionFixture],
  blocks: blockFixtures,
};

export const implicitSectionDocumentFixture: NoteDocumentContract = {
  note: {
    id: 'note_without_heading_001',
    workspaceId: noteFixture.workspaceId,
    title: 'Loose capture',
    descriptionEffective: 'Loose capture',
    createdAt: now,
    updatedAt: now,
  },
  sections: [],
  blocks: [
    {
      id: 'block_loose_001',
      noteId: 'note_without_heading_001',
      type: 'paragraph',
      contentJson: { text: 'A thought captured without headings.' },
      plainText: 'A thought captured without headings.',
      position: 0,
      origin: 'user',
      contentHash: 'hash_block_loose_001',
      createdAt: now,
      updatedAt: now,
    },
  ],
};

implicitSectionDocumentFixture.implicitChunks = [
  createImplicitStableChunk(implicitSectionDocumentFixture.note.id, implicitSectionDocumentFixture.blocks),
];
