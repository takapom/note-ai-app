import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAiAssistOperationApiIntent,
  isAiAssistProjectionResultApiIntent,
  isBlockUpdateApiIntent,
  isCanonicalRenderApiIntent,
  isDigestReadApiIntent,
  isMemoryEditApiIntent,
  isMemoryReviewApiIntent,
  isNoteLifecycleApiIntent,
  isProvenanceLookupApiIntent,
  matchesRenderApiIntentKind,
  resolveRenderApiIntentKind,
} from '../../apps/web/src/runtime/actions/renderActionIntents.ts';

test('render action intents resolve canonical and Worker route aliases to product intent kinds', () => {
  assert.equal(resolveRenderApiIntentKind('ai_assist.accept'), 'ai_assist.accept');
  assert.equal(resolveRenderApiIntentKind('POST /ai-operations/:operationId/dismiss'), 'ai_assist.dismiss');
  assert.equal(resolveRenderApiIntentKind('POST /memory/:memoryId/hold'), 'memory.snooze');
  assert.equal(resolveRenderApiIntentKind('PATCH /blocks/:blockId'), 'block.update');
  assert.equal(resolveRenderApiIntentKind('POST /notes/:noteId/structure/manual'), 'note.manual_structure');
  assert.equal(resolveRenderApiIntentKind('POST /external/action'), undefined);
});

test('render action intents keep caller predicates at product intent granularity', () => {
  assert.equal(isAiAssistOperationApiIntent('POST /ai-operations/:operationId/accept'), true);
  assert.equal(isAiAssistOperationApiIntent('ai_assist.dismiss'), true);
  assert.equal(isMemoryEditApiIntent('POST /memory/:memoryId/edit'), true);
  assert.equal(isMemoryReviewApiIntent('POST /memory/:memoryId/delete'), true);
  assert.equal(isBlockUpdateApiIntent('PATCH /blocks/:blockId'), true);
  assert.equal(isDigestReadApiIntent('GET /notes/:noteId/digest'), true);
  assert.equal(isNoteLifecycleApiIntent('note.manual_structure'), true);
  assert.equal(isProvenanceLookupApiIntent('POST /provenance/source'), true);
  assert.equal(matchesRenderApiIntentKind('POST /notes/:noteId/leave', 'note.leave'), true);
});

test('render action intents preserve exact canonical checks for local projection behavior', () => {
  assert.equal(isCanonicalRenderApiIntent('block.update', 'block.update'), true);
  assert.equal(isCanonicalRenderApiIntent('PATCH /blocks/:blockId', 'block.update'), false);
});

test('render action intents keep AI assist projection result aliases separate from request aliases', () => {
  assert.equal(isAiAssistProjectionResultApiIntent('ai.operation.accept'), true);
  assert.equal(isAiAssistProjectionResultApiIntent('ai.operation.dismiss'), true);
  assert.equal(isAiAssistProjectionResultApiIntent('POST /ai-operations/:operationId/accept'), true);
  assert.equal(isAiAssistProjectionResultApiIntent('POST /ai-operations/:operationId/dismiss'), true);
  assert.equal(isAiAssistProjectionResultApiIntent('ai_assist.accept'), false);
});
