import {
  resolveContinueWritingFocusBlockId,
  withInlineBlockActionState,
} from '../../noteSurface.ts';
import { renderNoteSurfaceHtml } from '../../noteSurfaceHtmlRenderer.ts';
import type { NoteSurfaceEventControllerResult } from '../../noteSurfaceEventController.ts';
import {
  isInputCompositionSaveBlocked,
  resolveBlockUpdateProjectionAction,
  resolveDigestReadFailureProjectionAction,
  resolveInlineApiProjectionAction,
  resolveManualStructureProjectionAction,
  resolveLocalProjectionAction,
  resolveSuccessfulApiProjectionAction,
} from './browserRuntimeActions.ts';
import {
  applyEditorSaveFailed,
  applyEditorSaveStarted,
  applyLocalProjectionAction,
  applyManualStructureFailed,
  applyManualStructureStarted,
  applySuccessfulApiProjectionAction,
  enrichLocalProjectionAction,
} from './browserRuntimeProjection.ts';
import { toBoundaryErrors } from './browserRuntimeErrors.ts';
import type {
  NoteSurfaceBrowserRuntime,
  NoteSurfaceBrowserRuntimeActionResult,
  NoteSurfaceBrowserRuntimeOptions,
} from './browserRuntimeTypes.ts';
import {
  mountBrowserRuntimeModel,
  renderBrowserRuntimeModel,
} from './browserRuntimeRenderCycle.ts';
import { refreshManualStructureDigestProjection } from './browserRuntimeManualDigestRefresh.ts';

export function createNoteSurfaceBrowserRuntime(
  options: NoteSurfaceBrowserRuntimeOptions,
): NoteSurfaceBrowserRuntime {
  const render = options.render ?? renderNoteSurfaceHtml;
  let currentModel = options.model;

  async function handleAction(
    eventDescriptor: unknown,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    const localAction = enrichLocalProjectionAction(currentModel, resolveLocalProjectionAction(eventDescriptor), eventDescriptor);
    if (localAction !== undefined) {
      currentModel = applyLocalProjectionAction(currentModel, localAction);
      const rendered = await renderCurrentModel();
      if (rendered.ok && localAction.action === 'continue_writing') {
        const focusBlockId = resolveContinueWritingFocusBlockId(
          currentModel,
          localAction.directionId,
        );
        options.host.focusWritingBlock?.(focusBlockId);
      }
      return rendered;
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

    const inlineApiAction = resolveInlineApiProjectionAction(eventDescriptor);
    if (inlineApiAction !== undefined) {
      currentModel = withInlineBlockActionState(
        currentModel,
        inlineApiAction.blockId,
        inlineApiAction.action,
        'pending',
        inlineApiAction.target,
      );
      const pendingRender = await renderCurrentModel();
      if (!pendingRender.ok) {
        return pendingRender;
      }
    }

    const manualStructureAction = resolveManualStructureProjectionAction(eventDescriptor);
    if (manualStructureAction !== undefined) {
      currentModel = applyManualStructureStarted(currentModel, manualStructureAction);
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

        if (inlineApiAction !== undefined) {
          currentModel = withInlineBlockActionState(
            currentModel,
            inlineApiAction.blockId,
            inlineApiAction.action,
            'failed',
            inlineApiAction.target,
          );
          const failureRender = await renderCurrentModel(controllerResult);
          if (!failureRender.ok) {
            return failureRender;
          }
        }

        if (manualStructureAction !== undefined) {
          currentModel = applyManualStructureFailed(currentModel, manualStructureAction);
          const failureRender = await renderCurrentModel(controllerResult);
          if (!failureRender.ok) {
            return failureRender;
          }
        }

        const failedDigestAction = resolveDigestReadFailureProjectionAction(eventDescriptor);
        if (failedDigestAction !== undefined) {
          currentModel = applySuccessfulApiProjectionAction(currentModel, failedDigestAction);
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

      if (manualStructureAction !== undefined) {
        return refreshDigestAfterManualStructure(manualStructureAction, controllerResult);
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

      if (inlineApiAction !== undefined) {
        currentModel = withInlineBlockActionState(
          currentModel,
          inlineApiAction.blockId,
          inlineApiAction.action,
          'failed',
          inlineApiAction.target,
        );
        const failureRender = await renderCurrentModel();
        if (!failureRender.ok) {
          return failureRender;
        }
      }

      if (manualStructureAction !== undefined) {
        currentModel = applyManualStructureFailed(currentModel, manualStructureAction);
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

  async function refreshDigestAfterManualStructure(
    action: { noteId: string },
    controllerResult: NoteSurfaceEventControllerResult,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    const refreshResult = await refreshManualStructureDigestProjection({
      model: currentModel,
      noteId: action.noteId,
      eventController: options.eventController,
    });
    currentModel = refreshResult.model;

    if (refreshResult.refreshed) {
      return renderCurrentModel(controllerResult);
    }

    return {
      ok: true,
      status: 'handled',
      controllerResult,
      errors: [],
    };
  }

  async function renderCurrentModel(
    controllerResult?: NoteSurfaceEventControllerResult,
  ): Promise<NoteSurfaceBrowserRuntimeActionResult> {
    return renderBrowserRuntimeModel({
      model: currentModel,
      render,
      host: options.host,
      handleAction,
      ...(controllerResult === undefined ? {} : { controllerResult }),
    });
  }

  return {
    mount() {
      return mountBrowserRuntimeModel({
        model: currentModel,
        render,
        host: options.host,
        handleAction,
      });
    },
    handleAction,
  };
}
