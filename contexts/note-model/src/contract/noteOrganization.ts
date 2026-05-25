// Live product semantics for capture/organized note layers.
// Authority: docs/contracts/app-note-model.md
// Companion: docs/contracts/data-model.md, docs/contracts/ai-structuring-lifecycle.md

import type { BlockContract } from './noteTypes.ts';
import { validateBlockContract } from './noteValidation.ts';

export const captureEntryKinds = ['block_save', 'note_leave', 'manual_capture'] as const;
export type CaptureEntryKind = (typeof captureEntryKinds)[number];

export const organizationTriggers = [
  'note_closed',
  'tab_switched',
  'app_left',
  'manual_organize',
] as const;
export type OrganizationTrigger = (typeof organizationTriggers)[number];

export const organizationRunStatuses = ['queued', 'running', 'completed', 'failed', 'skipped'] as const;
export type OrganizationRunStatus = (typeof organizationRunStatuses)[number];

export const relatedContextReferenceKinds = ['note', 'memory'] as const;
export type RelatedContextReferenceKind = (typeof relatedContextReferenceKinds)[number];

export const organizationTrustGuards = [
  'restorable_history',
  'source_inspectable_related_context',
  'no_unbacked_claims_in_organized_body',
  'no_information_loss_without_history',
] as const;
export type OrganizationTrustGuard = (typeof organizationTrustGuards)[number];

export interface CaptureEntryContract {
  id: string;
  workspaceId: string;
  noteId: string;
  kind: CaptureEntryKind;
  content: string;
  contentHash: string;
  sourceBlockIds: readonly string[];
  capturedAt: number;
}

export interface RelatedContextReferenceContract {
  id: string;
  workspaceId: string;
  noteId: string;
  kind: RelatedContextReferenceKind;
  targetId: string;
  title: string;
  reason: string;
  sourceInspectable: true;
}

export interface OrganizationPreferencesContract {
  workspaceId: string;
  userId?: string;
  prompt: string;
  autoOrganizeDefaultEnabled: boolean;
  fixedTrustGuards: readonly OrganizationTrustGuard[];
  updatedAt: number;
}

export interface NoteOrganizationSettingsContract {
  noteId: string;
  autoOrganizeEnabled: boolean;
  updatedAt: number;
}

export interface OrganizedNoteVersionContract {
  id: string;
  workspaceId: string;
  noteId: string;
  organizationRunId: string;
  sourceCaptureEntryIds: readonly string[];
  blocks: readonly BlockContract[];
  relatedContextReferences?: readonly RelatedContextReferenceContract[];
  createdAt: number;
  restoredFromVersionId?: string;
}

export interface OrganizationRunContract {
  id: string;
  workspaceId: string;
  noteId: string;
  trigger: OrganizationTrigger;
  status: OrganizationRunStatus;
  sourceCaptureEntryIds: readonly string[];
  preferencesSnapshot: OrganizationPreferencesContract;
  autoApplied: boolean;
  organizedVersionId?: string;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrganizationValidationResult {
  valid: boolean;
  errors: string[];
}

export function shouldAutoApplyOrganization(input: {
  preferences: Pick<OrganizationPreferencesContract, 'autoOrganizeDefaultEnabled'>;
  noteSettings?: Pick<NoteOrganizationSettingsContract, 'autoOrganizeEnabled'>;
}): boolean {
  return input.noteSettings?.autoOrganizeEnabled ?? input.preferences.autoOrganizeDefaultEnabled;
}

export function validateCaptureEntry(entry: unknown): OrganizationValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(entry);
  if (!candidate) {
    return { valid: false, errors: ['capture entry must be an object'] };
  }

