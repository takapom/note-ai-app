import type {
  AiBlockType,
  BlockContract,
  HeadingLevel,
} from '../../../../contexts/note-model/src/contract/noteContract.ts';
import type { AuthoringShortcutIntent } from '../noteSurfaceAuthoringShortcuts.ts';

export type NoteSurfaceAiStatus = 'saved' | 'structuring' | 'updated' | 'failed';

export type SidebarItemId = 'notes' | 'recent' | 'search';

export type BlockEditorAction = 'edit_block' | 'save_block' | 'cancel_edit';
export type AiAssistBlockAction = 'inspect_source' | 'edit' | 'delete';
export type MemoryCandidateBlockAction = 'remember' | 'edit' | 'reject' | 'delete' | 'snooze';
export type NoteSurfaceIntentEvent =
  | 'AssistBlockAccepted'
  | 'AssistBlockDismissed'
  | 'MemoryCandidateAccepted'
  | 'MemoryCandidateRejected';
export type NoteSurfaceApiIntent =
  | 'none'
  | 'POST /ai-operations/:operationId/accept'
  | 'POST /ai-operations/:operationId/dismiss'
  | 'provenance.lookup'
  | 'POST /memory/:memoryId/accept'
  | 'POST /memory/:memoryId/reject'
  | 'POST /memory/:memoryId/edit'
  | 'POST /memory/:memoryId/delete'
  | 'POST /memory/:memoryId/hold';
export type ManualOrganizeAction =
  | 'organize_section'
  | 'organize_note'
  | 'extract_questions'
  | 'extract_decisions'
  | 'find_related_notes'
  | 'remember_content';

export interface RecentThoughtInput {
  id: string;
  title: string;
  updatedLabel: string;
  active?: boolean;
}

export interface ThinRailNoteLibraryStatusInput {
  state: 'empty' | 'failed' | 'invalid';
  label: string;
}

export interface CreateNoteSurfaceViewModelOptions {
  workspaceName?: string;
  aiStatus?: NoteSurfaceAiStatus;
  editingBlockIds?: readonly string[];
  sourceSpanIdByBlockId?: Readonly<Record<string, string>>;
  inlineAiProjectionsVisible?: boolean;
  memoryCandidatesVisible?: boolean;
  returnLayerVisible?: boolean;
  activeNoteId?: string;
  nextOpenDigest?: NextOpenDigestInput;
  expandedDigest?: boolean;
  returnLayerOpen?: boolean;
  recentThoughts?: readonly RecentThoughtInput[];
  noteLibraryStatus?: ThinRailNoteLibraryStatusInput;
  provenancePopover?: ProvenancePopoverInput;
  organizationLayer?: OrganizationLayerInput;
}

export interface NoteSurfaceViewModel {
  appShell: AppShellViewModel;
  sidebar: SidebarViewModel;
  topBar: TopBarViewModel;
  quietWriting: QuietWritingSurfaceViewModel;
  noteSurface: NoteSurfaceBodyViewModel;
  excludedSurfaces: ExcludedMvpSurfaces;
}

export interface QuietWritingSurfaceViewModel {
  kind: 'QuietWritingSurface';
  returnLayerVisible: boolean;
  thinRail: ThinRailViewModel;
  writingChrome: WritingChromeViewModel;
  reEntrySurface: ReEntrySurfaceViewModel;
  returnLayer: ReturnLayerViewModel;
  carriedContextTray: CarriedContextTrayViewModel;
}

export interface ThinRailViewModel {
  kind: 'ThinRail';
  workspaceName: string;
  recentThoughts: readonly RecentThoughtViewModel[];
  noteLibraryStatus?: ThinRailNoteLibraryStatusInput;
}

export interface RecentThoughtViewModel {
  id: string;
  title: string;
  updatedLabel: string;
  active: boolean;
}

export interface WritingChromeViewModel {
  kind: 'WritingChrome';
  returnStatus?: string;
  digestStatus?: string;
  digestStatusKind?: NextOpenDigestViewModel['emptyState'];
  aiStatusLabel: string;
}

export interface ReEntrySurfaceViewModel {
  kind: 'ReEntrySurface';
  visible: boolean;
  heading: string;
  directions: readonly ReEntryDirectionViewModel[];
}

export interface ReEntryDirectionViewModel {
  id: string;
  title: string;
  summary: string;
  sourceAvailable: boolean;
  focusBlockId?: string;
}

export type NoteSurfaceUiActionState = 'idle' | 'pending' | 'failed';

