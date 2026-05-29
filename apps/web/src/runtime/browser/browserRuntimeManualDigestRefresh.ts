import type { NoteSurfaceViewModel } from '../../noteSurface.ts';
import type { NoteSurfaceEventController } from '../../noteSurfaceEventController.ts';
import {
  resolveDigestReadFailureProjectionAction,
  resolveSuccessfulApiProjectionAction,
} from './browserRuntimeActions.ts';
import { applyManualStructureDigestProjection } from './browserRuntimeProjection.ts';

type ManualStructureDigestRefreshInput = {
  model: NoteSurfaceViewModel;
  noteId: string;
  eventController: NoteSurfaceEventController;
};

type ManualStructureDigestRefreshResult = {
  model: NoteSurfaceViewModel;
  refreshed: boolean;
};

export async function refreshManualStructureDigestProjection(
  input: ManualStructureDigestRefreshInput,
): Promise<ManualStructureDigestRefreshResult> {
  const digestDescriptor = {
    action: 'read_digest',
    target: 'next_open_digest',
    noteId: input.noteId,
    apiIntent: 'digest.read',
  };

  try {
    const digestResult = await input.eventController.handleRenderEvent(digestDescriptor);
    const digestProjectionAction = digestResult.ok
      ? resolveSuccessfulApiProjectionAction(digestDescriptor, digestResult)
      : resolveDigestReadFailureProjectionAction(digestDescriptor);

    if (digestProjectionAction !== undefined) {
      return {
        model: applyManualStructureDigestProjection(input.model, digestProjectionAction),
        refreshed: true,
      };
    }
  } catch {
    const failedDigestAction = resolveDigestReadFailureProjectionAction(digestDescriptor);
    if (failedDigestAction !== undefined) {
      return {
        model: applyManualStructureDigestProjection(input.model, failedDigestAction),
        refreshed: true,
      };
    }
  }

  return {
    model: input.model,
    refreshed: false,
  };
}
