// Contract fixtures for structure scheduling.
// Authority: docs/contracts/ai-structuring-lifecycle.md

import { noteFixture, sectionFixture } from '../../../note-model/src/contract/noteFixtures.ts';
import type { SectionContract } from '../../../note-model/src/contract/noteContract.ts';
import type { BlockChangedInput, StructureJobContract } from './structureSchedulerContract.ts';

export const schedulerNow = 1_764_000_100_000;

export const blockChangedInputFixture: BlockChangedInput = {
  blockId: 'block_paragraph_001',
  noteId: noteFixture.id,
  sectionId: sectionFixture.id,
  previousContentHash: 'hash_block_paragraph_000',
  contentHash: 'hash_block_paragraph_001_changed',
  now: schedulerNow,
};

export const dirtySectionFixture: SectionContract = {
  ...sectionFixture,
  id: 'section_dirty_hash',
  contentHash: 'hash_section_dirty_hash',
  lastStructuredHash: 'hash_section_previous',
  isDirty: false,
};

export const dirtyFlagSectionFixture: SectionContract = {
  ...sectionFixture,
  id: 'section_dirty_flag',
  contentHash: 'hash_section_dirty_flag',
  lastStructuredHash: 'hash_section_dirty_flag',
  isDirty: true,
};

export const unchangedSectionFixture: SectionContract = {
  ...sectionFixture,
  id: 'section_unchanged',
  contentHash: 'hash_section_unchanged',
  lastStructuredHash: 'hash_section_unchanged',
  isDirty: false,
};

export const schedulerSectionsFixture: SectionContract[] = [
  dirtySectionFixture,
  dirtyFlagSectionFixture,
  unchangedSectionFixture,
];

export const completedSectionJobFixture: StructureJobContract = {
  id: 'structure_job_section_note_001_section_dirty_hash_hash_section_dirty_hash',
  workspaceId: noteFixture.workspaceId,
  noteId: noteFixture.id,
  sectionId: dirtySectionFixture.id,
  targetScope: 'section',
  triggerReason: 'note_closed',
  contextHash: `section:${noteFixture.id}:${dirtySectionFixture.id}:${dirtySectionFixture.contentHash}`,
  status: 'completed',
  priority: 'normal',
  createdAt: schedulerNow - 1_000,
  startedAt: schedulerNow - 900,
  completedAt: schedulerNow - 800,
};