  for (const field of ['id', 'workspaceId', 'noteId', 'content', 'contentHash'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isCaptureEntryKind(candidate.kind)) {
    errors.push(`kind must be one of ${captureEntryKinds.join(', ')}`);
  }
  if (!Array.isArray(candidate.sourceBlockIds) || candidate.sourceBlockIds.length === 0) {
    errors.push('sourceBlockIds must contain at least one source block id');
  } else {
    for (const [index, blockId] of candidate.sourceBlockIds.entries()) {
      if (!isNonEmptyString(blockId)) {
        errors.push(`sourceBlockIds[${index}] must be a non-empty string`);
      }
    }
  }
  if (!isFiniteTimestamp(candidate.capturedAt)) {
    errors.push('capturedAt must be a finite timestamp');
  }

  return { valid: errors.length === 0, errors };
}

export function validateOrganizationPreferences(
  preferences: unknown,
): OrganizationValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(preferences);
  if (!candidate) {
    return { valid: false, errors: ['organization preferences must be an object'] };
  }

  if (!isNonEmptyString(candidate.workspaceId)) {
    errors.push('workspaceId must be a non-empty string');
  }
  if (candidate.userId !== undefined && !isNonEmptyString(candidate.userId)) {
    errors.push('userId must be a non-empty string when provided');
  }
  if (!isNonEmptyString(candidate.prompt)) {
    errors.push('prompt must be a non-empty string');
  }
  if (typeof candidate.autoOrganizeDefaultEnabled !== 'boolean') {
    errors.push('autoOrganizeDefaultEnabled must be a boolean');
  }
  if (!hasAllFixedTrustGuards(candidate.fixedTrustGuards)) {
    errors.push(`fixedTrustGuards must include ${organizationTrustGuards.join(', ')}`);
  }
  if (!isFiniteTimestamp(candidate.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  return { valid: errors.length === 0, errors };
}

export function validateNoteOrganizationSettings(
  settings: unknown,
): OrganizationValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(settings);
  if (!candidate) {
    return { valid: false, errors: ['note organization settings must be an object'] };
  }

  if (!isNonEmptyString(candidate.noteId)) {
    errors.push('noteId must be a non-empty string');
  }
  if (typeof candidate.autoOrganizeEnabled !== 'boolean') {
    errors.push('autoOrganizeEnabled must be a boolean');
  }
  if (!isFiniteTimestamp(candidate.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  return { valid: errors.length === 0, errors };
}

export function validateOrganizedNoteVersion(
  version: unknown,
): OrganizationValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(version);
  if (!candidate) {
    return { valid: false, errors: ['organized note version must be an object'] };
  }

  for (const field of ['id', 'workspaceId', 'noteId', 'organizationRunId'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(candidate.sourceCaptureEntryIds) || candidate.sourceCaptureEntryIds.length === 0) {
    errors.push('sourceCaptureEntryIds must contain at least one capture entry id');
  } else {
    for (const [index, entryId] of candidate.sourceCaptureEntryIds.entries()) {
      if (!isNonEmptyString(entryId)) {
        errors.push(`sourceCaptureEntryIds[${index}] must be a non-empty string`);
      }
    }
  }
  if (!Array.isArray(candidate.blocks) || candidate.blocks.length === 0) {
    errors.push('blocks must contain at least one organized block');
  } else {
    for (const [index, block] of candidate.blocks.entries()) {
      errors.push(...validateBlockContract(block).errors.map((error) => `blocks[${index}].${error}`));
      const blockRecord = asRecord(block);
      if (isNonEmptyString(candidate.noteId) && blockRecord?.noteId !== candidate.noteId) {
        errors.push(`blocks[${index}].noteId must match organized note version noteId`);
      }
    }
  }
  if (candidate.relatedContextReferences !== undefined) {
    if (!Array.isArray(candidate.relatedContextReferences)) {
      errors.push('relatedContextReferences must be an array when provided');
    } else {
      for (const [index, reference] of candidate.relatedContextReferences.entries()) {
        errors.push(...validateRelatedContextReference(reference).errors.map((error) =>
          `relatedContextReferences[${index}].${error}`,
        ));
        const referenceRecord = asRecord(reference);
        if (isNonEmptyString(candidate.workspaceId) && referenceRecord?.workspaceId !== candidate.workspaceId) {
          errors.push(`relatedContextReferences[${index}].workspaceId must match organized note version workspaceId`);
        }
        if (isNonEmptyString(candidate.noteId) && referenceRecord?.noteId !== candidate.noteId) {
          errors.push(`relatedContextReferences[${index}].noteId must match organized note version noteId`);
        }
      }
    }
  }
  if (!isFiniteTimestamp(candidate.createdAt)) {
    errors.push('createdAt must be a finite timestamp');
  }
  if (candidate.restoredFromVersionId !== undefined && !isNonEmptyString(candidate.restoredFromVersionId)) {
    errors.push('restoredFromVersionId must be a non-empty string when provided');
  }

  return { valid: errors.length === 0, errors };
}

export function validateOrganizationRun(run: unknown): OrganizationValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(run);
  if (!candidate) {
    return { valid: false, errors: ['organization run must be an object'] };
  }

  for (const field of ['id', 'workspaceId', 'noteId'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isOrganizationTrigger(candidate.trigger)) {
    errors.push(`trigger must be one of ${organizationTriggers.join(', ')}`);
  }
  if (!isOrganizationRunStatus(candidate.status)) {
    errors.push(`status must be one of ${organizationRunStatuses.join(', ')}`);
  }
  if (!Array.isArray(candidate.sourceCaptureEntryIds) || candidate.sourceCaptureEntryIds.length === 0) {
    errors.push('sourceCaptureEntryIds must contain at least one capture entry id');
  } else {
    for (const [index, entryId] of candidate.sourceCaptureEntryIds.entries()) {
      if (!isNonEmptyString(entryId)) {
        errors.push(`sourceCaptureEntryIds[${index}] must be a non-empty string`);
      }
    }
  }
  errors.push(...validateOrganizationPreferences(candidate.preferencesSnapshot).errors.map((error) =>
    `preferencesSnapshot.${error}`,
  ));
  if (typeof candidate.autoApplied !== 'boolean') {
    errors.push('autoApplied must be a boolean');
  }
  if (candidate.status === 'completed' && !isNonEmptyString(candidate.organizedVersionId)) {
    errors.push('completed organization run must include organizedVersionId');
  }
  if (candidate.status === 'failed' && !isNonEmptyString(candidate.failureReason)) {
    errors.push('failed organization run must include failureReason');
  }
  if (candidate.status !== 'failed' && candidate.failureReason !== undefined) {
    errors.push('failureReason is only allowed for failed organization runs');
  }
  if (!isFiniteTimestamp(candidate.createdAt)) {
    errors.push('createdAt must be a finite timestamp');
  }
  if (!isFiniteTimestamp(candidate.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  return { valid: errors.length === 0, errors };
}

function validateRelatedContextReference(reference: unknown): OrganizationValidationResult {
  const errors: string[] = [];
  const candidate = asRecord(reference);
  if (!candidate) {
    return { valid: false, errors: ['reference must be an object'] };
  }

  for (const field of ['id', 'workspaceId', 'noteId', 'targetId', 'title', 'reason'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isRelatedContextReferenceKind(candidate.kind)) {
    errors.push(`kind must be one of ${relatedContextReferenceKinds.join(', ')}`);
  }
  if (candidate.sourceInspectable !== true) {
    errors.push('sourceInspectable must be true');
  }

  return { valid: errors.length === 0, errors };
}

function hasAllFixedTrustGuards(value: unknown): value is readonly OrganizationTrustGuard[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return organizationTrustGuards.every((guard) => value.includes(guard));
}

function isCaptureEntryKind(value: unknown): value is CaptureEntryKind {
  return typeof value === 'string' && (captureEntryKinds as readonly string[]).includes(value);
}

function isOrganizationTrigger(value: unknown): value is OrganizationTrigger {
  return typeof value === 'string' && (organizationTriggers as readonly string[]).includes(value);
}

function isOrganizationRunStatus(value: unknown): value is OrganizationRunStatus {
  return typeof value === 'string' && (organizationRunStatuses as readonly string[]).includes(value);
}

function isRelatedContextReferenceKind(value: unknown): value is RelatedContextReferenceKind {
  return typeof value === 'string' && (relatedContextReferenceKinds as readonly string[]).includes(value);
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
