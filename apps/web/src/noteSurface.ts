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
  blockEditor: BlockEditorViewModel;
  blocks: readonly NoteBlockViewModel[];
  sectionBoundaries: readonly SectionBoundaryViewModel[];
  availableActions: NoteSurfaceActionsViewModel;
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
}

export interface AiAssistBlockViewModel {
  kind: AiBlockType;
  label: 'AI';
  collapsible: true;
  editable: true;
  dismissible: true;
  sourceInspectable: true;
  actions: readonly AiAssistBlockAction[];
}

export interface MemoryCandidateBlockViewModel {
  label: 'Memory candidate';
  actions: readonly MemoryCandidateBlockAction[];
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
const aiAssistActions: readonly AiAssistBlockAction[] = ['edit', 'adopt', 'delete', 'inspect_source'];
const memoryCandidateActions: readonly MemoryCandidateBlockAction[] = ['remember', 'edit', 'reject', 'delete', 'snooze'];
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
    ? { label: 'Memory candidate' as const, actions: memoryCandidateActions }
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
  };
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