export interface ReturnLayerActionsViewModel {
  defer: NoteSurfaceUiActionState;
  close: NoteSurfaceUiActionState;
}

export interface ReturnLayerViewModel {
  kind: 'ReturnLayer';
  open: boolean;
  available: boolean;
  label: string;
  summary?: string;
  points: readonly ReturnLayerPointViewModel[];
  emptyState: 'unavailable' | 'no_items' | 'has_items' | 'load_failed' | 'invalid_body';
  actions: ReturnLayerActionsViewModel;
  emitsAiProviderCall: false;
}

export interface ReturnLayerPointViewModel {
  id: string;
  title: string;
  explanation: string;
  sourceAvailable: boolean;
  sourceInspectable: boolean;
  source?: {
    blockId?: string;
    noteId?: string;
  };
}

export interface CarriedContextTrayViewModel {
  kind: 'CarriedContextTray';
  label: string;
  candidates: readonly CarriedContextCandidateViewModel[];
}

export interface CarriedContextCandidateViewModel {
  id: string;
  statement: string;
  sourcePreview?: string;
  sourceAvailable: boolean;
  actionState: NoteSurfaceUiActionState;
}

export interface AppShellViewModel {
  kind: 'AppShell';
  layout: 'single_note_surface';
  regions: readonly ['sidebar', 'topBar', 'noteSurface'];
}

export interface SidebarViewModel {
  kind: 'Sidebar';
  items: readonly SidebarItemViewModel[];
}

export interface SidebarItemViewModel {
  id: SidebarItemId;
  label: string;
  active: boolean;
}

export interface TopBarViewModel {
  kind: 'TopBar';
  workspaceName: string;
  search: { enabled: true };
  commandPalette: {
    enabled: true;
    manualOrganizeActions: readonly ManualOrganizeAction[];
  };
  aiStatus: NoteSurfaceAiStatus;
}

export interface NoteSurfaceBodyViewModel {
  kind: 'NoteSurface';
  noteHeader: NoteHeaderViewModel;
  organizationLayer: OrganizationLayerViewModel;
  nextOpenDigest: NextOpenDigestViewModel;
  blockEditor: BlockEditorViewModel;
  blocks: readonly NoteBlockViewModel[];
  sectionBoundaries: readonly SectionBoundaryViewModel[];
  availableActions: NoteSurfaceActionsViewModel;
  provenancePopover: ProvenancePopoverViewModel;
}

export interface OrganizationLayerInput {
  status?: 'current' | 'updated' | 'failed' | 'disabled';
  updatedLabel?: string;
  failureLabel?: string;
  canRestore?: boolean;
}

export interface OrganizationLayerViewModel {
  kind: 'OrganizationLayer';
  defaultLayer: 'organized';
  captureLayerEditable: false;
  status: 'current' | 'updated' | 'failed' | 'disabled';
  historyAffordance: {
    visible: boolean;
    label: string;
    canRestore: boolean;
    summary?: string;
  };
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
}

export interface NoteHeaderViewModel {
  noteId: string;
  title: string;
  description: {
    user?: string;
    ai?: string;
    aiApproved: boolean;
    effective: string;
    aiSuggested: boolean;
    editable: true;
  };
}

export interface BlockEditorViewModel {
  kind: 'BlockEditor';
  acceptsUserInput: true;
  actions: readonly BlockEditorAction[];
  emitsAiProviderCall: false;
}

export interface NoteBlockViewModel {
  id: string;
  sectionId?: string;
  type: BlockContract['type'];
  origin: BlockContract['origin'];
  text: string;
  position: number;
  sourcePreview?: string;
  editor: BlockEditorStateViewModel;
  sectionBoundary?: {
    level: HeadingLevel;
    title: string;
  };
  authoringIntent?: AuthoringShortcutIntent;
  aiAssist?: AiAssistBlockViewModel;
  memoryCandidate?: MemoryCandidateBlockViewModel;
}

export interface BlockEditorStateViewModel {
  state: 'idle' | 'editing';
  actions: readonly BlockEditorAction[];
  saveStatus: 'saved' | 'dirty' | 'saving' | 'error';
  statusMessage: string;
  retryAction?: Extract<BlockEditorAction, 'save_block'>;
  draftText?: string;
}

export interface AiAssistBlockViewModel {
  kind: AiBlockType;
  label: '整理された文脈';
  collapsible: true;
  editable: true;
  editing: boolean;
  dismissible: true;
  sourceInspectable: boolean;
  actions: readonly AiAssistBlockActionIntent[];
  actionStates: Partial<Record<AiAssistBlockAction, NoteSurfaceUiActionState>>;
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
}

