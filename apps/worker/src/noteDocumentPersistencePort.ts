// Runtime port for canonical Note / Section / Block document persistence.
// Authority: docs/contracts/app-note-model.md
// Companion: docs/contracts/data-model.md, docs/contracts/backend-runtime.md

import {
  isHeadingLevel,
  type BlockContract,
  type NoteContract,
  type NoteDocumentContract,
  type SectionContract,
  validateBlockContract,
} from '../../../contexts/note-model/src/contract/noteContract.ts';

export interface NoteDocumentLoadRequest {
  workspaceId: string;
  noteId: string;
}

export interface NoteDocumentPersistenceResult {
  ok: boolean;
  errors: string[];
}

export interface NoteDocumentSaveResult extends NoteDocumentPersistenceResult {
  document?: NoteDocumentContract;
}

export interface NoteDocumentLoadResult extends NoteDocumentPersistenceResult {
  document?: NoteDocumentContract;
}

export interface NoteDocumentPersistencePort {
  saveDocument(document: NoteDocumentContract): Promise<NoteDocumentSaveResult>;
  loadDocument(input: NoteDocumentLoadRequest): Promise<NoteDocumentLoadResult>;
}

export class InMemoryNoteDocumentPersistencePort implements NoteDocumentPersistencePort {
  private readonly documents = new Map<string, NoteDocumentContract>();

  constructor(initialDocuments: readonly NoteDocumentContract[] = []) {
    for (const document of initialDocuments) {
      const errors = validateNoteDocumentForPersistence(document);
      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }
      this.documents.set(documentKey(document.note.workspaceId, document.note.id), cloneDocument(document));
    }
  }

  async saveDocument(document: NoteDocumentContract): Promise<NoteDocumentSaveResult> {
    const errors = validateNoteDocumentForPersistence(document);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const stored = cloneDocument(document);
    this.documents.set(documentKey(stored.note.workspaceId, stored.note.id), stored);

    return {
      ok: true,
      errors: [],
      document: cloneDocument(stored),
    };
  }

  async loadDocument(input: NoteDocumentLoadRequest): Promise<NoteDocumentLoadResult> {
    const errors = validateLoadRequest(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const document = this.documents.get(documentKey(input.workspaceId, input.noteId));
    if (document === undefined) {
      return {
        ok: false,
        errors: ['note document not found'],
      };
    }

    return {
      ok: true,
      errors: [],
      document: cloneDocument(document),
    };
  }
}

