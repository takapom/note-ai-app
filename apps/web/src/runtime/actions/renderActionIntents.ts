import type { NoteSurfaceApiIntentKind } from '../../noteSurfaceApiIntents.ts';

const renderApiIntentAliases: Readonly<Record<string, NoteSurfaceApiIntentKind>> = {
  'POST /ai-operations/:operationId/accept': 'ai_assist.accept',
  'POST /ai-operations/:operationId/dismiss': 'ai_assist.dismiss',
  'POST /memory/:memoryId/accept': 'memory.remember',
  'POST /memory/:memoryId/reject': 'memory.reject',
  'POST /memory/:memoryId/edit': 'memory.edit',
  'POST /memory/:memoryId/delete': 'memory.delete',
  'POST /memory/:memoryId/hold': 'memory.snooze',
  'POST /notes/:noteId/blocks': 'block.create',
  'PATCH /blocks/:blockId': 'block.update',
  'DELETE /blocks/:blockId': 'block.delete',
  'POST /notes/:noteId/leave': 'note.leave',
  'POST /notes/:noteId/structure/manual': 'note.manual_structure',
  'GET /notes/:noteId/digest': 'digest.read',
  'POST /provenance/source': 'provenance.lookup',
  'ai_assist.accept': 'ai_assist.accept',
  'ai_assist.dismiss': 'ai_assist.dismiss',
  'memory.remember': 'memory.remember',
  'memory.reject': 'memory.reject',
  'memory.edit': 'memory.edit',
  'memory.delete': 'memory.delete',
  'memory.snooze': 'memory.snooze',
  'block.create': 'block.create',
  'block.update': 'block.update',
  'block.delete': 'block.delete',
  'note.leave': 'note.leave',
  'note.manual_structure': 'note.manual_structure',
  'digest.read': 'digest.read',
  'provenance.lookup': 'provenance.lookup',
};

export function resolveRenderApiIntentKind(apiIntent: string): NoteSurfaceApiIntentKind | undefined {
  return renderApiIntentAliases[apiIntent];
}

export function matchesRenderApiIntentKind(
  apiIntent: string,
  ...kinds: readonly NoteSurfaceApiIntentKind[]
): boolean {
  const resolved = resolveRenderApiIntentKind(apiIntent);
  return resolved !== undefined && kinds.includes(resolved);
}

export function isCanonicalRenderApiIntent(
  apiIntent: string,
  kind: NoteSurfaceApiIntentKind,
): boolean {
  return apiIntent === kind;
}

export function isAiAssistOperationApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(apiIntent, 'ai_assist.accept', 'ai_assist.dismiss');
}

export function isMemoryEditApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(apiIntent, 'memory.edit');
}

export function isMemoryReviewApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(
    apiIntent,
    'memory.remember',
    'memory.reject',
    'memory.delete',
    'memory.snooze',
  );
}

export function isBlockUpdateApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(apiIntent, 'block.update');
}

export function isDigestReadApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(apiIntent, 'digest.read');
}

export function isNoteLifecycleApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(apiIntent, 'note.leave', 'note.manual_structure');
}

export function isProvenanceLookupApiIntent(apiIntent: string): boolean {
  return matchesRenderApiIntentKind(apiIntent, 'provenance.lookup');
}

export function isAiAssistProjectionResultApiIntent(apiIntent: string): boolean {
  return (
    apiIntent === 'ai.operation.accept'
    || apiIntent === 'ai.operation.dismiss'
    || apiIntent === 'POST /ai-operations/:operationId/accept'
    || apiIntent === 'POST /ai-operations/:operationId/dismiss'
  );
}
