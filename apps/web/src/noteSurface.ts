import {
  type AiBlockType,
  type BlockContract,
  type HeadingBlockContentContract,
  type HeadingLevel,
  type NoteContract,
  type NoteDocumentContract,
  isAiBlockType,
  isStructuralHeading,
  resolveDescriptionEffective,
  validateNoteDocumentContract,
} from '../../../contexts/note-model/src/contract/noteContract.ts';

export type NoteSurfaceAiStatus = 'saved' | 'structuring' | 'updated' | 'failed';

export type SidebarItemId = 'notes' | 'recent' | 'search';

export type BlockEditorAction = 'edit_block' | 'save_block' | 'cancel_edit';
export type AiAssistBlockAction = 'edit' | 'adopt' | 'delete' | 'inspect_source';
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

export interface CreateNoteSurfaceViewModelOptions {
  workspaceName?: string;
  aiStatus?: NoteSurfaceAiStatus;
  editingBlockIds?: readonly string[];
  activeNoteId?: string;
  nextOpenDigest?: NextOpenDigestInput;
  expandedDigest?: boolean;
  provenancePopover?: ProvenancePopoverInput;
}

export interface NoteSurfaceViewModel {
  appShell: AppShellViewModel;
  sidebar: SidebarViewModel;
  topBar: TopBarViewModel;
  noteSurface: NoteSurfaceBodyViewModel;
  excludedSurfaces: ExcludedMvpSurfaces;
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
  nextOpenDigest: NextOpenDigestViewModel;
  blockEditor: BlockEditorViewModel;
  blocks: readonly NoteBlockViewModel[];
  sectionBoundaries: readonly SectionBoundaryViewModel[];
  availableActions: NoteSurfaceActionsViewModel;
  provenancePopover: ProvenancePopoverViewModel;
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
  editor: BlockEditorStateViewModel;
  sectionBoundary?: {
    level: HeadingLevel;
    title: string;
  };
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
  label: 'AI';
  collapsible: true;
  editable: true;
  dismissible: true;
  sourceInspectable: true;
  actions: readonly AiAssistBlockActionIntent[];
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
}

export interface MemoryCandidateBlockViewModel {
  label: 'Memory candidate';
  actions: readonly MemoryCandidateBlockActionIntent[];
  hiddenProfiling: false;
  automaticActiveMemory: false;
  emitsAiProviderCall: false;
}

export interface AiAssistBlockActionIntent {
  id: AiAssistBlockAction;
  label: 'Edit' | 'Adopt' | 'Delete' | 'Why?';
  userIntent:
    | 'edit_inline_ai_projection'
    | 'accept_ai_operation_projection'
    | 'dismiss_ai_operation_projection'
    | 'inspect_source_provenance';
  apiIntent: NoteSurfaceApiIntent;
  event?: Extract<NoteSurfaceIntentEvent, 'AssistBlockAccepted' | 'AssistBlockDismissed'>;
  emitsAiProviderCall: false;
  mutatesUserAuthoredBlock: false;
}

