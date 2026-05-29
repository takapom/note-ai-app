import { readNoteSurfaceRenderActionDescriptor } from '../../actions/renderActionDescriptor.ts';
import { matchesRenderApiIntentKind } from '../../actions/renderActionIntents.ts';
import type { ManualStructureProjectionAction } from './browserRuntimeActionTypes.ts';

export function resolveManualStructureProjectionAction(eventDescriptor: unknown): ManualStructureProjectionAction | undefined {
  const descriptor = readNoteSurfaceRenderActionDescriptor(eventDescriptor);
  if (descriptor === undefined) {
    return undefined;
  }
  const { action, target, apiIntent, noteId } = descriptor;

  return action === 'manual_organize'
    && target === 'writing_chrome'
    && matchesRenderApiIntentKind(apiIntent, 'note.manual_structure')
    && noteId !== undefined
    ? { action, target, noteId }
    : undefined;
}
