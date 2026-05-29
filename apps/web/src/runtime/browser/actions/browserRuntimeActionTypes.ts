import type {
  createNoteSurfaceViewModel,
  NextOpenDigestInput,
  ProvenancePopoverInput,
} from '../../../noteSurface.ts';

export type NoteSurfaceDocumentInput = Parameters<typeof createNoteSurfaceViewModel>[0];

export type LocalProjectionAction =
  | { action: 'expand_digest' | 'collapse_digest'; target: 'next_open_digest' }
  | { action: 'close_return_layer' | 'defer_return_layer'; target: 'return_layer' }
  | { action: 'continue_writing'; target: 're_entry_surface'; directionId?: string }
  | { action: 'edit_block' | 'cancel_edit'; target: 'block_editor'; blockId: string }
  | { action: 'save_block'; target: 'block_editor'; blockId: string; content: string }
  | { action: 'edit'; target: 'ai_assist_block'; blockId: string; content?: string }
  | { action: 'close_provenance'; target: 'provenance_popover' };

export type SuccessfulApiProjectionAction =
  | LocalProjectionAction
  | { action: 'open_recent_thought'; target: 'thin_rail'; noteId: string; document: NoteSurfaceDocumentInput }
  | { action: 'read_digest'; target: 'next_open_digest'; digest: NextOpenDigestInput }
  | { action: 'lookup_provenance'; target: 'provenance_popover'; provenance: ProvenancePopoverInput }
  | {
      action: 'remember' | 'reject' | 'delete' | 'snooze';
      target: 'memory_candidate_block';
      blockId: string;
    }
  | { action: 'adopt' | 'delete'; target: 'ai_assist_block'; blockId: string }
  | { action: 'edit'; target: 'memory_candidate_block'; blockId: string; content: string };

export type BlockUpdateProjectionAction = {
  action: 'save_block';
  target: 'block_editor';
  blockId: string;
  content: string;
};

export type ManualStructureProjectionAction = {
  action: 'manual_organize';
  target: 'writing_chrome';
  noteId: string;
};

export type InlineApiProjectionAction = {
  action: string;
  target: 'memory_candidate_block' | 'ai_assist_block';
  blockId: string;
};
