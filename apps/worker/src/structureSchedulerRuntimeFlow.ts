// Worker orchestration for structure scheduler triggers.
// Authority: docs/contracts/ai-structuring-lifecycle.md
// Companion: docs/contracts/backend-runtime.md

import type { SectionContract } from '../../../contexts/note-model/src/contract/noteContract.ts';
import {
  handleBlockChanged,
  planStructureJobs,
  validateStructurePlanRequest,
  type BlockChangedInput,
  type BlockChangedResult,
  type BlockSaveIntentContract,
  type DirtyScopeMarkContract,
  type EditEventContract,
  type LightweightIndexUpdateContract,
  type NextOpenDigestPreparationContract,
  type PlanStructureJobsInput,
  type StructureJobContract,
  type StructureJobPlanContract,
  type StructureTargetScope,
  type StructureTriggerReason,
  type WholeNoteStructureReason,
} from '../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';

export type ValidBlockChangedResult = Extract<BlockChangedResult, {
  savedBlocks: BlockSaveIntentContract[];
  editEvent: EditEventContract;
  dirtyScopeMark: DirtyScopeMarkContract;
  lightweightIndexUpdate?: LightweightIndexUpdateContract;
  errors: [];
}>;

export interface SchedulerNoteSnapshotPort {
  loadSections(input: { workspaceId: string; noteId: string }): Promise<SectionContract[]>;
}

export interface BlockChangedPersistencePort {
  persistBlockChanged(output: ValidBlockChangedResult): Promise<WorkerSchedulerPortResult>;
}

export interface StructureJobQueuePort {
  listCompletedJobs(input: {
    workspaceId: string;
    noteId: string;
  }): Promise<Pick<StructureJobContract, 'contextHash' | 'status'>[]>;
  enqueueJobs(jobs: readonly StructureJobContract[]): Promise<StructureJobEnqueueResult>;
}

export interface NextOpenDigestPreparationPort {
  prepareDigest(digestPreparation: NextOpenDigestPreparationContract): Promise<WorkerSchedulerPortResult>;
}

export interface WorkerSchedulerPortResult {
  ok: boolean;
  errors: string[];
}

export interface StructureJobEnqueueResult extends WorkerSchedulerPortResult {
  enqueuedCount: number;
}

export interface RuntimePortAttemptResult extends WorkerSchedulerPortResult {
  attempted: boolean;
}

export interface RuntimeEnqueueAttemptResult extends StructureJobEnqueueResult {
  attempted: boolean;
}

export interface BlockChangedSchedulerFlowInput extends BlockChangedInput {
  ports: {
    blockChangedPersistence: BlockChangedPersistencePort;
  };
}

export interface BlockChangedSchedulerFlowResult {
  blockChanged: BlockChangedResult;
  persistence: RuntimePortAttemptResult;
  structureJobs: [];
  aiCalls: [];
  providerCalls: [];
  operationRoutingCalls: [];
  auditWrites: [];
  errors: string[];
}

export interface StructureTriggerSchedulerFlowInput {
  workspaceId: string;
  noteId: string;
  triggerReason: StructureTriggerReason;
  now: number;
  ports: {
    noteSnapshot: SchedulerNoteSnapshotPort;
    structureJobQueue: StructureJobQueuePort;
    nextOpenDigestPreparation: NextOpenDigestPreparationPort;
  };
  targetScope?: StructureTargetScope;
  wholeNoteReason?: WholeNoteStructureReason;
}

export interface StructureTriggerSchedulerFlowResult {
  plan: StructureJobPlanContract;
  enqueue: RuntimeEnqueueAttemptResult;
  digestPreparation: RuntimePortAttemptResult;
  providerCalls: [];
  operationRoutingCalls: [];
  auditWrites: [];
  errors: string[];
}

export async function runBlockChangedSchedulerFlow(
  input: BlockChangedSchedulerFlowInput,
): Promise<BlockChangedSchedulerFlowResult> {
  const { ports, ...blockChangedInput } = input;
  const blockChanged = handleBlockChanged(blockChangedInput);

  if (!isValidBlockChangedResult(blockChanged)) {
    return {
      blockChanged,
      persistence: noPortAttempt(),
      structureJobs: [],
      aiCalls: [],
      providerCalls: [],
      operationRoutingCalls: [],
      auditWrites: [],
      errors: blockChanged.errors,
    };
  }

  const persistence = await persistBlockChanged(ports.blockChangedPersistence, blockChanged);

  return {
    blockChanged,
    persistence,
    structureJobs: [],
    aiCalls: [],
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors: persistence.errors,
  };
}

function isValidBlockChangedResult(result: BlockChangedResult): result is ValidBlockChangedResult {
  return result.errors.length === 0 && 'editEvent' in result && 'dirtyScopeMark' in result;
}

