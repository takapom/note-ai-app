import {
  createNextOpenDigestViewModel,
  createProvenancePopoverViewModel,
  type NextOpenDigestInput,
  type NoteSurfaceViewModel,
  type ProvenancePopoverInput,
} from './noteSurface.ts';
import {
  renderNoteSurfaceHtml,
  type NoteSurfaceHtmlRenderEventDescriptor,
  type NoteSurfaceHtmlRenderResult,
} from './noteSurfaceHtmlRenderer.ts';
import type {
  NoteSurfaceEventController,
  NoteSurfaceEventControllerResult,
} from './noteSurfaceEventController.ts';

export type NoteSurfaceBrowserRuntimeRenderer = (
  model: NoteSurfaceViewModel,
) => NoteSurfaceHtmlRenderResult;

export type NoteSurfaceBrowserRuntimeActionHandler = (
  eventDescriptor: unknown,
) => Promise<NoteSurfaceBrowserRuntimeActionResult>;

export interface NoteSurfaceBrowserRuntimeHost {
  setHtml(html: string): void | Promise<void>;
  bindActionEvents(
    events: readonly NoteSurfaceHtmlRenderEventDescriptor[],
    handler: NoteSurfaceBrowserRuntimeActionHandler,
  ): void | Promise<void>;
}

export interface NoteSurfaceBrowserRuntimeOptions {
  model: NoteSurfaceViewModel;
  render?: NoteSurfaceBrowserRuntimeRenderer;
  eventController: NoteSurfaceEventController;
  host: NoteSurfaceBrowserRuntimeHost;
}

export type NoteSurfaceBrowserRuntimeMountStatus =
  | 'mounted'
  | 'render_error'
  | 'host_error';

export interface NoteSurfaceBrowserRuntimeMountResult {
  ok: boolean;
  status: NoteSurfaceBrowserRuntimeMountStatus;
  html?: string;
  events?: readonly NoteSurfaceHtmlRenderEventDescriptor[];
  errors: readonly string[];
}

export type NoteSurfaceBrowserRuntimeActionStatus =
  | 'handled'
  | 'controller_error'
  | 'render_error'
  | 'host_error';

export interface NoteSurfaceBrowserRuntimeActionResult {
  ok: boolean;
  status: NoteSurfaceBrowserRuntimeActionStatus;
  controllerResult?: NoteSurfaceEventControllerResult;
  errors: readonly string[];
}

export interface NoteSurfaceBrowserRuntime {
  mount(): Promise<NoteSurfaceBrowserRuntimeMountResult>;
  handleAction(eventDescriptor: unknown): Promise<NoteSurfaceBrowserRuntimeActionResult>;
}

