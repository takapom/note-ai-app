import type { NoteSurfaceViewModel } from '../noteSurface.ts';

export function validateRenderableNoteSurface(model: NoteSurfaceViewModel): readonly string[] {
  const errors: string[] = [];

  if (model.appShell.kind !== 'AppShell' || model.appShell.layout !== 'single_note_surface') {
    errors.push('renderer only supports the single note surface AppShell');
  }
  if (model.noteSurface.kind !== 'NoteSurface') {
    errors.push('renderer requires one NoteSurface body');
  }
  if (model.excludedSurfaces.persistentChatPanel !== false) {
    errors.push('chat-first side surface is outside the MVP note surface renderer');
  }
  if (model.excludedSurfaces.aiModeSwitcher !== false) {
    errors.push('AI mode toggle surface is outside the MVP note surface renderer');
  }
  if (model.excludedSurfaces.externalIntegrationsDashboard !== false) {
    errors.push('external integrations dashboard is outside the MVP note surface renderer');
  }
  if (model.noteSurface.blockEditor.emitsAiProviderCall !== false) {
    errors.push('block editor render controls must not emit AI calls');
  }
  if (model.noteSurface.nextOpenDigest.emitsAiProviderCall !== false) {
    errors.push('digest render controls must not emit AI calls');
  }
  if (model.noteSurface.provenancePopover.emitsAiProviderCall !== false) {
    errors.push('provenance render controls must not emit AI calls');
  }
  const organizationLayer = model.noteSurface.organizationLayer as {
    emitsAiProviderCall: boolean;
    mutatesUserAuthoredBlock: boolean;
    defaultLayer: string;
    captureLayerEditable: boolean;
  };
  if (organizationLayer.emitsAiProviderCall !== false) {
    errors.push('organization history controls must not emit AI calls');
  }
  if (organizationLayer.mutatesUserAuthoredBlock !== false) {
    errors.push('organization history controls must not mutate user-authored blocks');
  }
  if (organizationLayer.defaultLayer !== 'organized') {
    errors.push('note surface must default to the organized layer');
  }
  if (organizationLayer.captureLayerEditable !== false) {
    errors.push('capture layer must stay read-only in the MVP note surface');
  }

  for (const block of model.noteSurface.blocks) {
    if (block.aiAssist !== undefined) {
      if (block.aiAssist.emitsAiProviderCall !== false) {
        errors.push(`AI assist block ${block.id} must not emit AI calls during render`);
      }
      if (block.aiAssist.mutatesUserAuthoredBlock !== false) {
        errors.push(`AI assist block ${block.id} must not directly mutate user-authored blocks`);
      }
      for (const action of block.aiAssist.actions) {
        if (action.emitsAiProviderCall !== false || action.mutatesUserAuthoredBlock !== false) {
          errors.push(`AI assist action ${action.id} on block ${block.id} is not render-safe`);
        }
      }
    }

    if (block.memoryCandidate !== undefined) {
      if (
        block.memoryCandidate.emitsAiProviderCall !== false
        || block.memoryCandidate.hiddenProfiling !== false
        || block.memoryCandidate.automaticActiveMemory !== false
      ) {
        errors.push(`memory candidate block ${block.id} must stay review-only during render`);
      }
      for (const action of block.memoryCandidate.actions) {
        if (
          action.emitsAiProviderCall !== false
          || action.hiddenProfiling !== false
          || action.automaticActiveMemory !== false
        ) {
          errors.push(`memory candidate action ${action.id} on block ${block.id} is not render-safe`);
        }
      }
    }
  }

  return errors;
}