export async function runStructureTriggerSchedulerFlow(
  input: StructureTriggerSchedulerFlowInput,
): Promise<StructureTriggerSchedulerFlowResult> {
  const planInput: PlanStructureJobsInput = {
    workspaceId: input.workspaceId,
    noteId: input.noteId,
    triggerReason: input.triggerReason,
    sections: [],
    now: input.now,
    ...(input.targetScope === undefined ? {} : { targetScope: input.targetScope }),
    ...(input.wholeNoteReason === undefined ? {} : { wholeNoteReason: input.wholeNoteReason }),
  };
  const inputValidation = validateStructurePlanRequest(planInput);
  if (!inputValidation.valid) {
    return {
      plan: {
        jobs: [],
        skippedJobs: [],
        errors: inputValidation.errors,
      },
      enqueue: noEnqueueAttempt(),
      digestPreparation: noPortAttempt(),
      providerCalls: [],
      operationRoutingCalls: [],
      auditWrites: [],
      errors: inputValidation.errors,
    };
  }

  const sectionResult = await loadSections(input.ports.noteSnapshot, {
    workspaceId: input.workspaceId,
    noteId: input.noteId,
  });
  if (!sectionResult.ok) {
    return failedStructureTriggerResult(sectionResult.errors);
  }

  const completedJobsResult = await listCompletedJobs(input.ports.structureJobQueue, {
    workspaceId: input.workspaceId,
    noteId: input.noteId,
  });
  if (!completedJobsResult.ok) {
    return failedStructureTriggerResult(completedJobsResult.errors);
  }

  planInput.sections = sectionResult.sections;
  planInput.completedJobs = completedJobsResult.completedJobs;
  const plan = planStructureJobs(planInput);
  const enqueue = await enqueueStructureJobs(input.ports.structureJobQueue, plan.jobs);
  const digestPreparation = plan.digestPreparation === undefined
    ? noPortAttempt()
    : await prepareNextOpenDigest(input.ports.nextOpenDigestPreparation, plan.digestPreparation);

  return {
    plan,
    enqueue,
    digestPreparation,
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors: [
      ...plan.errors,
      ...enqueue.errors,
      ...digestPreparation.errors,
    ],
  };
}

async function loadSections(
  port: SchedulerNoteSnapshotPort,
  input: { workspaceId: string; noteId: string },
): Promise<{ ok: true; sections: SectionContract[] } | { ok: false; errors: string[] }> {
  try {
    return {
      ok: true,
      sections: await port.loadSections(input),
    };
  } catch (error) {
    return {
      ok: false,
      errors: [toPortErrorMessage('section snapshot load failed', error)],
    };
  }
}

async function listCompletedJobs(
  port: StructureJobQueuePort,
  input: { workspaceId: string; noteId: string },
): Promise<{
  ok: true;
  completedJobs: Pick<StructureJobContract, 'contextHash' | 'status'>[];
} | {
  ok: false;
  errors: string[];
}> {
  try {
    return {
      ok: true,
      completedJobs: await port.listCompletedJobs(input),
    };
  } catch (error) {
    return {
      ok: false,
      errors: [toPortErrorMessage('completed structure job lookup failed', error)],
    };
  }
}

function failedStructureTriggerResult(errors: string[]): StructureTriggerSchedulerFlowResult {
  return {
    plan: {
      jobs: [],
      skippedJobs: [],
      errors,
    },
    enqueue: noEnqueueAttempt(),
    digestPreparation: noPortAttempt(),
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors,
  };
}

async function persistBlockChanged(
  port: BlockChangedPersistencePort,
  output: ValidBlockChangedResult,
): Promise<RuntimePortAttemptResult> {
  try {
    return {
      attempted: true,
      ...await port.persistBlockChanged(output),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      errors: [toPortErrorMessage('BlockChanged persistence failed', error)],
    };
  }
}

async function enqueueStructureJobs(
  port: StructureJobQueuePort,
  jobs: readonly StructureJobContract[],
): Promise<RuntimeEnqueueAttemptResult> {
  try {
    return {
      attempted: true,
      ...await port.enqueueJobs(jobs),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      enqueuedCount: 0,
      errors: [toPortErrorMessage('structure job enqueue failed', error)],
    };
  }
}

async function prepareNextOpenDigest(
  port: NextOpenDigestPreparationPort,
  digestPreparation: NextOpenDigestPreparationContract,
): Promise<RuntimePortAttemptResult> {
  try {
    return {
      attempted: true,
      ...await port.prepareDigest(digestPreparation),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      errors: [toPortErrorMessage('next open digest preparation failed', error)],
    };
  }
}

function noPortAttempt(): RuntimePortAttemptResult {
  return {
    attempted: false,
    ok: true,
    errors: [],
  };
}

function noEnqueueAttempt(): RuntimeEnqueueAttemptResult {
  return {
    attempted: false,
    ok: true,
    enqueuedCount: 0,
    errors: [],
  };
}

function toPortErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `${prefix}: ${error.trim()}`;
  }

  return prefix;
}
