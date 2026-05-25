import {
  validateNoteDocumentContract,
  type NoteDocumentContract,
} from '../../../../contexts/note-model/src/contract/noteContract.ts';
import {
  blockEditorActions,
  manualOrganizeActions,
  sidebarItems,
} from './viewModelConstants.ts';
import {
  createBlockViewModel,
  createNoteHeaderViewModel,
  createSectionBoundary,
} from './blockPresenter.ts';
import { createQuietWritingSurfaceViewModel } from './quietWritingPresenter.ts';
import { createNextOpenDigestViewModel } from '../digest/digestPresenter.ts';
import { createProvenancePopoverViewModel } from '../provenance/provenancePresenter.ts';
import {
  NoteSurfaceViewModelError,
  type CreateNoteSurfaceViewModelOptions,
  type ExcludedMvpSurfaces,
  type NoteSurfaceUiActionState,
  type NoteSurfaceViewModel,
  type ReturnLayerActionsViewModel,
} from './viewModelTypes.ts';

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
  const blocks = sortedBlocks.map((block) => createBlockViewModel(
    block,
    editingBlockIds,
    sortedBlocks,
    options.sourceSpanIdByBlockId,
  ));
  const nextOpenDigest = createNextOpenDigestViewModel(options.nextOpenDigest, false);
  const returnLayerOpen = nextOpenDigest.available
    ? (options.returnLayerOpen ?? options.expandedDigest ?? false)
    : false;
  const quietWriting = createQuietWritingSurfaceViewModel({
    note: document.note,
    nextOpenDigest,
    returnLayerOpen,
    blocks,
    aiStatus: options.aiStatus ?? 'saved',
    workspaceName: options.workspaceName,
    ...(options.recentThoughts === undefined ? {} : { recentThoughts: options.recentThoughts }),
  });

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
    quietWriting,
    noteSurface: {
      kind: 'NoteSurface',
      noteHeader: createNoteHeaderViewModel(document.note, sectionBoundaries),
      organizationLayer: createOrganizationLayerViewModel(options.organizationLayer),
      nextOpenDigest: {
        ...nextOpenDigest,
        expanded: returnLayerOpen,
      },
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

function createOrganizationLayerViewModel(
  input: CreateNoteSurfaceViewModelOptions['organizationLayer'],
): NoteSurfaceViewModel['noteSurface']['organizationLayer'] {
  const status = input?.status ?? 'current';
  const visible = status === 'updated' || status === 'failed' || input?.canRestore === true;
  const summary = status === 'failed'
    ? (input?.failureLabel ?? '整理は前回の状態を保っています')
    : input?.updatedLabel;

  return {
    kind: 'OrganizationLayer',
    defaultLayer: 'organized',
    captureLayerEditable: false,
    status,
    historyAffordance: {
      visible,
      label: '履歴',
      canRestore: input?.canRestore ?? false,
      ...(summary === undefined ? {} : { summary }),
    },
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  };
}

export function validateNoteSurfaceDocument(document: unknown): readonly string[] {
  return validateNoteDocumentContract(document).errors;
}

export function refreshQuietWritingProjection(model: NoteSurfaceViewModel): NoteSurfaceViewModel {
  const returnLayerOpen = model.noteSurface.nextOpenDigest.expanded;
  return {
    ...model,
    quietWriting: createQuietWritingSurfaceViewModel({
      note: {
        id: model.noteSurface.noteHeader.noteId,
        title: model.noteSurface.noteHeader.title,
      },
      nextOpenDigest: model.noteSurface.nextOpenDigest,
      returnLayerOpen,
      blocks: model.noteSurface.blocks,
      aiStatus: model.topBar.aiStatus,
      workspaceName: model.topBar.workspaceName,
    }),
  };
}

export function withReturnLayerOpen(model: NoteSurfaceViewModel, open: boolean): NoteSurfaceViewModel {
  return refreshQuietWritingProjection({
    ...model,
    noteSurface: {
      ...model.noteSurface,
      nextOpenDigest: {
        ...model.noteSurface.nextOpenDigest,
        expanded: open,
      },
    },
  });
}

export function withReturnLayerActionState(
  model: NoteSurfaceViewModel,
  action: keyof ReturnLayerActionsViewModel,
  actionState: NoteSurfaceUiActionState,
): NoteSurfaceViewModel {
  return {
    ...model,
    quietWriting: {
      ...model.quietWriting,
      returnLayer: {
        ...model.quietWriting.returnLayer,
        actions: {
          ...model.quietWriting.returnLayer.actions,
          [action]: actionState,
        },
      },
    },
  };
}

export function withInlineBlockActionState(
  model: NoteSurfaceViewModel,
  blockId: string,
  action: string,
  actionState: NoteSurfaceUiActionState,
  target: 'memory_candidate_block' | 'ai_assist_block',
): NoteSurfaceViewModel {
  const nextModel = {
    ...model,
    noteSurface: {
      ...model.noteSurface,
      blocks: model.noteSurface.blocks.map((block) => {
        if (block.id !== blockId) {
          return block;
        }

        if (target === 'memory_candidate_block' && block.memoryCandidate !== undefined) {
          return {
            ...block,
            memoryCandidate: {
              ...block.memoryCandidate,
              actionStates: {
                ...block.memoryCandidate.actionStates,
                [action]: actionState,
              },
            },
          };
        }

        if (target === 'ai_assist_block' && block.aiAssist !== undefined) {
          return {
            ...block,
            aiAssist: {
              ...block.aiAssist,
              actionStates: {
                ...block.aiAssist.actionStates,
                [action]: actionState,
              },
            },
          };
        }

        return block;
      }),
    },
  };

  return refreshQuietWritingProjection(nextModel);
}

function createExcludedSurfacesGuard(): ExcludedMvpSurfaces {
  return {
    persistentChatPanel: false,
    aiModeSwitcher: false,
    externalIntegrationsDashboard: false,
  };
}
