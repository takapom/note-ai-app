// Live product semantics for structure scheduling.
// Authority: docs/contracts/ai-structuring-lifecycle.md


import type { SectionContract } from '../../../note-model/src/contract/noteContract.ts';
import {
  structureTargetScopes,
  structureTriggerReasons,
  type BlockChangedInput,
  type BlockChangedResult,
  type BlockSaveIntentContract,
  type CompletedStructureJobContract,
  type DirtyScopeMarkContract,
  type EditEventContract,
  type LightweightIndexUpdateContract,
  type NextOpenDigestPreparationContract,
  type PlanStructureJobsInput,
  type StructureJobCompletionResult,
  type StructureJobContract,
  type StructureJobDedupeDecision,
  type StructureJobPlanContract,
  type StructureJobPriority,
  type StructurePlanRequestValidationResult,
  type StructureTargetScope,
  type StructureTriggerReason,
  type WholeNoteStructureReason,
} from './structureSchedulerTypes.ts';

export function completeStructureJob(
  structureJob: StructureJobContract,
  completedAt: number,
): StructureJobCompletionResult {
  const errors: string[] = [];

  for (const field of ['id', 'workspaceId', 'noteId', 'contextHash'] as const) {
    if (!isNonEmptyString(structureJob[field])) {
      errors.push(`structureJob.${field} must be a non-empty string`);
    }
  }
  if (structureJob.status !== 'running') {
    errors.push(`structure job status ${structureJob.status} is not running`);
  }
  if (typeof completedAt !== 'number' || !Number.isFinite(completedAt)) {
    errors.push('completedAt must be a finite number');
  }
  if (structureJob.startedAt !== undefined && Number.isFinite(completedAt) && completedAt < structureJob.startedAt) {
    errors.push('completedAt must be greater than or equal to startedAt when startedAt is provided');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    job: {
      ...structureJob,
      status: 'completed',
      completedAt,
    },
    errors: [],
  };
}

export function handleBlockChanged(input: BlockChangedInput): BlockChangedResult {
  const errors = validateBlockChangedInput(input);
  if (errors.length > 0) {
    return {
      savedBlocks: [],
      structureJobs: [],
      aiCalls: [],
      errors,
    };
  }

  const savedBlock: BlockSaveIntentContract = {
    blockId: input.blockId,
    noteId: input.noteId,
    sectionId: input.sectionId,
    contentHash: input.contentHash,
    savedAt: input.now,
  };
  const editEvent: EditEventContract = {
    type: 'BlockChanged',
    blockId: input.blockId,
    noteId: input.noteId,
    sectionId: input.sectionId,
    occurredAt: input.now,
    contentHash: input.contentHash,
    ...(input.previousContentHash === undefined ? {} : { previousContentHash: input.previousContentHash }),
  };
  const dirtyScopeMark: DirtyScopeMarkContract = {
    targetScope: 'section',
    noteId: input.noteId,
    sectionId: input.sectionId,
    contentHash: input.contentHash,
    isDirty: true,
    markedAt: input.now,
  };
  const lightweightIndexUpdate = input.updateLightweightIndex === false
    ? undefined
    : {
        blockId: input.blockId,
        noteId: input.noteId,
        sectionId: input.sectionId,
        contentHash: input.contentHash,
        updatedAt: input.now,
      };

  return {
    savedBlocks: [savedBlock],
    editEvent,
    dirtyScopeMark,
    ...(lightweightIndexUpdate ? { lightweightIndexUpdate } : {}),
    structureJobs: [],
    aiCalls: [],
    errors: [],
  };
}

