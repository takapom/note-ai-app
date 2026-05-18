// Application/runtime work queue port for StructureJob lifecycle claims.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/ai-structuring-lifecycle.md

import {
  isStructureTargetScope,
  isStructureTriggerReason,
  type CompletedStructureJobContract,
  type StructureJobContract,
  type StructureJobPriority,
  type StructureJobStatus,
} from '../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';

const structureJobStatuses = ['queued', 'running', 'completed', 'failed', 'skipped', 'deduped'] as const;
const structureJobPriorities = ['low', 'normal', 'high'] as const;

export interface RunningStructureJobContract extends Omit<StructureJobContract, 'status' | 'startedAt' | 'completedAt'> {
  status: 'running';
  startedAt: number;
}

export interface FailedStructureJobContract extends Omit<StructureJobContract, 'status' | 'completedAt'> {
  status: 'failed';
  startedAt: number;
  failedAt: number;
  failureMessage: string;
}

export interface ClaimNextQueuedStructureJobInput {
  workspaceId: string;
  claimedAt: number;
}

export interface MarkStructureJobCompletedInput {
  structureJobId: string;
  completedAt: number;
}

export interface MarkStructureJobFailedInput {
  structureJobId: string;
  failedAt: number;
  failureMessage: string;
}

export interface StructureJobWorkQueueResult {
  ok: boolean;
  errors: string[];
}

export interface StructureJobClaimResult extends StructureJobWorkQueueResult {
  job?: RunningStructureJobContract;
}

export interface StructureJobCompletedResult extends StructureJobWorkQueueResult {
  job?: CompletedStructureJobContract;
}

export interface StructureJobFailedResult extends StructureJobWorkQueueResult {
  job?: FailedStructureJobContract;
}

export interface StructureJobWorkQueuePort {
  claimNextQueuedJob(input: ClaimNextQueuedStructureJobInput): Promise<StructureJobClaimResult>;
  markJobCompleted(input: MarkStructureJobCompletedInput): Promise<StructureJobCompletedResult>;
  markJobFailed(input: MarkStructureJobFailedInput): Promise<StructureJobFailedResult>;
}

type StoredStructureJob =
  | StructureJobContract
  | RunningStructureJobContract
  | CompletedStructureJobContract
  | FailedStructureJobContract;

export class InMemoryStructureJobWorkQueue implements StructureJobWorkQueuePort {
  private readonly jobs: StoredStructureJob[];

  constructor(jobs: readonly StoredStructureJob[] = []) {
    this.jobs = jobs.map(cloneStructureJob);
  }

  async claimNextQueuedJob(input: ClaimNextQueuedStructureJobInput): Promise<StructureJobClaimResult> {
    const inputErrors = validateClaimNextQueuedJobInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const storedErrors = this.validateWorkspaceRecords(input.workspaceId);
    if (storedErrors.length > 0) {
      return { ok: false, errors: storedErrors };
    }

    const index = this.jobs.findIndex(
      (job) => job.workspaceId === input.workspaceId && job.status === 'queued',
    );
    if (index < 0) {
      return { ok: true, errors: [] };
    }

    const job = this.jobs[index];
    const { completedAt: _completedAt, ...claimableJob } = cloneStructureJob(job) as StructureJobContract;
    const runningJob: RunningStructureJobContract = {
      ...claimableJob,
      status: 'running',
      startedAt: input.claimedAt,
    };

    this.jobs[index] = runningJob;

    return {
      ok: true,
      errors: [],
      job: cloneStructureJob(runningJob) as RunningStructureJobContract,
    };
  }

  async markJobCompleted(input: MarkStructureJobCompletedInput): Promise<StructureJobCompletedResult> {
    const inputErrors = validateMarkStructureJobCompletedInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const found = this.findJobById(input.structureJobId);
    if (!found) {
      return { ok: false, errors: ['structureJobId was not found'] };
    }

    const jobErrors = validateStructureJobWorkQueueRecord(found.job);
    if (jobErrors.length > 0) {
      return { ok: false, errors: jobErrors };
    }
    if (found.job.status !== 'running') {
      return { ok: false, errors: [`structure job status ${found.job.status} is not running`] };
    }
    const runningJob = found.job as RunningStructureJobContract;
    if (input.completedAt < runningJob.startedAt) {
      return { ok: false, errors: ['completedAt must be greater than or equal to startedAt'] };
    }

    const completedJob: CompletedStructureJobContract = {
      ...cloneStructureJob(runningJob),
      status: 'completed',
      completedAt: input.completedAt,
    };
    this.jobs[found.index] = completedJob;

    return {
      ok: true,
      errors: [],
      job: cloneStructureJob(completedJob) as CompletedStructureJobContract,
    };
  }

  async markJobFailed(input: MarkStructureJobFailedInput): Promise<StructureJobFailedResult> {
    const inputErrors = validateMarkStructureJobFailedInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const found = this.findJobById(input.structureJobId);
    if (!found) {
      return { ok: false, errors: ['structureJobId was not found'] };
    }

    const jobErrors = validateStructureJobWorkQueueRecord(found.job);
    if (jobErrors.length > 0) {
      return { ok: false, errors: jobErrors };
    }
    if (found.job.status !== 'running') {
      return { ok: false, errors: [`structure job status ${found.job.status} is not running`] };
    }
    const runningJob = found.job as RunningStructureJobContract;
    if (input.failedAt < runningJob.startedAt) {
      return { ok: false, errors: ['failedAt must be greater than or equal to startedAt'] };
    }

    const failedBase = cloneStructureJob(runningJob) as RunningStructureJobContract;
    const failedJob: FailedStructureJobContract = {
      ...failedBase,
      status: 'failed',
      failedAt: input.failedAt,
      failureMessage: input.failureMessage,
    };
    this.jobs[found.index] = failedJob;

    return {
      ok: true,
      errors: [],
      job: cloneStructureJob(failedJob) as FailedStructureJobContract,
    };
  }

