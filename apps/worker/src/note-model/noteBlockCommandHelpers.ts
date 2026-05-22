// Helper behavior for canonical Note Block command mutations.
// Authority: docs/contracts/app-note-model.md

import {
  type BlockContract,
  type NoteDocumentContract,
  type SectionContract,
  isHeadingLevel,
  userAuthoredBlockOrigin,
  validateBlockContract,
} from '../../../../contexts/note-model/src/contract/noteContract.ts';
import type { NoteBlockCommandInput, NoteBlockCommandResult } from './noteBlockCommandTypes.ts';

export function validateCommandIdentity(
  input: NoteBlockCommandInput,
  required: { noteId?: 'required' | 'optional'; blockId?: 'required' },
): string[] {
  const errors = [
    ...validateStableId('workspaceId', input.workspaceId),
    ...(required.noteId === 'required' ? validateStableId('noteId', input.noteId) : []),
    ...(required.blockId === 'required' ? validateStableId('blockId', input.blockId) : []),
  ];

  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

export function validateIncomingBlock(
  block: unknown,
  expected: { expectedNoteId?: string; expectedBlockId?: string },
): string[] {
  const validation = validateBlockContract(block);
  const candidate = asRecord(block);
  if (!candidate) {
    return validation.errors;
  }

  const errors = [...validation.errors];
  errors.push(...validateStableId('block.id', candidate.id));
  errors.push(...validateStableId('block.noteId', candidate.noteId));

  if (candidate.sectionId !== undefined) {
    errors.push(...validateStableId('block.sectionId', candidate.sectionId));
  }
  if (candidate.parentBlockId !== undefined) {
    errors.push(...validateStableId('block.parentBlockId', candidate.parentBlockId));
  }
  if (expected.expectedNoteId !== undefined && candidate.noteId !== expected.expectedNoteId) {
    errors.push('block.noteId must match noteId');
  }
  if (expected.expectedBlockId !== undefined && candidate.id !== expected.expectedBlockId) {
    errors.push('block.id must match blockId');
  }

  return errors;
}

export function expectedBlockContext(input: { noteId?: string | undefined; blockId?: string | undefined }): { expectedNoteId?: string; expectedBlockId?: string } {
  return {
    ...(input.noteId === undefined ? {} : { expectedNoteId: input.noteId }),
    ...(input.blockId === undefined ? {} : { expectedBlockId: input.blockId }),
  };
}

export function readBlockBody(body: unknown): { block?: unknown; errors: string[] } {
  const record = asRecord(body);
  if (!record || !asRecord(record.block)) {
    return { errors: ['body.block must be provided as an object'] };
  }

  return { block: record.block, errors: [] };
}

export interface TextBlockUpdateBody {
  kind: 'text_update';
  noteId: string;
  content: string;
  errors: string[];
}

export function readTextUpdateBody(body: unknown): TextBlockUpdateBody | { kind: 'not_text_update' } {
  const record = asRecord(body);
  if (!record || record.block !== undefined || record.content === undefined || record.noteId === undefined) {
    return { kind: 'not_text_update' };
  }

  const errors: string[] = [];
  const noteId = typeof record.noteId === 'string' ? record.noteId : '';
  const content = typeof record.content === 'string' ? record.content : '';
  errors.push(...validateStableId('body.noteId', noteId));
  if (content.trim() === '') {
    errors.push('body.content must be a non-empty string');
  }

  return {
    kind: 'text_update',
    noteId,
    content,
    errors,
  };
}

export function validateTextUpdateNoteId(input: NoteBlockCommandInput, noteId: string): string[] {
  if (input.noteId !== undefined && input.noteId !== noteId) {
    return ['body.noteId must match noteId'];
  }
  return [];
}

export function validateUserAuthoredTextUpdate(block: BlockContract, noteId: string): string[] {
  const errors: string[] = [];

  if (block.noteId !== noteId) {
    errors.push('block noteId must match body.noteId');
  }
  if (block.origin !== userAuthoredBlockOrigin) {
    errors.push('only user-authored blocks can be updated from editor text content');
  }
  const content = asRecord(block.contentJson);
  if (!content || typeof content.text !== 'string') {
    errors.push('block contentJson.text must exist for editor text updates');
  }
  if (
    block.type === 'heading'
    && (!content || typeof content.level !== 'number' || !isHeadingLevel(content.level))
  ) {
    errors.push('heading block content level must be H1, H2, or H3');
  }

  return errors;
}

export function updateOwningSectionAfterTextSave(
  document: NoteDocumentContract,
  blocks: readonly BlockContract[],
  existingBlock: BlockContract,
  title: string,
  updatedAt: number,
): { ok: true; sections: SectionContract[] } | { ok: false; errors: string[] } {
  const content = asRecord(existingBlock.contentJson);
  const headingLevel = typeof content?.level === 'number' ? content.level : undefined;
  const errors: string[] = [];

  if (existingBlock.sectionId === undefined) {
    if (existingBlock.type === 'heading') {
      errors.push('heading block sectionId must reference its owning section');
      errors.push('heading block sectionId must reference a document section');
      return { ok: false, errors };
    }
    return { ok: true, sections: document.sections.map((section) => ({ ...section })) };
  }

  const section = document.sections.find((candidate) => candidate.id === existingBlock.sectionId);
  if (section === undefined) {
    if (existingBlock.type === 'heading') {
      errors.push('heading block sectionId must reference a document section');
      return { ok: false, errors };
    }
    return { ok: true, sections: document.sections.map((candidate) => ({ ...candidate })) };
  }

  if (existingBlock.type === 'heading') {
    errors.push(...validateHeadingSectionReference(section, existingBlock, headingLevel));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    sections: document.sections.map((candidate) => {
      if (candidate.id !== existingBlock.sectionId) {
        return { ...candidate };
      }

      return {
        ...candidate,
        ...(existingBlock.type === 'heading' ? { title } : {}),
        contentHash: createSectionContentHash(candidate.id, blocks),
        updatedAt,
      };
    }),
  };
}

function validateHeadingSectionReference(
  section: SectionContract,
  headingBlock: BlockContract,
  headingLevel: number | undefined,
): string[] {
  const errors: string[] = [];
  if (headingBlock.sectionId === undefined) {
    errors.push('heading block sectionId must reference its owning section');
  }
  if (section.headingBlockId !== headingBlock.id) {
    errors.push('section.headingBlockId must match heading block id');
  }
  if (section.headingLevel !== headingLevel) {
    errors.push('section.headingLevel must match heading block level');
  }
  return errors;
}

function createSectionContentHash(sectionId: string, blocks: readonly BlockContract[]): string {
  const joinedBlockHashes = blocks
    .filter((block) => block.sectionId === sectionId)
    .sort((left, right) => left.position - right.position)
    .map((block) => `${block.id}:${block.contentHash}`)
    .join('|');

  return `hash_${sectionId}_${hashString(joinedBlockHashes).toString(16)}`;
}

export function applyTextUpdate(block: BlockContract, content: string, updatedAt: number): BlockContract {
  const contentJson = asRecord(block.contentJson) ?? {};
  return {
    ...block,
    contentJson: {
      ...contentJson,
      text: content,
    },
    plainText: content,
    contentHash: createEditorTextContentHash(block.id, content),
    updatedAt,
  };
}

function createEditorTextContentHash(blockId: string, content: string): string {
  return `hash_${blockId}_${hashString(content).toString(16)}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function readDeleteNoteId(input: NoteBlockCommandInput): { noteId?: string; errors: string[] } {
  if (input.noteId !== undefined) {
    return { noteId: input.noteId, errors: [] };
  }

  const body = asRecord(input.body);
  if (!body || body.noteId === undefined) {
    return { errors: ['noteId must be provided for block delete'] };
  }
  if (typeof body.noteId !== 'string') {
    return { errors: ['noteId must be a stable non-sentinel runtime id'] };
  }

  return { noteId: body.noteId, errors: [] };
}

export function withBlocks(document: NoteDocumentContract, blocks: BlockContract[]): NoteDocumentContract {
  return withDocumentParts(document, blocks, document.sections);
}

export function withDocumentParts(
  document: NoteDocumentContract,
  blocks: BlockContract[],
  sections: readonly SectionContract[],
): NoteDocumentContract {
  return {
    ...document,
    note: { ...document.note },
    sections: sections.map((section) => ({ ...section })),
    blocks: blocks.map((block) => ({
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

export function success(body: unknown): NoteBlockCommandResult {
  return { ok: true, errors: [], body };
}

export function failure(errors: readonly string[]): NoteBlockCommandResult {
  return { ok: false, errors: [...errors] };
}

export function validateStableId(label: string, value: unknown): string[] {
  return isStableRuntimeId(value)
    ? []
    : [`${label} must be a stable non-sentinel runtime id`];
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
