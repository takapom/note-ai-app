import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeStructureJob,
  discoverDirtySections,
  handleBlockChanged,
  isWholeNoteScopeAllowed,
  noteCloseFlowSteps,
  planStructureJobs,
  shouldEnqueueStructureJob,
  validateStructurePlanRequest,
} from '../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  blockChangedInputFixture,
  completedSectionJobFixture,
  dirtyFlagSectionFixture,
  dirtySectionFixture,
  schedulerNow,
  schedulerSectionsFixture,
  unchangedSectionFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';
import { noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const planBase = {
  workspaceId: noteFixture.workspaceId,
  noteId: noteFixture.id,
  sections: schedulerSectionsFixture,
  now: schedulerNow,
};

test('BlockChanged saves blocks, records edit event, marks dirty, and does not create structure work', () => {
  const result = handleBlockChanged(blockChangedInputFixture);

  assert.deepEqual(result.savedBlocks, [
    {
      blockId: 'block_paragraph_001',
      noteId: noteFixture.id,
      sectionId: blockChangedInputFixture.sectionId,
      contentHash: 'hash_block_paragraph_001_changed',
      savedAt: schedulerNow,
    },
  ]);
  assert.equal(result.editEvent.type, 'BlockChanged');
  assert.equal(result.dirtyScopeMark.targetScope, 'section');
  assert.equal(result.dirtyScopeMark.isDirty, true);
  assert.equal(result.lightweightIndexUpdate.blockId, blockChangedInputFixture.blockId);
  assert.deepEqual(result.structureJobs, []);
  assert.deepEqual(result.aiCalls, []);
  assert.deepEqual(result.errors, []);
});

test('invalid BlockChanged primitives do not create save intents or dirty marks', () => {
  const result = handleBlockChanged({
    blockId: '',
    noteId: ' ',
    sectionId: '',
    contentHash: '',
    previousContentHash: ' ',
    now: Number.NaN,
  });

  assert.deepEqual(result.savedBlocks, []);
  assert.deepEqual(result.structureJobs, []);
  assert.deepEqual(result.aiCalls, []);
  assert.deepEqual(result.errors, [
    'blockId must be a non-empty string',
    'noteId must be a non-empty string',
    'sectionId must be a non-empty string',
    'contentHash must be a non-empty string',
    'previousContentHash must be a non-empty string when provided',
    'now must be a finite number',
  ]);
  assert.equal('editEvent' in result, false);
  assert.equal('dirtyScopeMark' in result, false);
});

test('primary leave triggers create section jobs from dirty sections only', () => {
  for (const triggerReason of ['note_closed', 'tab_switched', 'app_left']) {
    const plan = planStructureJobs({
      ...planBase,
      triggerReason,
    });

    assert.deepEqual(plan.errors, []);
    assert.equal(plan.jobs.length, 2);
    assert.deepEqual(
      plan.jobs.map((job) => [job.triggerReason, job.targetScope, job.sectionId, job.status]),
      [
        [triggerReason, 'section', dirtySectionFixture.id, 'queued'],
        [triggerReason, 'section', dirtyFlagSectionFixture.id, 'queued'],
      ],
    );
    assert.ok(plan.jobs.every((job) => job.contextHash.startsWith(`section:${noteFixture.id}:`)));
  }
});

test('dirty discovery excludes unchanged sections', () => {
  const dirtySections = discoverDirtySections(schedulerSectionsFixture);

  assert.deepEqual(
    dirtySections.map((section) => section.id),
    [dirtySectionFixture.id, dirtyFlagSectionFixture.id],
  );
  assert.equal(dirtySections.includes(unchangedSectionFixture), false);

  const cleanPlan = planStructureJobs({
    ...planBase,
    triggerReason: 'note_closed',
    sections: [unchangedSectionFixture],
  });
  assert.deepEqual(cleanPlan.jobs, []);
});

test('invalid dirty section primitives are rejected before job creation', () => {
  const plan = planStructureJobs({
    ...planBase,
    triggerReason: 'note_closed',
    sections: [
      {
        ...dirtySectionFixture,
        id: '',
        contentHash: '',
        lastStructuredHash: 'old',
      },
    ],
  });

  assert.deepEqual(plan.jobs, []);
  assert.deepEqual(plan.skippedJobs, []);
  assert.deepEqual(plan.errors, [
    'dirty section id must be a non-empty string',
    'dirty section contentHash must be a non-empty string',
  ]);
});

test('dirty sections from another note are rejected before job creation', () => {
  const plan = planStructureJobs({
    ...planBase,
    triggerReason: 'note_closed',
    sections: [
      {
        ...dirtySectionFixture,
        noteId: 'note_other',
      },
    ],
  });

  assert.deepEqual(plan.jobs, []);
  assert.deepEqual(plan.skippedJobs, []);
  assert.deepEqual(plan.errors, ['dirty section noteId must match the structure plan noteId']);
});

test('next_open recovers missed dirty section jobs and prepares digest', () => {
  const plan = planStructureJobs({
    ...planBase,
    triggerReason: 'next_open',
  });

  assert.equal(plan.jobs.length, 2);
  assert.equal(plan.digestPreparation.triggerReason, 'next_open');
  assert.equal(plan.digestPreparation.prepared, true);
  assert.equal(plan.digestPreparation.recoveredJobCount, 2);
});

test('manual_organize allows whole note scope', () => {
  assert.equal(isWholeNoteScopeAllowed('manual_organize'), true);

  const plan = planStructureJobs({
    ...planBase,
    triggerReason: 'manual_organize',
    targetScope: 'note',
  });

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.jobs[0].targetScope, 'note');
  assert.equal(plan.jobs[0].wholeNoteReason, 'manual_organize');
  assert.equal(plan.jobs[0].priority, 'high');
});