export function createNoteSurfaceBrowserRuntime(
  options: NoteSurfaceBrowserRuntimeOptions,
): NoteSurfaceBrowserRuntime {
  const render = options.render ?? renderNoteSurfaceHtml;
  let currentModel = options.model;

  async function handleAction(
    eventDescriptor: unknown,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    const localAction = resolveLocalProjectionAction(eventDescriptor);
    if (localAction !== undefined) {
      currentModel = applyLocalProjectionAction(currentModel, localAction);
      return renderCurrentModel();
    }

    const pendingSaveAction = resolveBlockUpdateProjectionAction(eventDescriptor);
    if (pendingSaveAction !== undefined) {
      if (isInputCompositionSaveBlocked(eventDescriptor)) {
        return {
          ok: true,
          status: 'handled',
          errors: [],
        };
      }

      currentModel = applyEditorSaveStarted(currentModel, pendingSaveAction);
      const pendingRender = await renderCurrentModel();
      if (!pendingRender.ok) {
        return pendingRender;
      }
    }

    try {
      const controllerResult = await options.eventController.handleRenderEvent(eventDescriptor);
      if (!controllerResult.ok) {
        if (pendingSaveAction !== undefined) {
          currentModel = applyEditorSaveFailed(
            currentModel,
            pendingSaveAction,
            controllerResult.errors.length > 0
              ? controllerResult.errors
              : [`event controller returned ${controllerResult.status}`],
          );
          const failureRender = await renderCurrentModel(controllerResult);
          if (!failureRender.ok) {
            return failureRender;
          }
        }

        return {
          ok: false,
          status: 'controller_error',
          controllerResult,
          errors: controllerResult.errors.length > 0
            ? controllerResult.errors
            : [`event controller returned ${controllerResult.status}`],
        };
      }

      const successfulProjectionAction = resolveSuccessfulApiProjectionAction(
        eventDescriptor,
        controllerResult,
      );
      if (successfulProjectionAction !== undefined) {
        currentModel = applySuccessfulApiProjectionAction(currentModel, successfulProjectionAction);
        return renderCurrentModel(controllerResult);
      }

      return {
        ok: true,
        status: 'handled',
        controllerResult,
        errors: [],
      };
    } catch (error) {
      if (pendingSaveAction !== undefined) {
        currentModel = applyEditorSaveFailed(currentModel, pendingSaveAction, toBoundaryErrors(error));
        const failureRender = await renderCurrentModel();
        if (!failureRender.ok) {
          return failureRender;
        }
      }

      return {
        ok: false,
        status: 'controller_error',
        errors: toBoundaryErrors(error),
      };
    }
  }

  async function renderCurrentModel(
    controllerResult?: NoteSurfaceEventControllerResult,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    let rendered: NoteSurfaceHtmlRenderResult;
    try {
      rendered = render(currentModel);
    } catch (error) {
      return {
        ok: false,
        status: 'render_error',
        errors: toBoundaryErrors(error),
      };
    }

    try {
      await options.host.setHtml(rendered.html);
      await options.host.bindActionEvents(rendered.events, handleAction);
    } catch (error) {
      return {
        ok: false,
        status: 'host_error',
        errors: toBoundaryErrors(error),
      };
    }

    return {
      ok: true,
      status: 'handled',
      ...(controllerResult === undefined ? {} : { controllerResult }),
      errors: [],
    };
  }

  return {
    async mount(): Promise<NoteSurfaceBrowserRuntimeMountResult> {
      let rendered: NoteSurfaceHtmlRenderResult;
      try {
        rendered = render(currentModel);
      } catch (error) {
        return {
          ok: false,
          status: 'render_error',
          errors: toBoundaryErrors(error),
        };
      }

      try {
        await options.host.setHtml(rendered.html);
        await options.host.bindActionEvents(rendered.events, handleAction);
      } catch (error) {
        return {
          ok: false,
          status: 'host_error',
          errors: toBoundaryErrors(error),
        };
      }

      return {
        ok: true,
        status: 'mounted',
        html: rendered.html,
        events: rendered.events,
        errors: [],
      };
    },
    handleAction,
  };
}

type LocalProjectionAction =
  | { action: 'expand_digest' | 'collapse_digest'; target: 'next_open_digest' }
  | { action: 'edit_block' | 'cancel_edit'; target: 'block_editor'; blockId: string }
  | { action: 'save_block'; target: 'block_editor'; blockId: string; content: string }
  | { action: 'close_provenance'; target: 'provenance_popover' };

type SuccessfulApiProjectionAction =
  | LocalProjectionAction
  | { action: 'read_digest'; target: 'next_open_digest'; digest: NextOpenDigestInput }
  | { action: 'lookup_provenance'; target: 'provenance_popover'; provenance: ProvenancePopoverInput }
  | {
      action: 'remember' | 'reject' | 'delete' | 'snooze';
      target: 'memory_candidate_block';
      blockId: string;
    }
  | { action: 'edit'; target: 'memory_candidate_block'; blockId: string; content: string };

type BlockUpdateProjectionAction = {
  action: 'save_block';
  target: 'block_editor';
  blockId: string;
  content: string;
};

