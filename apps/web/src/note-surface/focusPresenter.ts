import type { NoteSurfaceViewModel } from './viewModelTypes.ts';

export function resolveContinueWritingFocusBlockId(
  model: NoteSurfaceViewModel,
  directionId: string | undefined,
): string | undefined {
  if (directionId !== undefined) {
    const direction = model.quietWriting.reEntrySurface.directions.find((entry) => entry.id === directionId);
    if (direction?.focusBlockId !== undefined) {
      return direction.focusBlockId;
    }
  }

  const paragraph = model.noteSurface.blocks.find((block) => (
    block.origin === 'user'
    && block.type === 'paragraph'
    && block.memoryCandidate === undefined
    && block.aiAssist === undefined
  ));
  if (paragraph !== undefined) {
    return paragraph.id;
  }

  return model.noteSurface.blocks.find((block) => (
    block.origin === 'user'
    && block.memoryCandidate === undefined
    && block.aiAssist === undefined
    && block.type !== 'divider'
  ))?.id;
}
