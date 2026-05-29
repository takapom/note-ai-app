// Runtime port for workspace-scoped Note Library summaries.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/app-note-model.md, docs/contracts/data-model.md

import type { NoteDocumentContract } from '../../../../contexts/note-model/src/contract/noteContract.ts';

export interface NoteListRequest {
  workspaceId: string;
}

export interface NoteListItem {
  noteId: string;
  title: string;
  descriptionEffective?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NoteListResult {
  ok: boolean;
  errors: string[];
  notes?: readonly NoteListItem[];
}

export interface NoteListPort {
  listNotes(input: NoteListRequest): Promise<NoteListResult>;
}

export class InMemoryNoteListPort implements NoteListPort {
  constructor(initialDocuments: readonly NoteDocumentContract[] = []) {
    const notes = initialDocuments.map((document, index) => {
      const item = noteDocumentToListItem(document);
      const errors = validateNoteListItem(item, index);
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }
      return {
        workspaceId: document.note.workspaceId,
        item,
      };
    });
    this.scopedNotes = notes;
  }

  private readonly scopedNotes: readonly { workspaceId: string; item: NoteListItem }[];

  async listNotes(input: NoteListRequest): Promise<NoteListResult> {
    const errors = validateNoteListRequest(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      errors: [],
      notes: this.scopedNotes
        .filter((note) => note.workspaceId === input.workspaceId)
        .map((note) => ({ ...note.item }))
        .sort(compareNoteListItems),
    };
  }
}

export function noteDocumentToListItem(document: NoteDocumentContract): NoteListItem {
  return {
    noteId: document.note.id,
    title: document.note.title,
    ...(document.note.descriptionEffective === undefined
      ? {}
      : { descriptionEffective: document.note.descriptionEffective }),
    createdAt: document.note.createdAt,
    updatedAt: document.note.updatedAt,
  };
}

export function validateNoteListRequest(input: unknown): string[] {
  const candidate = asRecord(input);
  if (!candidate) {
    return ['note list request must be an object'];
  }

  if (!isNonEmptyString(candidate.workspaceId)) {
    return ['workspaceId must be a non-empty string'];
  }

  return [];
}

export function validateNoteListItem(
  item: unknown,
  index: number,
): string[] {
  const errors: string[] = [];
  const candidate = asRecord(item);
  const prefix = `notes[${index}]`;

  if (!candidate) {
    return [`${prefix} must be an object`];
  }

  if (!isNonEmptyString(candidate.noteId)) {
    errors.push(`${prefix}.noteId must be a non-empty string`);
  }
  if (!isNonEmptyString(candidate.title)) {
    errors.push(`${prefix}.title must be a non-empty string`);
  }
  if (candidate.descriptionEffective !== undefined && !isNonEmptyString(candidate.descriptionEffective)) {
    errors.push(`${prefix}.descriptionEffective must be a non-empty string when provided`);
  }
  if (!isFiniteTimestamp(candidate.createdAt)) {
    errors.push(`${prefix}.createdAt must be a finite timestamp`);
  }
  if (!isFiniteTimestamp(candidate.updatedAt)) {
    errors.push(`${prefix}.updatedAt must be a finite timestamp`);
  }
  return errors;
}

export function compareNoteListItems(left: NoteListItem, right: NoteListItem): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }
  return left.noteId.localeCompare(right.noteId);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