test('non-manual whole note scope is limited to description or summary reasons', () => {
  const rejected = planStructureJobs({
    ...planBase,
    triggerReason: 'note_closed',
    targetScope: 'note',
  });
  assert.deepEqual(rejected.jobs, []);
  assert.deepEqual(rejected.errors, ['whole note scope requires description, summary, or manual organize intent']);

  const descriptionPlan = planStructureJobs({
    ...planBase,
    triggerReason: 'note_closed',
    targetScope: 'note',
    wholeNoteReason: 'description',
  });
  assert.deepEqual(descriptionPlan.errors, []);
  assert.equal(descriptionPlan.jobs.length, 1);
  assert.equal(descriptionPlan.jobs[0].wholeNoteReason, 'description');

  const summaryPlan = planStructureJobs({
    ...planBase,
    triggerReason: 'app_left',
    targetScope: 'note',
    wholeNoteReason: 'summary',
  });
  assert.deepEqual(summaryPlan.errors, []);
  assert.equal(summaryPlan.jobs[0].wholeNoteReason, 'summary');
});

test('completed contextHash dedupes a matching structure job', () => {
  const decision = shouldEnqueueStructureJob(
    { contextHash: completedSectionJobFixture.contextHash },
    [completedSectionJobFixture],
  );
  assert.deepEqual(decision, {
    enqueue: false,
    status: 'deduped',
    skipReason: 'completed_context_hash',
  });

  const plan = planStructureJobs({
    ...planBase,
    triggerReason: 'note_closed',
    completedJobs: [completedSectionJobFixture],
  });

  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.jobs[0].sectionId, dirtyFlagSectionFixture.id);
  assert.equal(plan.skippedJobs.length, 1);
  assert.equal(plan.skippedJobs[0].sectionId, dirtySectionFixture.id);
  assert.equal(plan.skippedJobs[0].status, 'deduped');
  assert.equal(plan.skippedJobs[0].skipReason, 'completed_context_hash');
});

