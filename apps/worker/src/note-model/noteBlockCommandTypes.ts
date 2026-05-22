// Runtime command types for canonical Note Block mutations.
// Authority: docs/contracts/app-note-model.md

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
