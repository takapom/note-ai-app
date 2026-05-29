import type { NoteDocumentContract } from '../../../contexts/note-model/src/contract/noteContract.ts';
import {
  type CreateNoteSurfaceViewModelOptions,
  type NextOpenDigestInput,
  type NoteSurfaceAiStatus,
  type ProvenancePopoverInput,
  validateNoteSurfaceDocument,
} from './noteSurface.ts';
import type { NoteSurfaceActionInputResolverOptions } from './noteSurfaceActionInputResolver.ts';
import {
  createNoteSurfaceResolverOptionsFromDocument,
  type NoteSurfaceResolverOptionsFromDocumentResult,
} from './noteSurfaceResolverOptionsFromDocument.ts';

export interface NoteSurfaceProductViewState {
  workspaceName?: string;
  aiStatus?: NoteSurfaceAiStatus;
  editingBlockIds?: readonly string[];
  sourceSpanIdByBlockId?: Readonly<Record<string, string>>;
  inlineAiProjectionsVisible?: boolean;
  memoryCandidatesVisible?: boolean;
  returnLayerVisible?: boolean;
  recentThoughts?: CreateNoteSurfaceViewModelOptions['recentThoughts'];
  noteLibraryStatus?: CreateNoteSurfaceViewModelOptions['noteLibraryStatus'];
  nextOpenDigest?: NextOpenDigestInput;
  expandedDigest?: boolean;
  provenancePopover?: ProvenancePopoverInput;
}

export interface NoteSurfaceProductProjectionMaps {
  activeNoteId?: string;
  operationIdByBlockId?: Readonly<Record<string, string>>;
  memoryIdByBlockId?: Readonly<Record<string, string>>;
  sourceSpanIdByBlockId?: Readonly<Record<string, string>>;
  memoryEditContentByBlockId?: Readonly<Record<string, unknown>>;
}

export interface CreateNoteSurfaceProductStateInput {
  document: unknown;
  viewState?: NoteSurfaceProductViewState;
  projectionMaps?: NoteSurfaceProductProjectionMaps;
}

export type NoteSurfaceProductStateResult =
  | {
      ok: true;
      document: NoteDocumentContract;
      viewOptions: CreateNoteSurfaceViewModelOptions;
      resolverOptions: NoteSurfaceActionInputResolverOptions;
    }
  | {
      ok: false;
      errors: readonly string[];
    };

export function createNoteSurfaceProductState(
  input: CreateNoteSurfaceProductStateInput,
): NoteSurfaceProductStateResult {
  const documentErrors = validateNoteSurfaceDocument(input.document);
  if (documentErrors.length > 0) {
    return {
      ok: false,
      errors: documentErrors,
    };
  }

  const resolverOptions = createResolverOptions(input);
  if (!resolverOptions.ok) {
    return {
      ok: false,
      errors: resolverOptions.errors,
    };
  }

  return {
    ok: true,
    document: input.document as NoteDocumentContract,
    viewOptions: createViewOptions(input.viewState, input.projectionMaps),
    resolverOptions: resolverOptions.options,
  };
}

function createResolverOptions(
  input: CreateNoteSurfaceProductStateInput,
): NoteSurfaceResolverOptionsFromDocumentResult {
  return createNoteSurfaceResolverOptionsFromDocument({
    document: input.document,
    ...(input.projectionMaps?.activeNoteId === undefined ? {} : { activeNoteId: input.projectionMaps.activeNoteId }),
    ...(input.projectionMaps?.operationIdByBlockId === undefined
      ? {}
      : { operationIdByBlockId: input.projectionMaps.operationIdByBlockId }),
    ...(input.projectionMaps?.memoryIdByBlockId === undefined
      ? {}
      : { memoryIdByBlockId: input.projectionMaps.memoryIdByBlockId }),
    ...(input.projectionMaps?.sourceSpanIdByBlockId === undefined
      ? {}
      : { sourceSpanIdByBlockId: input.projectionMaps.sourceSpanIdByBlockId }),
    ...(input.projectionMaps?.memoryEditContentByBlockId === undefined
      ? {}
      : { memoryEditContentByBlockId: input.projectionMaps.memoryEditContentByBlockId }),
  });
}

function createViewOptions(
  viewState: NoteSurfaceProductViewState | undefined,
  projectionMaps: NoteSurfaceProductProjectionMaps | undefined,
): CreateNoteSurfaceViewModelOptions {
  const sourceSpanIdByBlockId = viewState?.sourceSpanIdByBlockId ?? projectionMaps?.sourceSpanIdByBlockId;

  return {
    ...(viewState?.workspaceName === undefined ? {} : { workspaceName: viewState.workspaceName }),
    ...(viewState?.aiStatus === undefined ? {} : { aiStatus: viewState.aiStatus }),
    ...(viewState?.editingBlockIds === undefined ? {} : { editingBlockIds: viewState.editingBlockIds }),
    ...(sourceSpanIdByBlockId === undefined ? {} : { sourceSpanIdByBlockId }),
    ...(viewState?.inlineAiProjectionsVisible === undefined
      ? {}
      : { inlineAiProjectionsVisible: viewState.inlineAiProjectionsVisible }),
    ...(viewState?.memoryCandidatesVisible === undefined
      ? {}
      : { memoryCandidatesVisible: viewState.memoryCandidatesVisible }),
    ...(viewState?.returnLayerVisible === undefined ? {} : { returnLayerVisible: viewState.returnLayerVisible }),
    ...(viewState?.recentThoughts === undefined ? {} : { recentThoughts: viewState.recentThoughts }),
    ...(viewState?.noteLibraryStatus === undefined ? {} : { noteLibraryStatus: viewState.noteLibraryStatus }),
    ...(viewState?.nextOpenDigest === undefined ? {} : { nextOpenDigest: viewState.nextOpenDigest }),
    ...(viewState?.expandedDigest === undefined ? {} : { expandedDigest: viewState.expandedDigest }),
    ...(viewState?.provenancePopover === undefined ? {} : { provenancePopover: viewState.provenancePopover }),
  };
}
