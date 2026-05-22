import type {
  AiAssistBlockActionIntent,
  BlockEditorAction,
  ManualOrganizeAction,
  MemoryCandidateBlockActionIntent,
  SidebarItemViewModel,
} from './viewModelTypes.ts';

export const sidebarItems: readonly SidebarItemViewModel[] = [
  { id: 'notes', label: 'Notes', active: true },
  { id: 'recent', label: 'Recent', active: false },
  { id: 'search', label: 'Search', active: false },
];

export const blockEditorActions: readonly BlockEditorAction[] = ['edit_block', 'save_block', 'cancel_edit'];
export const provenanceExcerptMaxChars = 280;

export const aiAssistActions: readonly AiAssistBlockActionIntent[] = [
  {
    id: 'inspect_source',
    label: '出典',
    userIntent: 'inspect_source_provenance',
    apiIntent: 'provenance.lookup',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
  {
    id: 'edit',
    label: '編集',
    userIntent: 'edit_inline_ai_projection',
    apiIntent: 'none',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
  {
    id: 'delete',
    label: '削除',
    userIntent: 'dismiss_ai_operation_projection',
    apiIntent: 'POST /ai-operations/:operationId/dismiss',
    event: 'AssistBlockDismissed',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  },
];
export const memoryCandidateActions: readonly MemoryCandidateBlockActionIntent[] = [
  {
    id: 'remember',
    label: '覚える',
    userIntent: 'accept_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/accept',
    event: 'MemoryCandidateAccepted',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'edit',
    label: '編集',
    userIntent: 'edit_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/edit',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'reject',
    label: '違う',
    userIntent: 'reject_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/reject',
    event: 'MemoryCandidateRejected',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'delete',
    label: '削除',
    userIntent: 'dismiss_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/delete',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
  {
    id: 'snooze',
    label: '保留',
    userIntent: 'defer_memory_candidate',
    apiIntent: 'POST /memory/:memoryId/hold',
    emitsAiProviderCall: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  },
];
export const manualOrganizeActions: readonly ManualOrganizeAction[] = [
  'organize_section',
  'organize_note',
  'extract_questions',
  'extract_decisions',
  'find_related_notes',
  'remember_content',
];