function resolveLocalProjectionAction(eventDescriptor: unknown): LocalProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent') ?? 'none';

  if (apiIntent !== 'none') {
    return undefined;
  }

  if (
    (action === 'expand_digest' || action === 'collapse_digest')
    && target === 'next_open_digest'
  ) {
    return { action, target };
  }

  if (
    (action === 'edit_block' || action === 'cancel_edit')
    && target === 'block_editor'
  ) {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    return blockId === undefined ? undefined : { action, target, blockId };
  }

  if (action === 'close_provenance' && target === 'provenance_popover') {
    return { action, target };
  }

  return undefined;
}

function resolveSuccessfulApiProjectionAction(
  eventDescriptor: unknown,
  controllerResult: NoteSurfaceEventControllerResult,
): SuccessfulApiProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent');

  if (action === 'save_block' && target === 'block_editor' && apiIntent === 'block.update') {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    const content = readDescriptorRawString(source, dataset, 'content');
    if (blockId === undefined || content === undefined) {
      return undefined;
    }

    return { action, target, blockId, content };
  }

  const body = controllerResult.transportResult?.body;

  if (
    action === 'read_digest'
    && target === 'next_open_digest'
    && (apiIntent === 'digest.read' || apiIntent === 'GET /notes/:noteId/digest')
  ) {
    const digest = readDigestProjection(body);
    return digest === undefined ? undefined : { action, target, digest };
  }

  if (
    action === 'inspect_source'
    && target === 'provenance_popover'
    && (apiIntent === 'provenance.lookup' || apiIntent === 'POST /provenance/source')
  ) {
    const provenance = readProvenanceProjection(body);
    return provenance === undefined
      ? undefined
      : { action: 'lookup_provenance', target, provenance };
  }

  if (
    target === 'memory_candidate_block'
    && (
      apiIntent === 'memory.remember'
      || apiIntent === 'memory.reject'
      || apiIntent === 'memory.edit'
      || apiIntent === 'memory.delete'
      || apiIntent === 'memory.snooze'
      || apiIntent === 'POST /memory/:memoryId/accept'
      || apiIntent === 'POST /memory/:memoryId/reject'
      || apiIntent === 'POST /memory/:memoryId/edit'
      || apiIntent === 'POST /memory/:memoryId/delete'
      || apiIntent === 'POST /memory/:memoryId/hold'
    )
  ) {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    if (blockId === undefined) {
      return undefined;
    }

    const memory = readMemoryProjection(body);
    if (memory === undefined) {
      return undefined;
    }

    if (action === 'edit') {
      const content = readString(memory.content) ?? readDescriptorRawString(source, dataset, 'content');
      return content === undefined ? undefined : { action, target, blockId, content };
    }

    if (
      action === 'remember'
      || action === 'reject'
      || action === 'delete'
      || action === 'snooze'
    ) {
      return { action, target, blockId };
    }
  }

  return undefined;
}

function resolveBlockUpdateProjectionAction(eventDescriptor: unknown): BlockUpdateProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent');

  if (action !== 'save_block' || target !== 'block_editor' || apiIntent !== 'block.update') {
    return undefined;
  }

  const blockId = readDescriptorString(source, dataset, 'blockId');
  const content = readDescriptorRawString(source, dataset, 'content');
  return blockId === undefined || content === undefined
    ? undefined
    : { action, target, blockId, content };
}

function isInputCompositionSaveBlocked(eventDescriptor: unknown): boolean {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return false;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const state = readDescriptorString(source, dataset, 'inputCompositionState');

  return action === 'save_block'
    && target === 'block_editor'
    && (state === 'active' || state === 'pending');
}

