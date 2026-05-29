import {
  refreshQuietWritingProjection,
  type NoteSurfaceViewModel,
} from '../../../noteSurface.ts';
import type {
  ManualStructureProjectionAction,
  SuccessfulApiProjectionAction,
} from '../actions/browserRuntimeActionTypes.ts';
import { applySuccessfulApiProjectionAction } from './browserRuntimeApiProjection.ts';

export function applyManualStructureStarted(
  model: NoteSurfaceViewModel,
  _action: ManualStructureProjectionAction,
): NoteSurfaceViewModel {
  return refreshQuietWritingProjection({
    ...model,
    topBar: {
      ...model.topBar,
      aiStatus: 'structuring',
    },
  });
}

export function applyManualStructureFailed(
  model: NoteSurfaceViewModel,
  _action: ManualStructureProjectionAction,
): NoteSurfaceViewModel {
  return refreshQuietWritingProjection({
    ...model,
    topBar: {
      ...model.topBar,
      aiStatus: 'failed',
    },
  });
}

export function applyManualStructureDigestProjection(
  model: NoteSurfaceViewModel,
  action: SuccessfulApiProjectionAction,
): NoteSurfaceViewModel {
  const nextModel = applySuccessfulApiProjectionAction(model, action);
  if (action.action !== 'read_digest' || action.digest.available !== true) {
    return nextModel;
  }

  return refreshQuietWritingProjection({
    ...nextModel,
    topBar: {
      ...nextModel.topBar,
      aiStatus: 'updated',
    },
  });
}
