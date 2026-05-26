import type {
  AiAssistBlockActionIntent,
  BlockEditorAction,
  MemoryCandidateBlockActionIntent,
  NextOpenDigestSectionViewModel,
  NoteBlockViewModel,
  NoteSurfaceApiIntent,
  NoteSurfaceIntentEvent,
  NoteSurfaceViewModel,
} from '../noteSurface.ts';
import type { NoteSurfaceApiIntentKind } from '../noteSurfaceApiIntents.ts';

export type NoteSurfaceHtmlRenderTarget =
  | 'block_editor'
  | 'ai_assist_block'
  | 'memory_candidate_block'
  | 'next_open_digest'
  | 'return_layer'
  | 're_entry_surface'
  | 'thin_rail'
  | 'writing_chrome'
  | 'provenance_popover'
  | 'organization_history';

export type NoteSurfaceHtmlAction =
  | BlockEditorAction
  | AiAssistBlockActionIntent['id']
  | MemoryCandidateBlockActionIntent['id']
  | 'expand_digest'
  | 'collapse_digest'
  | 'close_return_layer'
  | 'defer_return_layer'
  | 'continue_writing'
  | 'manual_organize'
  | 'close_provenance'
  | 'open_organization_history';

export interface NoteSurfaceHtmlRenderEventDescriptor {
  action: NoteSurfaceHtmlAction;
  target: NoteSurfaceHtmlRenderTarget;
  label: string;
  dataAction: string;
  blockId?: string;
  noteId?: string;
  blockType?: NoteBlockViewModel['type'];
  digestSectionId?: NextOpenDigestSectionViewModel['id'];
  userIntent?: string;
  apiIntent: NoteSurfaceApiIntent | NoteSurfaceApiIntentKind | 'none';
  event?: NoteSurfaceIntentEvent;
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
  hiddenProfiling: false;
  automaticActiveMemory: false;
}

export interface NoteSurfaceHtmlRenderResult {
  html: string;
  events: readonly NoteSurfaceHtmlRenderEventDescriptor[];
}

export class NoteSurfaceHtmlRendererError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid note surface view model for HTML rendering: ${errors.join('; ')}`);
    this.name = 'NoteSurfaceHtmlRendererError';
    this.errors = errors;
  }
}