export function validateNoteDocumentForPersistence(document: unknown): string[] {
  const errors: string[] = [];
  const candidate = asRecord(document);

  if (!candidate) {
    return ['note document must be an object'];
  }

  const noteErrors = validateNoteForPersistence(candidate.note);
  errors.push(...noteErrors.map((error) => `note.${error}`));

  const note = asRecord(candidate.note);
  const noteId = typeof note?.id === 'string' ? note.id : undefined;

  if (!Array.isArray(candidate.sections)) {
    errors.push('sections must be an array');
  } else {
    for (const [index, section] of candidate.sections.entries()) {
      const sectionErrors = validateSectionForPersistence(section, noteId);
      errors.push(...sectionErrors.map((error) => `sections[${index}].${error}`));
    }
    errors.push(...validateUniqueIds(candidate.sections, 'sections', 'section id'));
  }

  if (!Array.isArray(candidate.blocks)) {
    errors.push('blocks must be an array');
  } else {
    const sectionIds = new Set(
      Array.isArray(candidate.sections)
        ? candidate.sections
          .map((section) => asRecord(section)?.id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [],
    );

    for (const [index, block] of candidate.blocks.entries()) {
      const blockErrors = validateBlockForPersistence(block, noteId, sectionIds);
      errors.push(...blockErrors.map((error) => `blocks[${index}].${error}`));
    }
    errors.push(...validateUniqueIds(candidate.blocks, 'blocks', 'block id'));
  }

  if (Array.isArray(candidate.sections) && Array.isArray(candidate.blocks)) {
    errors.push(...validateDocumentReferences(candidate.sections, candidate.blocks));
  }

  return errors;
}

export function validateLoadRequest(input: unknown): string[] {
  const errors: string[] = [];
  const request = asRecord(input);

  if (!request) {
    return ['load request must be an object'];
  }

  if (!isNonEmptyString(request.workspaceId)) {
    errors.push('workspaceId must be a non-empty string');
  }
  if (!isNonEmptyString(request.noteId)) {
    errors.push('noteId must be a non-empty string');
  }

  return errors;
}

export function validateNoteForPersistence(note: unknown): string[] {
  const errors: string[] = [];
  const candidate = asRecord(note);

  if (!candidate) {
    return ['must be an object'];
  }

  for (const field of ['id', 'workspaceId', 'title'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of ['descriptionUser', 'descriptionAi', 'descriptionEffective'] as const) {
    if (candidate[field] !== undefined && !isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string when provided`);
    }
  }

  if (candidate.descriptionAiApproved !== undefined && typeof candidate.descriptionAiApproved !== 'boolean') {
    errors.push('descriptionAiApproved must be a boolean when provided');
  }

  if (!isFiniteTimestamp(candidate.createdAt)) {
    errors.push('createdAt must be a finite timestamp');
  }
  if (!isFiniteTimestamp(candidate.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  return errors;
}

export function validateSectionForPersistence(section: unknown, expectedNoteId?: string): string[] {
  const errors: string[] = [];
  const candidate = asRecord(section);

  if (!candidate) {
    return ['must be an object'];
  }

  for (const field of ['id', 'noteId', 'contentHash'] as const) {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(expectedNoteId) && candidate.noteId !== expectedNoteId) {
    errors.push('noteId must match document note.id');
  }

  for (const field of ['parentSectionId', 'headingBlockId', 'title', 'descriptionAi', 'lastStructuredHash'] as const) {
    if (candidate[field] !== undefined && !isNonEmptyString(candidate[field])) {
      errors.push(`${field} must be a non-empty string when provided`);
    }
  }

  if (candidate.headingLevel !== undefined && (typeof candidate.headingLevel !== 'number' || !isHeadingLevel(candidate.headingLevel))) {
    errors.push('headingLevel must be H1, H2, or H3 when provided');
  }

  if (candidate.lastStructuredAt !== undefined && !isFiniteTimestamp(candidate.lastStructuredAt)) {
    errors.push('lastStructuredAt must be a finite timestamp when provided');
  }

  if (typeof candidate.isDirty !== 'boolean') {
    errors.push('isDirty must be a boolean');
  }
  if (!isFiniteNumber(candidate.position)) {
    errors.push('position must be a finite number');
  }
  if (!isFiniteTimestamp(candidate.createdAt)) {
    errors.push('createdAt must be a finite timestamp');
  }
  if (!isFiniteTimestamp(candidate.updatedAt)) {
    errors.push('updatedAt must be a finite timestamp');
  }

  return errors;
}

export function validateBlockForPersistence(
  block: unknown,
  expectedNoteId: string | undefined,
  sectionIds: ReadonlySet<string>,
): string[] {
  const errors = validateBlockContract(block).errors;
  const candidate = asRecord(block);

  if (!candidate) {
    return errors;
  }

  if (isNonEmptyString(expectedNoteId) && candidate.noteId !== expectedNoteId) {
    errors.push('block noteId must match document note.id');
  }

  if (candidate.sectionId !== undefined && typeof candidate.sectionId === 'string' && !sectionIds.has(candidate.sectionId)) {
    errors.push('block sectionId must reference a document section');
  }

  return errors;
}

function validateUniqueIds(items: readonly unknown[], prefix: string, label: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    const id = asRecord(item)?.id;
    if (typeof id !== 'string' || id.trim().length === 0) {
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${prefix}[${index}].${label} must be unique`);
    }
    seen.add(id);
  }

  return errors;
}

function validateDocumentReferences(sections: readonly unknown[], blocks: readonly unknown[]): string[] {
  const errors: string[] = [];
  const sectionIds = new Set(
    sections
      .map((section) => asRecord(section)?.id)
      .filter((id): id is string => isNonEmptyString(id)),
  );
  const blockById = new Map<string, Record<string, unknown>>();

  for (const block of blocks) {
    const record = asRecord(block);
    if (!record || !isNonEmptyString(record.id)) {
      continue;
    }
    blockById.set(record.id, record);
  }

  for (const [index, section] of sections.entries()) {
    const record = asRecord(section);
    if (!record) {
      continue;
    }
    if (typeof record.parentSectionId === 'string' && !sectionIds.has(record.parentSectionId)) {
      errors.push(`sections[${index}].parentSectionId must reference a document section`);
    }
    if (typeof record.headingBlockId === 'string') {
      const headingBlock = blockById.get(record.headingBlockId);
      if (headingBlock === undefined) {
        errors.push(`sections[${index}].headingBlockId must reference a document block`);
      } else {
        if (headingBlock.type !== 'heading') {
          errors.push(`sections[${index}].headingBlockId must reference a heading block`);
        }
        if (isNonEmptyString(record.id) && headingBlock.sectionId !== record.id) {
          errors.push(`sections[${index}].headingBlockId must reference a block in the same section`);
        }
      }
    }
  }

  for (const [index, block] of blocks.entries()) {
    const record = asRecord(block);
    if (!record) {
      continue;
    }
    if (typeof record.parentBlockId === 'string' && !blockById.has(record.parentBlockId)) {
      errors.push(`blocks[${index}].parentBlockId must reference a document block`);
    }
  }

  return errors;
}

function cloneDocument(document: NoteDocumentContract): NoteDocumentContract {
  return {
    note: { ...document.note },
    sections: document.sections.map((section) => ({ ...section })),
    blocks: document.blocks.map((block) => ({
      ...block,
      contentJson: structuredClone(block.contentJson),
    })),
    ...(document.implicitChunks === undefined
      ? {}
      : {
          implicitChunks: document.implicitChunks.map((chunk) => ({
            ...chunk,
            sourceBlockIds: [...chunk.sourceBlockIds],
          })),
        }),
  };
}

function documentKey(workspaceId: string, noteId: string): string {
  return `${workspaceId}:${noteId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteTimestamp(value: unknown): value is number {
  return isFiniteNumber(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
