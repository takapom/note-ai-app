// Runtime command boundary for canonical Note Block mutations.
// Authority: docs/contracts/app-note-model.md
// Companion: apps/worker/src/noteDocumentPersistencePort.ts

import {
  type BlockContract,
  type NoteDocumentContract,
  userAuthoredBlockOrigin,
  validateBlockContract,
} from '../../../contexts/note-model/src/contract/noteContract.ts';
import {
  type NoteDocumentPersistencePort,
  validateNoteDocumentForPersistence,
} from './noteDocumentPersistencePort.ts';

export interface NoteBlockCommandInput {
  workspaceId: string;
  userId?: string;
  noteId?: string;
  blockId?: string;
  now: number;
  body?: unknown;
}

export interface NoteBlockCommandResult {
  ok: boolean;
  errors: string[];
  body?: unknown;
}

export interface NoteBlockCommandPort {
  createBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult>;
  updateBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult>;
  deleteBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult>;
}

export class NoteDocumentBlockCommandPort implements NoteBlockCommandPort {
  private readonly persistence: NoteDocumentPersistencePort;

  constructor(persistence: NoteDocumentPersistencePort) {
    this.persistence = persistence;
  }

  async createBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult> {
    const identityErrors = validateCommandIdentity(input, { noteId: 'required' });
    const blockResult = readBlockBody(input.body);
    const blockErrors = blockResult.block === undefined
      ? blockResult.errors
      : validateIncomingBlock(blockResult.block, expectedBlockContext({ noteId: input.noteId }));

    const errors = [...identityErrors, ...blockErrors];
    if (errors.length > 0) {
      return failure(errors);
    }

    const block = blockResult.block as BlockContract;
    const loaded = await this.persistence.loadDocument({
      workspaceId: input.workspaceId,
      noteId: input.noteId as string,
    });
    if (!loaded.ok || loaded.document === undefined) {
      return failure(loaded.errors);
    }

    const document = withBlocks(loaded.document, [...loaded.document.blocks, block]);
    const documentErrors = validateNoteDocumentForPersistence(document);
    if (documentErrors.length > 0) {
      return failure(documentErrors);
    }

    const saved = await this.persistence.saveDocument(document);
    if (!saved.ok || saved.document === undefined) {
      return failure(saved.errors);
    }

    return success({ document: saved.document, block });
  }

  async updateBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult> {
    const identityErrors = validateCommandIdentity(input, {
      noteId: input.noteId === undefined ? 'optional' : 'required',
      blockId: 'required',
    });
    const textUpdate = readTextUpdateBody(input.body);
    if (textUpdate.kind === 'text_update') {
      const noteIdErrors = validateTextUpdateNoteId(input, textUpdate.noteId);
      const errors = [...identityErrors, ...textUpdate.errors, ...noteIdErrors];
      if (errors.length > 0) {
        return failure(errors);
      }

      return this.updateUserAuthoredTextBlock(input, textUpdate);
    }

    const blockResult = readBlockBody(input.body);
    const blockErrors = blockResult.block === undefined
      ? blockResult.errors
      : validateIncomingBlock(blockResult.block, expectedBlockContext({
          noteId: input.noteId,
          blockId: input.blockId,
        }));

    const errors = [...identityErrors, ...blockErrors];
    if (errors.length > 0) {
      return failure(errors);
    }

    const block = blockResult.block as BlockContract;
    const loaded = await this.persistence.loadDocument({
      workspaceId: input.workspaceId,
      noteId: block.noteId,
    });
    if (!loaded.ok || loaded.document === undefined) {
      return failure(loaded.errors);
    }

    const existingIndex = loaded.document.blocks.findIndex((candidate) => candidate.id === input.blockId);
    if (existingIndex === -1) {
      return failure(['block not found']);
    }

    const existingBlock = loaded.document.blocks[existingIndex];
    if (existingBlock.noteId !== block.noteId || loaded.document.note.id !== block.noteId) {
      return failure(['block noteId must match the canonical document note.id']);
    }

    const blocks = loaded.document.blocks.map((candidate, index) => index === existingIndex ? block : candidate);
    const document = withBlocks(loaded.document, blocks);
    const documentErrors = validateNoteDocumentForPersistence(document);
    if (documentErrors.length > 0) {
      return failure(documentErrors);
    }

    const saved = await this.persistence.saveDocument(document);
    if (!saved.ok || saved.document === undefined) {
      return failure(saved.errors);
    }

    return success({ document: saved.document, block });
  }