test('StructureJob completion is owned by scheduler lifecycle semantics', () => {
  const result = completeStructureJob({
    ...completedSectionJobFixture,
    status: 'running',
    completedAt: undefined,
    startedAt: schedulerNow - 100,
  }, schedulerNow);

  assert.equal(result.ok, true);
  assert.equal(result.job.status, 'completed');
  assert.equal(result.job.completedAt, schedulerNow);

  const invalid = completeStructureJob(completedSectionJobFixture, schedulerNow);
  assert.deepEqual(invalid, {
    ok: false,
    errors: ['structure job status completed is not running'],
  });
});

test('invalid trigger and workspace target scope are rejected by validation', () => {
  const invalidTrigger = validateStructurePlanRequest({
    ...planBase,
    triggerReason: 'block_changed',
    targetScope: 'section',
  });
  assert.equal(invalidTrigger.valid, false);
  assert.ok(invalidTrigger.errors.some((error) => error.startsWith('triggerReason must be one of')));

  const invalidKeystrokeTrigger = validateStructurePlanRequest({
    ...planBase,
    triggerReason: 'keystroke',
    targetScope: 'section',
  });
  assert.equal(invalidKeystrokeTrigger.valid, false);
  assert.ok(invalidKeystrokeTrigger.errors.some((error) => error.startsWith('triggerReason must be one of')));

  const invalidScope = validateStructurePlanRequest({
    ...planBase,
    triggerReason: 'note_closed',
    targetScope: 'workspace',
  });
  assert.equal(invalidScope.valid, false);
  assert.ok(invalidScope.errors.some((error) => error.startsWith('targetScope must be one of')));

  const invalidWholeNote = validateStructurePlanRequest({
    ...planBase,
    triggerReason: 'tab_switched',
    targetScope: 'note',
  });
  assert.equal(invalidWholeNote.valid, false);
  assert.deepEqual(invalidWholeNote.errors, ['whole note scope requires description, summary, or manual organize intent']);
});

test('plan request domain primitives reject blank IDs, missing sections, and non-finite now', () => {
  const invalidRequest = {
    workspaceId: '',
    noteId: '   ',
    triggerReason: 'note_closed',
    now: Number.POSITIVE_INFINITY,
  };
  const validation = validateStructurePlanRequest(invalidRequest);
  const plan = planStructureJobs(invalidRequest);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.errors, [
    'workspaceId must be a non-empty string',
    'noteId must be a non-empty string',
    'sections must be an array',
    'now must be a finite number',
  ]);
  assert.deepEqual(plan.jobs, []);
  assert.deepEqual(plan.skippedJobs, []);
  assert.deepEqual(plan.errors, validation.errors);
});

test('planStructureJobs rejects invalid trigger and chunk scope without jobs or digest', () => {
  const invalidTriggerPlan = planStructureJobs({
    ...planBase,
    triggerReason: 'keystroke',
  });
  assert.deepEqual(invalidTriggerPlan.jobs, []);
  assert.deepEqual(invalidTriggerPlan.skippedJobs, []);
  assert.equal(invalidTriggerPlan.digestPreparation, undefined);
  assert.ok(invalidTriggerPlan.errors.some((error) => error.startsWith('triggerReason must be one of')));

  const chunkPlan = planStructureJobs({
    ...planBase,
    triggerReason: 'next_open',
    targetScope: 'chunk',
  });
  assert.deepEqual(chunkPlan.jobs, []);
  assert.deepEqual(chunkPlan.skippedJobs, []);
  assert.equal(chunkPlan.digestPreparation, undefined);
  assert.deepEqual(chunkPlan.errors, ['chunk target scope is unsupported until stable chunk input is provided']);
});

test('note close flow order is encoded by the scheduler contract', () => {
  assert.deepEqual(noteCloseFlowSteps, [
    'latest_blocks_save',
    'note_session_ended',
    'dirty_sections_discovery',
    'structure_job_enqueue',
    'background_structuring',
    'operations_saved_applied',
    'next_open_digest_prepared',
  ]);
});