function applyLocalProjectionAction(
  model: NoteSurfaceViewModel,
  action: LocalProjectionAction,
): NoteSurfaceViewModel {
  switch (action.action) {
    case 'expand_digest':
    case 'collapse_digest':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          nextOpenDigest: {
            ...model.noteSurface.nextOpenDigest,
            expanded: action.action === 'expand_digest',
          },
        },
      };
    case 'edit_block':
    case 'cancel_edit':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => (
            block.id === action.blockId
              ? {
                  ...block,
                  editor: {
                    actions: block.editor.actions,
                    state: action.action === 'edit_block' ? 'editing' : 'idle',
                    saveStatus: action.action === 'edit_block' ? 'dirty' : 'saved',
                    statusMessage: action.action === 'edit_block' ? 'Unsaved changes' : 'Saved',
                  },
                }
              : block
          )),
        },
      };
    case 'save_block':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => {
            if (block.id !== action.blockId) {
              return block;
            }

            return {
              ...block,
              text: action.content,
              editor: {
                actions: block.editor.actions,
                state: 'idle',
                saveStatus: 'saved',
                statusMessage: 'Saved',
              },
              ...(block.sectionBoundary === undefined
                ? {}
                : {
                    sectionBoundary: {
                      ...block.sectionBoundary,
                      title: action.content,
                    },
                  }),
            };
          }),
          sectionBoundaries: model.noteSurface.sectionBoundaries.map((boundary) => (
            boundary.blockId === action.blockId
              ? { ...boundary, title: action.content }
              : boundary
          )),
        },
      };
    case 'close_provenance':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          provenancePopover: {
            ...model.noteSurface.provenancePopover,
            open: false,
          },
        },
      };
  }
}

function applyEditorSaveStarted(
  model: NoteSurfaceViewModel,
  action: BlockUpdateProjectionAction,
): NoteSurfaceViewModel {
  return {
    ...model,
    noteSurface: {
      ...model.noteSurface,
      blocks: model.noteSurface.blocks.map((block) => (
        block.id === action.blockId
          ? {
              ...block,
              editor: {
                actions: block.editor.actions,
                state: 'editing',
                saveStatus: 'saving',
                statusMessage: 'Saving',
                draftText: action.content,
              },
            }
          : block
      )),
    },
  };
}

function applyEditorSaveFailed(
  model: NoteSurfaceViewModel,
  action: BlockUpdateProjectionAction,
  errors: readonly string[],
): NoteSurfaceViewModel {
  return {
    ...model,
    noteSurface: {
      ...model.noteSurface,
      blocks: model.noteSurface.blocks.map((block) => (
        block.id === action.blockId
          ? {
              ...block,
              editor: {
                ...block.editor,
                state: 'editing',
                saveStatus: 'error',
                statusMessage: errors[0] ?? 'Save failed',
                retryAction: 'save_block',
                draftText: action.content,
              },
            }
          : block
      )),
    },
  };
}

function applySuccessfulApiProjectionAction(
  model: NoteSurfaceViewModel,
  action: SuccessfulApiProjectionAction,
): NoteSurfaceViewModel {
  switch (action.action) {
    case 'expand_digest':
    case 'collapse_digest':
    case 'edit_block':
    case 'cancel_edit':
    case 'save_block':
    case 'close_provenance':
      return applyLocalProjectionAction(model, action);
    case 'read_digest':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          nextOpenDigest: createNextOpenDigestViewModel(
            action.digest,
            model.noteSurface.nextOpenDigest.expanded,
          ),
        },
      };
    case 'lookup_provenance':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          provenancePopover: createProvenancePopoverViewModel(action.provenance),
        },
      };
    case 'remember':
    case 'reject':
    case 'delete':
    case 'snooze':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.filter((block) => block.id !== action.blockId),
          sectionBoundaries: model.noteSurface.sectionBoundaries.filter((boundary) => (
            boundary.blockId !== action.blockId
          )),
        },
      };
    case 'edit':
      return {
        ...model,
        noteSurface: {
          ...model.noteSurface,
          blocks: model.noteSurface.blocks.map((block) => (
            block.id === action.blockId
              ? {
                  ...block,
                  text: action.content,
                  editor: {
                    ...block.editor,
                    state: 'idle',
                  },
                }
              : block
          )),
        },
      };
  }
}

