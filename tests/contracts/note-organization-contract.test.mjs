import assert from 'node:assert/strict';
import test from 'node:test';

import {
  organizationTrustGuards,
  shouldAutoApplyOrganization,
  validateCaptureEntry,
  validateOrganizationPreferences,
  validateOrganizationRun,
  validateOrganizedNoteVersion,
} from '../../contexts/note-model/src/contract/noteContract.ts';
import { blockFixtures, noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const now = 1_764_000_000_000;

const preferences = {
  workspaceId: noteFixture.workspaceId,
  userId: 'user_001',
  prompt: 'Keep my notes concise, structured, and useful for later creative work.',
  autoOrganizeDefaultEnabled: true,
  fixedTrustGuards: organizationTrustGuards,
  updatedAt: now,
};

const captureEntry = {
  id: 'capture_001',
  workspaceId: noteFixture.workspaceId,
  noteId: noteFixture.id,
  kind: 'note_leave',
  content: 'Loose capture about protecting writing flow.',
  contentHash: 'hash_capture_001',
  sourceBlockIds: ['block_paragraph_001'],
  capturedAt: now,
};

test('capture entries are source-backed read logs for organized note versions', () => {
  assert.deepEqual(validateCaptureEntry(captureEntry), { valid: true, errors: [] });

  const invalid = validateCaptureEntry({
    ...captureEntry,
    sourceBlockIds: [],
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, ['sourceBlockIds must contain at least one source block id']);
});

test('organization preferences keep trust guards stronger than free prompts', () => {
  assert.deepEqual(validateOrganizationPreferences(preferences), { valid: true, errors: [] });

  const invalid = validateOrganizationPreferences({
    ...preferences,
    fixedTrustGuards: ['restorable_history'],
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, [
    'fixedTrustGuards must include restorable_history, source_inspectable_related_context, no_unbacked_claims_in_organized_body, no_information_loss_without_history',
  ]);
});

test('note-level setting disables automatic organized layer reflection only', () => {
  assert.equal(shouldAutoApplyOrganization({ preferences }), true);
  assert.equal(
    shouldAutoApplyOrganization({
      preferences,
      noteSettings: {
        noteId: noteFixture.id,
        autoOrganizeEnabled: false,
        updatedAt: now,
      },
    }),
    false,
  );
});

test('organized note versions require capture references and valid organized blocks', () => {
  const version = {
    id: 'organized_version_001',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    organizationRunId: 'organization_run_001',
    sourceCaptureEntryIds: [captureEntry.id],
    blocks: [
      {
        ...blockFixtures[0],
        origin: 'system',
      },
      {
        ...blockFixtures[1],
        origin: 'system',
        plainText: 'The MVP protects writing flow before integrations.',
        contentJson: { text: 'The MVP protects writing flow before integrations.' },
      },
    ],
    relatedContextReferences: [
      {
        id: 'related_context_001',
        workspaceId: noteFixture.workspaceId,
        noteId: noteFixture.id,
        kind: 'note',
        targetId: 'note_related_001',
        title: 'Unified surface principle',
        reason: 'Related prior note about keeping AI secondary.',
        sourceInspectable: true,
      },
    ],
    createdAt: now,
  };

  assert.deepEqual(validateOrganizedNoteVersion(version), { valid: true, errors: [] });

  const invalid = validateOrganizedNoteVersion({
    ...version,
    sourceCaptureEntryIds: [],
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0], 'sourceCaptureEntryIds must contain at least one capture entry id');
});

test('organized note version related context references remain owned by the version note', () => {
  const invalid = validateOrganizedNoteVersion({
    id: 'organized_version_002',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    organizationRunId: 'organization_run_002',
    sourceCaptureEntryIds: [captureEntry.id],
    blocks: [
      {
        ...blockFixtures[1],
        origin: 'system',
      },
    ],
    relatedContextReferences: [
      {
        id: 'related_context_cross_note_001',
        workspaceId: 'workspace_other',
        noteId: 'note_other',
        kind: 'note',
        targetId: 'note_related_001',
        title: 'Related note',
        reason: 'Related context must still belong to this organized version note.',
        sourceInspectable: true,
      },
    ],
    createdAt: now,
  });

  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, [
    'relatedContextReferences[0].workspaceId must match organized note version workspaceId',
    'relatedContextReferences[0].noteId must match organized note version noteId',
  ]);
});

test('organization runs distinguish completed versions from non-destructive failures', () => {
  const completed = {
    id: 'organization_run_001',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    trigger: 'note_closed',
    status: 'completed',
    sourceCaptureEntryIds: [captureEntry.id],
    preferencesSnapshot: preferences,
    autoApplied: true,
    organizedVersionId: 'organized_version_001',
    createdAt: now,
    updatedAt: now,
  };

  assert.deepEqual(validateOrganizationRun(completed), { valid: true, errors: [] });

  const failed = {
    ...completed,
    id: 'organization_run_failed_001',
    status: 'failed',
    autoApplied: false,
    organizedVersionId: undefined,
    failureReason: 'provider unavailable',
  };

  assert.deepEqual(validateOrganizationRun(failed), { valid: true, errors: [] });

  const invalid = validateOrganizationRun({
    ...completed,
    status: 'failed',
    failureReason: undefined,
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /failed organization run must include failureReason/);
});

test('organization runs require usable capture entry ids', () => {
  const invalid = validateOrganizationRun({
    id: 'organization_run_invalid_capture_001',
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    trigger: 'note_closed',
    status: 'queued',
    sourceCaptureEntryIds: ['capture_001', ' ', 123],
    preferencesSnapshot: preferences,
    autoApplied: false,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, [
    'sourceCaptureEntryIds[1] must be a non-empty string',
    'sourceCaptureEntryIds[2] must be a non-empty string',
  ]);
});
