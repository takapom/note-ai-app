// Runtime command boundary for canonical Note Block mutations.
// Authority: docs/contracts/app-note-model.md

import type { BlockContract } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import { validateNoteDocumentForPersistence, type NoteDocumentPersistencePort } from './noteDocumentPersistencePort.ts';
import {
  applyTextUpdate,
  createUserParagraphBlock,
  expectedBlockContext,
  failure,
  hashString,
  readBlockBody,
  readDeleteNoteId,
  readTextCreateBody,
  readTextUpdateBody,
  success,
  updateOwningSectionAfterTextSave,
  validateCommandIdentity,
  validateIncomingBlock,
  validateStableId,
  validateTextUpdateNoteId,
  validateUserAuthoredTextUpdate,
  withBlocks,
  withDocumentParts,
  type TextBlockUpdateBody,
} from './noteBlockCommandHelpers.ts';
import type { NoteBlockCommandInput, NoteBlockCommandPort, NoteBlockCommandResult } from './noteBlockCommandTypes.ts';

export interface NoteDocumentBlockCommandPortOptions {
  createBlockId?: (input: NoteDocumentBlockIdInput) => string;
}

export interface NoteDocumentBlockIdInput {
  workspaceId: string;
  noteId: string;
  now: number;
  blockCount: number;
}

export class NoteDocumentBlockCommandPort implements NoteBlockCommandPort {
  private readonly persistence: NoteDocumentPersistencePort;
  private readonly createBlockId: (input: NoteDocumentBlockIdInput) => string;

  constructor(
    persistence: NoteDocumentPersistencePort,
    options: NoteDocumentBlockCommandPortOptions = {},
  ) {
    this.persistence = persistence;
    this.createBlockId = options.createBlockId ?? createDefaultBlockId;
  }

  async createBlock(input: NoteBlockCommandInput): Promise<NoteBlockCommandResult> {
    const identityErrors = validateCommandIdentity(input, { noteId: 'required' });
    const textCreate = readTextCreateBody(input.body);
    if (textCreate.kind === 'text_create') {
      const errors = [...identityErrors, ...textCreate.errors];
      if (errors.length > 0) {
        return failure(errors);
      }

      return this.createUserAuthoredTextBlock(input, textCreate);
    }

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

  private async createUserAuthoredTextBlock(
    input: NoteBlockCommandInput,
    create: Extract<ReturnType<typeof readTextCreateBody>, { kind: 'text_create' }>,
  ): Promise<NoteBlockCommandResult> {
    const loaded = await this.persistence.loadDocument({
      workspaceId: input.workspaceId,
      noteId: input.noteId as string,
    });
    if (!loaded.ok || loaded.document === undefined) {
      return failure(loaded.errors);
    }

    const anchor = resolveCreateAnchor(loaded.document.blocks, create.afterBlockId);
    if (!anchor.ok) {
      return failure(anchor.errors);
    }

    const blockId = this.createBlockId({
      workspaceId: input.workspaceId,
      noteId: input.noteId as string,
      now: input.now,
      blockCount: loaded.document.blocks.length,
    });
    const idErrors = validateStableId('generated blockId', blockId);
    if (idErrors.length > 0) {
      return failure(idErrors);
    }
    if (loaded.document.blocks.some((candidate) => candidate.id === blockId)) {
      return failure(['generated blockId must be unique in the canonical document']);
    }

    const block = createUserParagraphBlock({
      id: blockId,
      noteId: input.noteId as string,
      ...(anchor.sectionId === undefined ? {} : { sectionId: anchor.sectionId }),
      content: create.content,
      position: anchor.position,
      now: input.now,
    });
    const blocks = [...loaded.document.blocks, block];
    const sectionUpdate = updateOwningSectionAfterTextSave(
      loaded.document,
      blocks,
      block,
      create.content,
      input.now,
    );
    if (!sectionUpdate.ok) {
      return failure(sectionUpdate.errors);
    }

    const document = withDocumentParts(loaded.document, blocks, sectionUpdate.sections);
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
    const sectionUpdate = updateOwningSectionAfterTextSave(
      loaded.document,
      blocks,
      existingBlock,
      update.content,
      input.now,
    );
    if (!sectionUpdate.ok) {
      return failure(sectionUpdate.errors);
    }

    const document = withDocumentParts(loaded.document, blocks, sectionUpdate.sections);
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

function createDefaultBlockId(input: NoteDocumentBlockIdInput): string {
  const hash = hashString(`${input.workspaceId}:${input.noteId}:${input.now}:${input.blockCount}`);
  return `block_${input.noteId}_${input.now}_${hash.toString(36)}`;
}

function resolveCreateAnchor(
  blocks: readonly BlockContract[],
  afterBlockId: string | undefined,
): { ok: true; position: number; sectionId?: string } | { ok: false; errors: string[] } {
  if (afterBlockId !== undefined) {
    const block = blocks.find((candidate) => candidate.id === afterBlockId);
    if (block === undefined) {
      return { ok: false, errors: ['body.afterBlockId must reference a block in the canonical document'] };
    }
    return {
      ok: true,
      position: nextPositionAfter(block.position, blocks),
      ...(block.sectionId === undefined ? {} : { sectionId: block.sectionId }),
    };
  }

  const lastBlock = [...blocks].sort((left, right) => right.position - left.position).at(0);
  if (lastBlock === undefined) {
    return { ok: true, position: 0 };
  }

  return {
    ok: true,
    position: lastBlock.position + 1,
    ...(lastBlock.sectionId === undefined ? {} : { sectionId: lastBlock.sectionId }),
  };
}

function nextPositionAfter(position: number, blocks: readonly BlockContract[]): number {
  const laterPositions = blocks
    .map((block) => block.position)
    .filter((candidatePosition) => candidatePosition > position)
    .sort((left, right) => left - right);
  const nextPosition = laterPositions.at(0);

  return nextPosition === undefined
    ? position + 1
    : position + ((nextPosition - position) / 2);
}
