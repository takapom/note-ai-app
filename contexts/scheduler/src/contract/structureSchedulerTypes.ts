// Live product semantics for structure scheduling.
// Authority: docs/contracts/ai-structuring-lifecycle.md

import type { SectionContract } from '../../../note-model/src/contract/noteContract.ts';

export const structureTriggerReasons = [
  'note_closed',
  'tab_switched',
  'app_left',
  'next_open',
  'manual_organize',
] as const;

export type StructureTriggerReason = (typeof structureTriggerReasons)[number];

export const primaryStructureTriggers = ['note_closed', 'tab_switched', 'app_left'] as const;
export type PrimaryStructureTriggerReason = (typeof primaryStructureTriggers)[number];

export const recoveryStructureTriggers = ['next_open'] as const;
export type RecoveryStructureTriggerReason = (typeof recoveryStructureTriggers)[number];

export const explicitUserIntentStructureTriggers = ['manual_organize'] as const;
export type ExplicitUserIntentStructureTriggerReason = (typeof explicitUserIntentStructureTriggers)[number];

export const structureTargetScopes = ['section', 'chunk', 'note'] as const;
export type StructureTargetScope = (typeof structureTargetScopes)[number];

export type WholeNoteStructureReason = 'description' | 'summary' | 'manual_organize';
export type StructureJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'deduped';
export type StructureJobPriority = 'low' | 'normal' | 'high';
export type StructureJobSkipReason = 'completed_context_hash' | 'whole_note_scope_not_allowed';

export interface StructureJobContract {
  id: string;
  workspaceId: string;
  noteId: string;
  sectionId?: string;
  targetScope: StructureTargetScope;
  triggerReason: StructureTriggerReason;
  contextHash: string;
  status: StructureJobStatus;
  priority: StructureJobPriority;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  wholeNoteReason?: WholeNoteStructureReason;
  skipReason?: StructureJobSkipReason;
}

export type CompletedStructureJobContract = StructureJobContract & {
  status: 'completed';
  completedAt: number;
};

export type StructureJobCompletionResult =
  | {
      ok: true;
      job: CompletedStructureJobContract;
      errors: [];
    }
  | {
      ok: false;
      errors: string[];
    };

export interface BlockSaveIntentContract {
  blockId: string;
  noteId: string;
  sectionId: string;
  contentHash: string;
  savedAt: number;
}

export interface EditEventContract {
  type: 'BlockChanged';
  blockId: string;
  noteId: string;
  sectionId: string;
  occurredAt: number;
  previousContentHash?: string;
  contentHash: string;
}

export interface DirtyScopeMarkContract {
  targetScope: 'section';
  noteId: string;
  sectionId: string;
  contentHash: string;
  isDirty: true;
  markedAt: number;
}

export interface LightweightIndexUpdateContract {
  blockId: string;
  noteId: string;
  sectionId: string;
  contentHash: string;
  updatedAt: number;
}

export interface BlockChangedInput {
  blockId: string;
  noteId: string;
  sectionId: string;
  contentHash: string;
  previousContentHash?: string;
  now: number;
  updateLightweightIndex?: boolean;
}

export type BlockChangedResult =
  | {
  savedBlocks: BlockSaveIntentContract[];
  editEvent: EditEventContract;
  dirtyScopeMark: DirtyScopeMarkContract;
  lightweightIndexUpdate?: LightweightIndexUpdateContract;
  structureJobs: [];
  aiCalls: [];
  errors: [];
}
  | {
      savedBlocks: [];
      structureJobs: [];
      aiCalls: [];
      errors: string[];
    };

export interface StructureJobDedupeDecision {
  enqueue: boolean;
  status: Extract<StructureJobStatus, 'queued' | 'deduped'>;
  skipReason?: StructureJobSkipReason;
}

export interface PlanStructureJobsInput {
  workspaceId: string;
  noteId: string;
  triggerReason: StructureTriggerReason;
  sections: readonly SectionContract[];
  completedJobs?: readonly Pick<StructureJobContract, 'contextHash' | 'status'>[];
  targetScope?: StructureTargetScope;
  wholeNoteReason?: WholeNoteStructureReason;
  now: number;
}

export interface NextOpenDigestPreparationContract {
  workspaceId: string;
  noteId: string;
  triggerReason: 'next_open';
  recoveredJobCount: number;
  prepared: true;
}

export interface StructureJobPlanContract {
  jobs: StructureJobContract[];
  skippedJobs: StructureJobContract[];
  digestPreparation?: NextOpenDigestPreparationContract;
  errors: string[];
}

export interface StructurePlanRequestValidationResult {
  valid: boolean;
  errors: string[];
}

export const noteCloseFlowSteps = [
  'latest_blocks_save',
  'note_session_ended',
  'dirty_sections_discovery',
  'structure_job_enqueue',
  'background_structuring',
  'operations_saved_applied',
  'next_open_digest_prepared',
] as const;

export type NoteCloseFlowStep = (typeof noteCloseFlowSteps)[number];