export interface MemoryCandidateBlockViewModel {
  label: '持ち越す文脈';
  actions: readonly MemoryCandidateBlockActionIntent[];
  actionStates: Partial<Record<MemoryCandidateBlockAction, NoteSurfaceUiActionState>>;
  hiddenProfiling: false;
  automaticActiveMemory: false;
  emitsAiProviderCall: false;
}

export interface AiAssistBlockActionIntent {
  id: AiAssistBlockAction;
  label: '出典' | '編集' | '削除';
  userIntent:
    | 'edit_inline_ai_projection'
    | 'dismiss_ai_operation_projection'
    | 'inspect_source_provenance';
  apiIntent: NoteSurfaceApiIntent;
  event?: Extract<NoteSurfaceIntentEvent, 'AssistBlockDismissed'>;
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
}

export interface MemoryCandidateBlockActionIntent {
  id: MemoryCandidateBlockAction;
  label: '覚える' | '編集' | '違う' | '削除' | '保留';
  userIntent:
    | 'accept_memory_candidate'
    | 'edit_memory_candidate'
    | 'reject_memory_candidate'
    | 'dismiss_memory_candidate'
    | 'defer_memory_candidate';
  apiIntent: NoteSurfaceApiIntent;
  event?: Extract<NoteSurfaceIntentEvent, 'MemoryCandidateAccepted' | 'MemoryCandidateRejected'>;
  emitsAiProviderCall: false;
  hiddenProfiling: false;
  automaticActiveMemory: false;
}

export type NextOpenDigestLoadState = 'provided' | 'transport_failed' | 'invalid_body';

export interface NextOpenDigestInput {
  available: boolean;
  loadState?: NextOpenDigestLoadState;
  unresolvedQuestions?: readonly DigestItemInput[];
  decisions?: readonly DigestItemInput[];
  relatedNotes?: readonly DigestItemInput[];
  memoryCandidates?: readonly DigestItemInput[];
}

export interface DigestItemInput {
  id: string;
  text: string;
  sourceBlockId?: string;
  sourceNoteId?: string;
}

export interface NextOpenDigestViewModel {
  kind: 'NextOpenDigest';
  available: boolean;
  compact: true;
  expandable: true;
  expanded: boolean;
  sections: readonly NextOpenDigestSectionViewModel[];
  emptyState: ReturnLayerViewModel['emptyState'];
  loadState?: NextOpenDigestLoadState;
  emitsAiProviderCall: false;
}

export interface NextOpenDigestSectionViewModel {
  id: 'unresolved_questions' | 'decisions' | 'related_notes' | 'memory_candidates';
  label: 'Unresolved questions' | 'Decisions' | 'Related notes' | 'Memory candidates';
  items: readonly DigestItemViewModel[];
}

export interface DigestItemViewModel {
  id: string;
  text: string;
  source?: {
    blockId?: string;
    noteId?: string;
  };
}

export interface ProvenancePopoverInput {
  open: boolean;
  sourceBlockId?: string;
  sourceNoteId?: string;
  sourceUnitId?: string;
  sourceTitle?: string;
  startOffset?: number;
  endOffset?: number;
  excerpt?: string;
  reason?: string;
}

export interface ProvenancePopoverViewModel {
  kind: 'ProvenancePopover';
  open: boolean;
  boundedExcerpt?: string;
  excerptMaxChars: number;
  source?: {
    blockId?: string;
    noteId?: string;
    unitId?: string;
    title?: string;
    startOffset?: number;
    endOffset?: number;
  };
  reason?: string;
  includesFullNote: false;
  includesFullWorkspace: false;
  emitsAiProviderCall: false;
}

export interface SectionBoundaryViewModel {
  blockId: string;
  sectionId?: string;
  level: HeadingLevel;
  title: string;
  position: number;
}

export interface NoteSurfaceActionsViewModel {
  blockEditor: readonly BlockEditorAction[];
  manualOrganize: readonly ManualOrganizeAction[];
  emitsAiProviderCall: false;
}

export interface ExcludedMvpSurfaces {
  persistentChatPanel: false;
  aiModeSwitcher: false;
  externalIntegrationsDashboard: false;
}

export class NoteSurfaceViewModelError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid note document for note surface: ${errors.join('; ')}`);
    this.name = 'NoteSurfaceViewModelError';
    this.errors = errors;
  }
}