function readDigestProjection(body: unknown): NextOpenDigestInput | undefined {
  const candidate = unwrapResultBody(body);
  if (!isPlainObject(candidate) || typeof candidate.available !== 'boolean') {
    return undefined;
  }

  return {
    available: candidate.available,
    ...copyDigestArray(candidate, 'unresolvedQuestions'),
    ...copyDigestArray(candidate, 'decisions'),
    ...copyDigestArray(candidate, 'relatedNotes'),
    ...copyDigestArray(candidate, 'memoryCandidates'),
  };
}

function copyDigestArray(
  digest: Record<string, unknown>,
  fieldName: 'unresolvedQuestions' | 'decisions' | 'relatedNotes' | 'memoryCandidates',
): Partial<NextOpenDigestInput> {
  const value = digest[fieldName];
  return Array.isArray(value) ? { [fieldName]: value.filter(isDigestItemInput) } : {};
}

function isDigestItemInput(value: unknown): value is NonNullable<NextOpenDigestInput['unresolvedQuestions']>[number] {
  return isPlainObject(value) && typeof value.id === 'string' && typeof value.text === 'string';
}

function readProvenanceProjection(body: unknown): ProvenancePopoverInput | undefined {
  const candidate = unwrapResultBody(body);
  if (!isPlainObject(candidate)) {
    return undefined;
  }

  const source = isPlainObject(candidate.source) ? candidate.source : undefined;
  const excerpt = readString(candidate.excerpt);
  const sourceBlockId = readString(candidate.sourceBlockId) ?? readString(source?.sourceBlockId);
  const sourceNoteId = readString(candidate.sourceNoteId) ?? readString(source?.noteId);
  const sourceUnitId = readString(candidate.sourceUnitId) ?? readString(source?.sourceUnitId);
  const sourceTitle = readString(candidate.sourceTitle) ?? readString(source?.sourceTitle);
  const startOffset = readNumber(candidate.startOffset) ?? readNumber(source?.startOffset);
  const endOffset = readNumber(candidate.endOffset) ?? readNumber(source?.endOffset);
  const reason = readString(candidate.reason) ?? readString(source?.reason);

  if (excerpt === undefined && sourceBlockId === undefined && sourceNoteId === undefined) {
    return undefined;
  }

  return {
    open: true,
    ...(sourceBlockId === undefined ? {} : { sourceBlockId }),
    ...(sourceNoteId === undefined ? {} : { sourceNoteId }),
    ...(sourceUnitId === undefined ? {} : { sourceUnitId }),
    ...(sourceTitle === undefined ? {} : { sourceTitle }),
    ...(startOffset === undefined ? {} : { startOffset }),
    ...(endOffset === undefined ? {} : { endOffset }),
    ...(excerpt === undefined ? {} : { excerpt }),
    ...(reason === undefined ? {} : { reason }),
  };
}

function readMemoryProjection(body: unknown): Record<string, unknown> | undefined {
  const candidate = unwrapResultBody(body);
  if (!isPlainObject(candidate)) {
    return undefined;
  }

  const memory = isPlainObject(candidate.memory) ? candidate.memory : candidate;
  if (!isPlainObject(memory)) {
    return undefined;
  }

  return readString(memory.id) !== undefined
    || readString(memory.status) !== undefined
    || readString(memory.content) !== undefined
    || readString(memory.reviewDecision) !== undefined
    ? memory
    : undefined;
}

function unwrapResultBody(body: unknown): unknown {
  if (!isPlainObject(body)) {
    return undefined;
  }

  return isPlainObject(body.result) ? body.result : body;
}

function readDescriptorString(
  source: Record<string, unknown>,
  dataset: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = source[field] ?? dataset?.[field];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function readDescriptorRawString(
  source: Record<string, unknown>,
  dataset: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = source[field] ?? dataset?.[field];
  return typeof value === 'string' ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toBoundaryErrors(error: unknown): readonly string[] {
  if (error instanceof Error) {
    const structuredErrors = readStructuredErrors(error);
    return structuredErrors.length > 0 ? structuredErrors : [error.message];
  }

  return [String(error)];
}

function readStructuredErrors(error: Error): readonly string[] {
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((entry): entry is string => typeof entry === 'string');
}