export function validateBlockChangedInput(input: unknown): string[] {
  const errors: string[] = [];
  const event = asRecord(input);

  if (!event) {
    return ['BlockChanged input must be an object'];
  }

  for (const field of ['blockId', 'noteId', 'sectionId', 'contentHash'] as const) {
    if (!isNonEmptyString(event[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (event.previousContentHash !== undefined && !isNonEmptyString(event.previousContentHash)) {
    errors.push('previousContentHash must be a non-empty string when provided');
  }

  if (typeof event.now !== 'number' || !Number.isFinite(event.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

export function discoverDirtySections(sections: readonly SectionContract[]): SectionContract[] {
  return sections.filter((section) => section.isDirty || section.contentHash !== section.lastStructuredHash);
}

export function planStructureJobs(input: PlanStructureJobsInput): StructureJobPlanContract {
  const jobs: StructureJobContract[] = [];
  const skippedJobs: StructureJobContract[] = [];
  const validation = validateStructurePlanRequest(input);

  if (!validation.valid) {
    return {
      jobs,
      skippedJobs,
      errors: validation.errors,
    };
  }

  const targetScope = input.targetScope ?? 'section';
  const completedJobs = input.completedJobs ?? [];
  const errors: string[] = [];

  if (targetScope === 'note') {
    if (!isWholeNoteScopeAllowed(input.triggerReason, input.wholeNoteReason)) {
      return {
        jobs,
        skippedJobs,
        errors: ['whole note scope requires description, summary, or manual organize intent'],
        ...(input.triggerReason === 'next_open'
          ? { digestPreparation: createNextOpenDigestPreparation(input.workspaceId, input.noteId, 0) }
          : {}),
      };
    }

    const noteJob = createStructureJob({
      workspaceId: input.workspaceId,
      noteId: input.noteId,
      targetScope,
      triggerReason: input.triggerReason,
      contextHash: buildNoteContextHash(input.noteId, input.sections, input.wholeNoteReason),
      priority: input.triggerReason === 'manual_organize' ? 'high' : 'normal',
      now: input.now,
      wholeNoteReason: input.wholeNoteReason ?? 'manual_organize',
    });
    const decision = shouldEnqueueStructureJob(noteJob, completedJobs);
    if (decision.enqueue) {
      jobs.push(noteJob);
    } else {
      skippedJobs.push(markJobSkipped(noteJob, decision));
    }

    return {
      jobs,
      skippedJobs,
      errors,
      ...(input.triggerReason === 'next_open'
        ? { digestPreparation: createNextOpenDigestPreparation(input.workspaceId, input.noteId, jobs.length) }
        : {}),
    };
  }

  const dirtySections = discoverDirtySections(input.sections);
  for (const section of dirtySections) {
    const sectionErrors = validateDirtySectionTarget(section, input.noteId);
    if (sectionErrors.length > 0) {
      errors.push(...sectionErrors);
      continue;
    }

    const job = createStructureJob({
      workspaceId: input.workspaceId,
      noteId: input.noteId,
      sectionId: section.id,
      targetScope: 'section',
      triggerReason: input.triggerReason,
      contextHash: buildSectionContextHash(input.noteId, section),
      priority: input.triggerReason === 'manual_organize' ? 'high' : 'normal',
      now: input.now,
    });
    const decision = shouldEnqueueStructureJob(job, completedJobs);
    if (decision.enqueue) {
      jobs.push(job);
    } else {
      skippedJobs.push(markJobSkipped(job, decision));
    }
  }

  return {
    jobs,
    skippedJobs,
    errors,
    ...(input.triggerReason === 'next_open'
      ? { digestPreparation: createNextOpenDigestPreparation(input.workspaceId, input.noteId, jobs.length) }
      : {}),
  };
}

export function shouldEnqueueStructureJob(
  candidate: Pick<StructureJobContract, 'contextHash'>,
  completedJobs: readonly Pick<StructureJobContract, 'contextHash' | 'status'>[] = [],
): StructureJobDedupeDecision {
  const hasCompletedContext = completedJobs.some(
    (job) => job.contextHash === candidate.contextHash && job.status === 'completed',
  );

  if (hasCompletedContext) {
    return {
      enqueue: false,
      status: 'deduped',
      skipReason: 'completed_context_hash',
    };
  }

  return {
    enqueue: true,
    status: 'queued',
  };
}

export function isWholeNoteScopeAllowed(
  triggerReason: StructureTriggerReason,
  wholeNoteReason?: WholeNoteStructureReason,
): boolean {
  if (triggerReason === 'manual_organize') {
    return true;
  }

  return wholeNoteReason === 'description' || wholeNoteReason === 'summary';
}

export function validateStructurePlanRequest(input: unknown): StructurePlanRequestValidationResult {
  const errors: string[] = [];
  const request = asRecord(input);

  if (!request) {
    return { valid: false, errors: ['structure plan request must be an object'] };
  }

  if (!isNonEmptyString(request.workspaceId)) {
    errors.push('workspaceId must be a non-empty string');
  }

  if (!isNonEmptyString(request.noteId)) {
    errors.push('noteId must be a non-empty string');
  }

  if (!isStructureTriggerReason(request.triggerReason)) {
    errors.push(`triggerReason must be one of ${structureTriggerReasons.join(', ')}`);
  }

  if (!Array.isArray(request.sections)) {
    errors.push('sections must be an array');
  }

  if (typeof request.now !== 'number' || !Number.isFinite(request.now)) {
    errors.push('now must be a finite number');
  }

  const targetScope = request.targetScope ?? 'section';
  if (!isStructureTargetScope(targetScope)) {
    errors.push(`targetScope must be one of ${structureTargetScopes.join(', ')}`);
  }

  if (targetScope === 'chunk') {
    errors.push('chunk target scope is unsupported until stable chunk input is provided');
  }

  if (
    isStructureTriggerReason(request.triggerReason) &&
    targetScope === 'note' &&
    !isWholeNoteScopeAllowed(request.triggerReason, readWholeNoteReason(request.wholeNoteReason))
  ) {
    errors.push('whole note scope requires description, summary, or manual organize intent');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isStructureTriggerReason(value: unknown): value is StructureTriggerReason {
  return typeof value === 'string' && (structureTriggerReasons as readonly string[]).includes(value);
}

export function isStructureTargetScope(value: unknown): value is StructureTargetScope {
  return typeof value === 'string' && (structureTargetScopes as readonly string[]).includes(value);
}

function validateDirtySectionTarget(section: SectionContract, noteId: string): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(section.id)) {
    errors.push('dirty section id must be a non-empty string');
  }

  if (section.noteId !== noteId) {
    errors.push('dirty section noteId must match the structure plan noteId');
  }

  if (!isNonEmptyString(section.contentHash)) {
    errors.push('dirty section contentHash must be a non-empty string');
  }

  return errors;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function createStructureJob(input: {
  workspaceId: string;
  noteId: string;
  sectionId?: string;
  targetScope: StructureTargetScope;
  triggerReason: StructureTriggerReason;
  contextHash: string;
  priority: StructureJobPriority;
  now: number;
  wholeNoteReason?: WholeNoteStructureReason;
}): StructureJobContract {
  return {
    id: `structure_job_${toStableId(input.contextHash)}`,
    workspaceId: input.workspaceId,
    noteId: input.noteId,
    ...(input.sectionId === undefined ? {} : { sectionId: input.sectionId }),
    targetScope: input.targetScope,
    triggerReason: input.triggerReason,
    contextHash: input.contextHash,
    status: 'queued',
    priority: input.priority,
    createdAt: input.now,
    ...(input.wholeNoteReason === undefined ? {} : { wholeNoteReason: input.wholeNoteReason }),
  };
}

function markJobSkipped(
  job: StructureJobContract,
  decision: StructureJobDedupeDecision,
): StructureJobContract {
  return {
    ...job,
    status: decision.status,
    ...(decision.skipReason === undefined ? {} : { skipReason: decision.skipReason }),
  };
}

function buildSectionContextHash(noteId: string, section: Pick<SectionContract, 'id' | 'contentHash'>): string {
  return `section:${noteId}:${section.id}:${section.contentHash}`;
}

function buildNoteContextHash(
  noteId: string,
  sections: readonly Pick<SectionContract, 'id' | 'contentHash'>[],
  wholeNoteReason: WholeNoteStructureReason | undefined,
): string {
  const sectionHashes = sections
    .map((section) => `${section.id}=${section.contentHash}`)
    .join('|');
  return `note:${noteId}:${wholeNoteReason ?? 'manual_organize'}:${sectionHashes}`;
}

function createNextOpenDigestPreparation(
  workspaceId: string,
  noteId: string,
  recoveredJobCount: number,
): NextOpenDigestPreparationContract {
  return {
    workspaceId,
    noteId,
    triggerReason: 'next_open',
    recoveredJobCount,
    prepared: true,
  };
}

function readWholeNoteReason(value: unknown): WholeNoteStructureReason | undefined {
  if (value === 'description' || value === 'summary' || value === 'manual_organize') {
    return value;
  }
  return undefined;
}

function toStableId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