  list(): StoredStructureJob[] {
    return this.jobs.map(cloneStructureJob);
  }

  private validateWorkspaceRecords(workspaceId: string): string[] {
    const errors: string[] = [];
    for (const [index, job] of this.jobs.entries()) {
      if (job.workspaceId === workspaceId) {
        errors.push(...validateStructureJobWorkQueueRecord(job).map((error) => `jobs[${index}].${error}`));
      }
    }
    return errors;
  }

  private findJobById(structureJobId: string): { index: number; job: StoredStructureJob } | undefined {
    const index = this.jobs.findIndex((job) => job.id === structureJobId);
    if (index < 0) {
      return undefined;
    }

    return {
      index,
      job: this.jobs[index],
    };
  }
}

export function validateClaimNextQueuedJobInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['claim next queued job input must be an object'];
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(input.workspaceId, 'workspaceId', errors);
  validateFiniteNumber(input.claimedAt, 'claimedAt', errors);
  return errors;
}

export function validateMarkStructureJobCompletedInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['mark job completed input must be an object'];
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(input.structureJobId, 'structureJobId', errors);
  validateFiniteNumber(input.completedAt, 'completedAt', errors);
  return errors;
}

export function validateMarkStructureJobFailedInput(input: unknown): string[] {
  if (!isRecord(input)) {
    return ['mark job failed input must be an object'];
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(input.structureJobId, 'structureJobId', errors);
  validateRequiredTrimmedString(input.failureMessage, 'failureMessage', errors);
  validateFiniteNumber(input.failedAt, 'failedAt', errors);
  return errors;
}

export function validateStructureJobWorkQueueRecord(job: unknown): string[] {
  if (!isRecord(job)) {
    return ['structure job must be an object'];
  }

  const errors: string[] = [];
  validateRequiredTrimmedString(job.id, 'id', errors);
  validateRequiredTrimmedString(job.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(job.noteId, 'noteId', errors);
  validateOptionalTrimmedString(job.sectionId, 'sectionId', errors);
  validateRequiredTrimmedString(job.contextHash, 'contextHash', errors);

  if (!isStructureTargetScope(job.targetScope)) {
    errors.push('targetScope must be section, chunk, or note');
  }
  if (!isStructureTriggerReason(job.triggerReason)) {
    errors.push('triggerReason must be one of note_closed, tab_switched, app_left, next_open, manual_organize');
  }
  if (!isStructureJobStatus(job.status)) {
    errors.push('status must be one of queued, running, completed, failed, skipped, deduped');
  }
  if (!isStructureJobPriority(job.priority)) {
    errors.push('priority must be one of low, normal, high');
  }

  validateFiniteNumber(job.createdAt, 'createdAt', errors);
  validateOptionalFiniteNumber(job.startedAt, 'startedAt', errors);
  validateOptionalFiniteNumber(job.completedAt, 'completedAt', errors);

  if (job.status === 'running' && typeof job.startedAt !== 'number') {
    errors.push('startedAt is required when status is running');
  }
  if (job.status === 'completed' && typeof job.completedAt !== 'number') {
    errors.push('completedAt is required when status is completed');
  }
  if (job.status === 'failed') {
    validateFiniteNumber(job.failedAt, 'failedAt', errors);
    validateRequiredTrimmedString(job.failureMessage, 'failureMessage', errors);
  }

  if (
    typeof job.startedAt === 'number' &&
    typeof job.completedAt === 'number' &&
    Number.isFinite(job.startedAt) &&
    Number.isFinite(job.completedAt) &&
    job.completedAt < job.startedAt
  ) {
    errors.push('completedAt must be greater than or equal to startedAt');
  }

  return errors;
}

function cloneStructureJob(job: StoredStructureJob): StoredStructureJob {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    noteId: job.noteId,
    ...(job.sectionId === undefined ? {} : { sectionId: job.sectionId }),
    targetScope: job.targetScope,
    triggerReason: job.triggerReason,
    contextHash: job.contextHash,
    status: job.status,
    priority: job.priority,
    createdAt: job.createdAt,
    ...(job.startedAt === undefined ? {} : { startedAt: job.startedAt }),
    ...('completedAt' in job && job.completedAt !== undefined ? { completedAt: job.completedAt } : {}),
    ...(job.wholeNoteReason === undefined ? {} : { wholeNoteReason: job.wholeNoteReason }),
    ...(job.skipReason === undefined ? {} : { skipReason: job.skipReason }),
    ...('failedAt' in job ? { failedAt: job.failedAt } : {}),
    ...('failureMessage' in job ? { failureMessage: job.failureMessage } : {}),
  } as StoredStructureJob;
}

function validateRequiredTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed`);
  }
}

function validateOptionalTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string when provided`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed when provided`);
  }
}

function validateFiniteNumber(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
  }
}

function validateOptionalFiniteNumber(value: unknown, field: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  validateFiniteNumber(value, field, errors);
}

function isStructureJobStatus(value: unknown): value is StructureJobStatus {
  return typeof value === 'string' && (structureJobStatuses as readonly string[]).includes(value);
}

function isStructureJobPriority(value: unknown): value is StructureJobPriority {
  return typeof value === 'string' && (structureJobPriorities as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