  private async updateUserAuthoredTextBlock(
    input: NoteBlockCommandInput,
    update: TextBlockUpdateBody,
  ): Promise<NoteBlockCommandResult> {
    const loaded = await this.persistence.loadDocument({
      workspaceId: input.workspaceId,
      noteId: update.noteId,
    });
    if (!loaded.ok || loaded.document === undefined) {
      return failure(loaded.errors);
    }

    const existingIndex = loaded.document.blocks.findIndex((candidate) => candidate.id === input.blockId);
    if (existingIndex === -1) {
      return failure(['block not found']);
    }

    const existingBlock = loaded.document.blocks[existingIndex];
    const updateErrors = validateUserAuthoredTextUpdate(existingBlock, update.noteId);
    if (updateErrors.length > 0) {
      return failure(updateErrors);
    }

    const block = applyTextUpdate(existingBlock, update.content, input.now);
    const blocks = loaded.document.blocks.map((candidate, index) => index === existingIndex ? block : candidate);
    const document = withBlocks(loaded.document, blocks);
    const documentErrors = validateNoteDocumentForPersistence(document);
    if (documentErrors.length > 0) {
      return failure(documentErrors);
    }

    const saved = await this.persistence.saveDocument(document);
    if (!saved.ok || saved.document === undefined) {
      return failure(saved.errors);
    }

    return success({ document: saved.document, block });
  }

  async deleteBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult> {
    const noteIdResult = readDeleteNoteId(input);
    const identityErrors = validateCommandIdentity(input, {
      noteId: noteIdResult.noteId === undefined ? 'optional' : 'required',
      blockId: 'required',
    });
    const noteIdErrors = noteIdResult.noteId === undefined
      ? noteIdResult.errors
      : validateStableId('noteId', noteIdResult.noteId);

    const errors = [...identityErrors, ...noteIdErrors];
    if (errors.length > 0) {
      return failure(errors);
    }

    const loaded = await this.persistence.loadDocument({
      workspaceId: input.workspaceId,
      noteId: noteIdResult.noteId as string,
    });
    if (!loaded.ok || loaded.document === undefined) {
      return failure(loaded.errors);
    }

    const existingBlock = loaded.document.blocks.find((candidate) => candidate.id === input.blockId);
    if (existingBlock === undefined) {
      return failure(['block not found']);
    }
    if (existingBlock.noteId !== noteIdResult.noteId || loaded.document.note.id !== noteIdResult.noteId) {
      return failure(['block noteId must match the canonical document note.id']);
    }

    const document = withBlocks(
      loaded.document,
      loaded.document.blocks.filter((candidate) => candidate.id !== input.blockId),
    );
    const documentErrors = validateNoteDocumentForPersistence(document);
    if (documentErrors.length > 0) {
      return failure(documentErrors);
    }

    const saved = await this.persistence.saveDocument(document);
    if (!saved.ok || saved.document === undefined) {
      return failure(saved.errors);
    }

    return success({ document: saved.document, blockId: input.blockId });
  }
}

function validateCommandIdentity(
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

function validateIncomingBlock(
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

function expectedBlockContext(input: { noteId?: string | undefined; blockId?: string | undefined }): { expectedNoteId?: string; expectedBlockId?: string } {
  return {
    ...(input.noteId === undefined ? {} : { expectedNoteId: input.noteId }),
    ...(input.blockId === undefined ? {} : { expectedBlockId: input.blockId }),
  };
}

function readBlockBody(body: unknown): { block?: unknown; errors: string[] } {
  const record = asRecord(body);
  if (!record || !asRecord(record.block)) {
    return { errors: ['body.block must be provided as an object'] };
  }

  return { block: record.block, errors: [] };
}

interface TextBlockUpdateBody {
  kind: 'text_update';
  noteId: string;
  content: string;
  errors: string[];
}

function readTextUpdateBody(body: unknown): TextBlockUpdateBody | { kind: 'not_text_update' } {
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

function validateTextUpdateNoteId(input: NoteBlockCommandInput, noteId: string): string[] {
  if (input.noteId !== undefined && input.noteId !== noteId) {
    return ['body.noteId must match noteId'];
  }
  return [];
}

function validateUserAuthoredTextUpdate(block: BlockContract, noteId: string): string[] {
  const errors: string[] = [];

  if (block.noteId !== noteId) {
    errors.push('block noteId must match body.noteId');
  }
  if (block.origin !== userAuthoredBlockOrigin) {
    errors.push('only user-authored blocks can be updated from editor text content');
  }
  if (block.type === 'heading') {
    errors.push('heading block text updates require the heading editor boundary');
  }
  const content = asRecord(block.contentJson);
  if (!content || typeof content.text !== 'string') {
    errors.push('block contentJson.text must exist for editor text updates');
  }

  return errors;
}

function applyTextUpdate(block: BlockContract, content: string, updatedAt: number): BlockContract {
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
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `hash_${blockId}_${hash.toString(16)}`;
}

function readDeleteNoteId(input: NoteBlockCommandInput): { noteId?: string; errors: string[] } {
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

function withBlocks(document: NoteDocumentContract, blocks: BlockContract[]): NoteDocumentContract {
  return {
    ...document,
    note: { ...document.note },
    sections: document.sections.map((section) => ({ ...section })),
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

function success(body: unknown): NoteBlockCommandResult {
  return { ok: true, errors: [], body };
}

function failure(errors: readonly string[]): NoteBlockCommandResult {
  return { ok: false, errors: [...errors] };
}

function validateStableId(label: string, value: unknown): string[] {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
