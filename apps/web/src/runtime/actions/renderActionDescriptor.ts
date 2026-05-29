export interface NoteSurfaceRenderActionDescriptor {
  action: string;
  target: string;
  apiIntent: string;
  blockId?: string;
  noteId?: string;
  noteLeaveCause?: string;
  blockType?: string;
  digestSectionId?: string;
  dataAction?: string;
  content?: string;
  directionId?: string;
  inputCompositionState?: string;
}

export function normalizeNoteSurfaceRenderActionDescriptor(
  eventDescriptor: unknown,
): { ok: true; descriptor: NoteSurfaceRenderActionDescriptor } | { ok: false; errors: readonly string[] } {
  const source = asRecord(eventDescriptor);
  if (source === undefined) {
    return { ok: false, errors: ['eventDescriptor must be an object'] };
  }

  const descriptor = readNoteSurfaceRenderActionDescriptorFromRecord(source);
  const errors: string[] = [];

  if (descriptor.action === undefined || descriptor.action.trim() === '') {
    errors.push('action is required');
  }
  if (descriptor.target === undefined || descriptor.target.trim() === '') {
    errors.push('target is required');
  }
  if (descriptor.apiIntent === undefined || descriptor.apiIntent.trim() === '') {
    errors.push('apiIntent is required');
  }

  if (
    errors.length > 0 ||
    descriptor.action === undefined ||
    descriptor.target === undefined ||
    descriptor.apiIntent === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    descriptor: {
      action: descriptor.action,
      target: descriptor.target,
      apiIntent: descriptor.apiIntent,
      ...optionalString('blockId', descriptor.blockId),
      ...optionalString('noteId', descriptor.noteId),
      ...optionalString('noteLeaveCause', descriptor.noteLeaveCause),
      ...optionalString('blockType', descriptor.blockType),
      ...optionalString('digestSectionId', descriptor.digestSectionId),
      ...optionalString('dataAction', descriptor.dataAction),
      ...optionalString('content', descriptor.content),
      ...optionalString('directionId', descriptor.directionId),
      ...optionalString('inputCompositionState', descriptor.inputCompositionState),
    },
  };
}

export function readNoteSurfaceRenderActionDescriptor(
  eventDescriptor: unknown,
): NoteSurfaceRenderActionDescriptor | undefined {
  const source = asRecord(eventDescriptor);
  if (source === undefined) {
    return undefined;
  }

  const descriptor = readNoteSurfaceRenderActionDescriptorFromRecord(source);
  if (descriptor.action === undefined || descriptor.target === undefined) {
    return undefined;
  }

  return {
    action: descriptor.action,
    target: descriptor.target,
    apiIntent: descriptor.apiIntent ?? 'none',
    ...optionalString('blockId', descriptor.blockId),
    ...optionalString('noteId', descriptor.noteId),
    ...optionalString('noteLeaveCause', descriptor.noteLeaveCause),
    ...optionalString('blockType', descriptor.blockType),
    ...optionalString('digestSectionId', descriptor.digestSectionId),
    ...optionalString('dataAction', descriptor.dataAction),
    ...optionalString('content', descriptor.content),
    ...optionalString('directionId', descriptor.directionId),
    ...optionalString('inputCompositionState', descriptor.inputCompositionState),
  };
}

export function readNoteSurfaceRenderActionDescriptorRawString(
  eventDescriptor: unknown,
  field: string,
): string | undefined {
  const source = asRecord(eventDescriptor);
  if (source === undefined) {
    return undefined;
  }

  const dataset = getDataset(source);
  const value = source[field] ?? dataset?.[field];
  return typeof value === 'string' ? value : undefined;
}

function readNoteSurfaceRenderActionDescriptorFromRecord(source: Record<string, unknown>): {
  action?: string;
  target?: string;
  apiIntent?: string;
  blockId?: string;
  noteId?: string;
  noteLeaveCause?: string;
  blockType?: string;
  digestSectionId?: string;
  dataAction?: string;
  content?: string;
  directionId?: string;
  inputCompositionState?: string;
} {
  const dataset = getDataset(source);
  const sourceAction = readNonEmptyString(source, 'action');
  const datasetAction = readNonEmptyString(dataset, 'action');
  const action = sourceAction ?? readNonEmptyString(source, 'dataAction') ?? datasetAction;
  const dataAction = readNonEmptyString(source, 'dataAction') ?? (sourceAction === undefined ? datasetAction : undefined);

  return {
    ...optionalString('action', action),
    ...optionalString('target', readNonEmptyString(source, 'target') ?? readNonEmptyString(dataset, 'target')),
    ...optionalString('apiIntent', readNonEmptyString(source, 'apiIntent') ?? readNonEmptyString(dataset, 'apiIntent')),
    ...optionalString('blockId', readNonEmptyString(source, 'blockId') ?? readNonEmptyString(dataset, 'blockId')),
    ...optionalString('noteId', readNonEmptyString(source, 'noteId') ?? readNonEmptyString(dataset, 'noteId')),
    ...optionalString(
      'noteLeaveCause',
      readNonEmptyString(source, 'noteLeaveCause') ?? readNonEmptyString(dataset, 'noteLeaveCause'),
    ),
    ...optionalString('blockType', readNonEmptyString(source, 'blockType') ?? readNonEmptyString(dataset, 'blockType')),
    ...optionalString(
      'digestSectionId',
      readNonEmptyString(source, 'digestSectionId') ?? readNonEmptyString(dataset, 'digestSectionId'),
    ),
    ...optionalString('dataAction', dataAction),
    ...optionalString('content', readRawString(source, 'content') ?? readRawString(dataset, 'content')),
    ...optionalString('directionId', readNonEmptyString(source, 'directionId') ?? readNonEmptyString(dataset, 'directionId')),
    ...optionalString(
      'inputCompositionState',
      readNonEmptyString(source, 'inputCompositionState') ?? readNonEmptyString(dataset, 'inputCompositionState'),
    ),
  };
}

function getDataset(source: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(source.dataset)
    ?? asRecord(asRecord(source.currentTarget)?.dataset)
    ?? asRecord(asRecord(source.target)?.dataset);
}

function readNonEmptyString(source: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = source?.[field];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function readRawString(source: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = source?.[field];
  return typeof value === 'string' ? value : undefined;
}

function optionalString<K extends string>(field: K, value: string | undefined): { [P in K]?: string } {
  return value === undefined ? {} : { [field]: value } as { [P in K]?: string };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