export interface MemoryCandidateBlockActionIntent {
  id: MemoryCandidateBlockAction;
  label: 'Remember' | 'Edit' | 'Not right' | 'Delete' | 'Later';
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

export interface NextOpenDigestInput {
  available: boolean;
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
  emptyState: 'unavailable' | 'no_items' | 'has_items';
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

const sidebarItems: readonly SidebarItemViewModel[] = [
  { id: 'notes', label: 'Notes', active: true },
  { id: 'recent', label: 'Recent', active: false },
  { id: 'search', label: 'Search', active: false },
];

const blockEditorActions: readonly BlockEditorAction[] = ['edit_block', 'save_block', 'cancel_edit'];
export const provenanceExcerptMaxChars = 280;

const aiAssistActions: readonly AiAssistBlockActionIntent[] = [
  {
    id: 'edit',
    label: 'Edit',
    userIntent: 'edit_inline_ai_projection',
    apiIntent: 'none',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
  {
    id: 'adopt',
    label: 'Adopt',
    userIntent: 'accept_ai_operation_projection',
    apiIntent: 'POST /ai-operations/:operationId/accept',
    event: 'AssistBlockAccepted',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
  {
    id: 'delete',
    label: 'Delete',
    userIntent: 'dismiss_ai_operation_projection',
    apiIntent: 'POST /ai-operations/:operationId/dismiss',
    event: 'AssistBlockDismissed',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
  {
    id: 'inspect_source',
    label: 'Why?',
    userIntent: 'inspect_source_provenance',
    apiIntent: 'provenance.lookup',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
];
const memoryCandidateActions: readonly MemoryCandidateBlockActionIntent[] = [
  {
    id: 'remember',
    label: 'Remember',
    userIntent: 'accept_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/accept',
    event: 'MemoryCandidateAccepted',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'edit',
    label: 'Edit',
    userIntent: 'edit_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/edit',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'reject',
    label: 'Not right',
    userIntent: 'reject_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/reject',
    event: 'MemoryCandidateRejected',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'delete',
    label: 'Delete',
    userIntent: 'dismiss_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/delete',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'snooze',
    label: 'Later',
    userIntent: 'defer_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/hold',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
];
const manualOrganizeActions: readonly ManualOrganizeAction[] = [
  'organize_section',
  'organize_note',
  'extract_questions',
  'extract_decisions',
  'find_related_notes',
  'remember_content',
];

export function createNoteSurfaceViewModel(
  document: NoteDocumentContract,
  options: CreateNoteSurfaceViewModelOptions = {},
): NoteSurfaceViewModel {
  const validationErrors = validateNoteSurfaceDocument(document);
  if (validationErrors.length > 0) {
    throw new NoteSurfaceViewModelError(validationErrors);
  }

  const sortedBlocks = [...document.blocks].sort((left, right) => left.position - right.position);
  const editingBlockIds = new Set(options.editingBlockIds ?? []);
  const sectionBoundaries = sortedBlocks.flatMap(createSectionBoundary);
  const blocks = sortedBlocks.map((block) => createBlockViewModel(block, editingBlockIds));

  return {
    appShell: {
      kind: 'AppShell',
      layout: 'single_note_surface',
      regions: ['sidebar', 'topBar', 'noteSurface'],
    },
    sidebar: {
      kind: 'Sidebar',
      items: sidebarItems.map((item) => ({
        ...item,
        active: item.id === 'notes',
      })),
    },
    topBar: {
      kind: 'TopBar',
      workspaceName: options.workspaceName ?? 'Workspace',
      search: { enabled: true },
      commandPalette: {
        enabled: true,
        manualOrganizeActions,
      },
      aiStatus: options.aiStatus ?? 'saved',
    },
    noteSurface: {
      kind: 'NoteSurface',
      noteHeader: createNoteHeaderViewModel(document.note, sectionBoundaries),
      nextOpenDigest: createNextOpenDigestViewModel(options.nextOpenDigest, options.expandedDigest ?? false),
      blockEditor: {
        kind: 'BlockEditor',
        acceptsUserInput: true,
        actions: blockEditorActions,
        emitsAiProviderCall: false,
      },
      blocks,
      sectionBoundaries,
      availableActions: {
        blockEditor: blockEditorActions,
        manualOrganize: manualOrganizeActions,
        emitsAiProviderCall: false,
      },
      provenancePopover: createProvenancePopoverViewModel(options.provenancePopover),
    },
    excludedSurfaces: createExcludedSurfacesGuard(),
  };
}

export function validateNoteSurfaceDocument(document: unknown): readonly string[] {
  return validateNoteDocumentContract(document).errors;
}

function createNoteHeaderViewModel(
  note: NoteContract,
  sectionBoundaries: readonly SectionBoundaryViewModel[],
): NoteHeaderViewModel {
  const outline = sectionBoundaries.map((boundary) => ({
    sectionId: boundary.sectionId ?? boundary.blockId,
    title: boundary.title,
    level: boundary.level,
  }));
  const effective = note.descriptionEffective ?? resolveDescriptionEffective(note, outline);

  return {
    noteId: note.id,
    title: note.title,
    description: {
      ...(note.descriptionUser === undefined ? {} : { user: note.descriptionUser }),
      ...(note.descriptionAi === undefined ? {} : { ai: note.descriptionAi }),
      aiApproved: note.descriptionAiApproved ?? false,
      effective,
      aiSuggested: note.descriptionUser === undefined && note.descriptionAi !== undefined,
      editable: true,
    },
  };
}

function createBlockViewModel(block: BlockContract, editingBlockIds: ReadonlySet<string>): NoteBlockViewModel {
  const sectionBoundary = createSectionBoundary(block)[0];
  const aiAssist = createAiAssistBlock(block);
  const memoryCandidate = block.type === 'ai_memory_candidate'
    ? {
        label: 'Memory candidate' as const,
        actions: memoryCandidateActions,
        hiddenProfiling: false as const,
        automaticActiveMemory: false as const,
        emitsAiProviderCall: false as const,
      }
    : undefined;

  return {
    id: block.id,
    ...(block.sectionId === undefined ? {} : { sectionId: block.sectionId }),
    type: block.type,
    origin: block.origin,
    text: extractBlockText(block),
    position: block.position,
    editor: {
      state: editingBlockIds.has(block.id) ? 'editing' : 'idle',
      actions: blockEditorActions,
      saveStatus: editingBlockIds.has(block.id) ? 'dirty' : 'saved',
      statusMessage: editingBlockIds.has(block.id) ? 'Unsaved changes' : 'Saved',
    },
    ...(sectionBoundary === undefined
      ? {}
      : {
          sectionBoundary: {
            level: sectionBoundary.level,
            title: sectionBoundary.title,
          },
        }),
    ...(aiAssist === undefined ? {} : { aiAssist }),
    ...(memoryCandidate === undefined ? {} : { memoryCandidate }),
  };
}

function createSectionBoundary(block: BlockContract): readonly SectionBoundaryViewModel[] {
  if (!isStructuralHeading(block)) {
    return [];
  }
  const content = block.contentJson as HeadingBlockContentContract;

  return [{
    blockId: block.id,
    ...(block.sectionId === undefined ? {} : { sectionId: block.sectionId }),
    level: content.level,
    title: content.text,
    position: block.position,
  }];
}

function createAiAssistBlock(block: BlockContract): AiAssistBlockViewModel | undefined {
  if (!isAiBlockType(block.type)) {
    return undefined;
  }

  return {
    kind: block.type,
    label: 'AI',
    collapsible: true,
    editable: true,
    dismissible: true,
    sourceInspectable: true,
    actions: aiAssistActions,
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  };
}

export function createNextOpenDigestViewModel(
  digest: NextOpenDigestInput | undefined,
  expanded: boolean,
): NextOpenDigestViewModel {
  if (digest?.available !== true) {
    return {
      kind: 'NextOpenDigest',
      available: false,
      compact: true,
      expandable: true,
      expanded: false,
      sections: [],
      emptyState: 'unavailable',
      emitsAiProviderCall: false,
    };
  }

  const sections = [
    createDigestSection('unresolved_questions', 'Unresolved questions', digest.unresolvedQuestions),
    createDigestSection('decisions', 'Decisions', digest.decisions),
    createDigestSection('related_notes', 'Related notes', digest.relatedNotes),
    createDigestSection('memory_candidates', 'Memory candidates', digest.memoryCandidates),
  ].filter((section): section is NextOpenDigestSectionViewModel => section.items.length > 0);

  return {
    kind: 'NextOpenDigest',
    available: true,
    compact: true,
    expandable: true,
    expanded,
    sections,
    emptyState: sections.length === 0 ? 'no_items' : 'has_items',
    emitsAiProviderCall: false,
  };
}

function createDigestSection(
  id: NextOpenDigestSectionViewModel['id'],
  label: NextOpenDigestSectionViewModel['label'],
  items: readonly DigestItemInput[] | undefined,
): NextOpenDigestSectionViewModel {
  return {
    id,
    label,
    items: (items ?? []).map((item) => ({
      id: item.id,
      text: item.text,
      ...(item.sourceBlockId === undefined && item.sourceNoteId === undefined
        ? {}
        : {
            source: {
              ...(item.sourceBlockId === undefined ? {} : { blockId: item.sourceBlockId }),
              ...(item.sourceNoteId === undefined ? {} : { noteId: item.sourceNoteId }),
            },
          }),
    })),
  };
}

export function createProvenancePopoverViewModel(
  provenance: ProvenancePopoverInput | undefined,
): ProvenancePopoverViewModel {
  if (provenance?.open !== true) {
    return {
      kind: 'ProvenancePopover',
      open: false,
      excerptMaxChars: provenanceExcerptMaxChars,
      includesFullNote: false,
      includesFullWorkspace: false,
      emitsAiProviderCall: false,
    };
  }

  const source = createProvenanceSource(provenance);

  return {
    kind: 'ProvenancePopover',
    open: true,
    ...(provenance.excerpt === undefined ? {} : { boundedExcerpt: boundExcerpt(provenance.excerpt) }),
    excerptMaxChars: provenanceExcerptMaxChars,
    ...(source === undefined ? {} : { source }),
    ...(provenance.reason === undefined ? {} : { reason: provenance.reason }),
    includesFullNote: false,
    includesFullWorkspace: false,
    emitsAiProviderCall: false,
  };
}

function createProvenanceSource(
  provenance: ProvenancePopoverInput,
): ProvenancePopoverViewModel['source'] {
  const source = {
    ...(provenance.sourceBlockId === undefined ? {} : { blockId: provenance.sourceBlockId }),
    ...(provenance.sourceNoteId === undefined ? {} : { noteId: provenance.sourceNoteId }),
    ...(provenance.sourceUnitId === undefined ? {} : { unitId: provenance.sourceUnitId }),
    ...(provenance.sourceTitle === undefined ? {} : { title: provenance.sourceTitle }),
    ...(provenance.startOffset === undefined ? {} : { startOffset: provenance.startOffset }),
    ...(provenance.endOffset === undefined ? {} : { endOffset: provenance.endOffset }),
  };

  return Object.keys(source).length === 0 ? undefined : source;
}

function boundExcerpt(excerpt: string): string {
  if (excerpt.length <= provenanceExcerptMaxChars) {
    return excerpt;
  }

  return excerpt.slice(0, provenanceExcerptMaxChars);
}

function createExcludedSurfacesGuard(): ExcludedMvpSurfaces {
  return {
    persistentChatPanel: false,
    aiModeSwitcher: false,
    externalIntegrationsDashboard: false,
  };
}

function extractBlockText(block: BlockContract): string {
  if (block.type === 'divider') {
    return '';
  }

  if ('text' in block.contentJson) {
    return block.contentJson.text;
  }

  return block.plainText;
}
