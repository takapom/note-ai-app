import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceEventController } from '../../apps/web/src/noteSurfaceEventController.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('event controller sends AI assist accept and dismiss through the intent mapper and transport', async () => {
  const calls = [];
  const controller = createController(calls, (event) => ({
    operationId: event.action === 'adopt' ? 'operation_accept_001' : 'operation_dismiss_001',
  }));

  const accept = await controller.handleRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  });
  const dismiss = await controller.handleRenderEvent({
    dataset: {
      action: 'delete',
      target: 'ai_assist_block',
      blockId: 'block_ai_question_001',
      apiIntent: 'POST /ai-operations/:operationId/dismiss',
    },
  });

  assert.equal(accept.ok, true);
  assert.equal(accept.status, 'sent');
  assert.equal(dismiss.ok, true);
  assert.equal(dismiss.status, 'sent');
  assert.deepEqual(calls.map((call) => [call.method, call.path]), [
    ['POST', '/ai-operations/operation_accept_001/accept'],
    ['POST', '/ai-operations/operation_dismiss_001/dismiss'],
  ]);
});

test('event controller sends memory remember reject edit delete and snooze actions', async () => {
  const calls = [];
  const controller = createController(calls, (event) => ({
    memoryId: `memory_${event.action}_001`,
    content: event.action === 'edit' ? 'Remember the source-backed editor preference.' : undefined,
  }));

  const events = [
    ['remember', 'POST /memory/:memoryId/accept'],
    ['reject', 'POST /memory/:memoryId/reject'],
    ['edit', 'POST /memory/:memoryId/edit'],
    ['delete', 'POST /memory/:memoryId/delete'],
    ['snooze', 'POST /memory/:memoryId/hold'],
  ];

  for (const [action, apiIntent] of events) {
    const result = await controller.handleRenderEvent({
      action,
      target: 'memory_candidate_block',
      blockId: 'block_ai_memory_candidate_001',
      apiIntent,
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'sent');
  }

  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['POST', '/memory/memory_remember_001/accept', undefined],
    ['POST', '/memory/memory_reject_001/reject', undefined],
    ['POST', '/memory/memory_edit_001/edit', { content: 'Remember the source-backed editor preference.' }],
    ['POST', '/memory/memory_delete_001/delete', undefined],
    ['POST', '/memory/memory_snooze_001/hold', undefined],
  ]);
});

test('event controller sends explicit block editor save actions as block update requests', async () => {
  const calls = [];
  const controller = createController(calls, (event) => ({
    noteId: event.noteId,
    blockId: event.blockId,
    content: event.content,
  }));

  const result = await controller.handleRenderEvent({
    action: 'save_block',
    target: 'block_editor',
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    content: 'Updated user-authored block text.',
    apiIntent: 'block.update',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['PATCH', '/blocks/block_paragraph_001', {
      noteId: 'note_001',
      content: 'Updated user-authored block text.',
    }],
  ]);
});

test('event controller sends block create and delete requests from caller-resolved ids', async () => {
  const calls = [];
  const controller = createController(calls, (event) => ({
    noteId: event.noteId,
    blockId: event.blockId,
    content: event.content,
  }));

  const create = await controller.handleRenderEvent({
    action: 'create_block',
    target: 'block_editor',
    noteId: 'note_001',
    content: 'New backend-owned paragraph.',
    apiIntent: 'POST /notes/:noteId/blocks',
  });
  const deleteBlock = await controller.handleRenderEvent({
    action: 'delete_block',
    target: 'block_editor',
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    apiIntent: 'DELETE /blocks/:blockId',
  });

  assert.equal(create.ok, true);
  assert.equal(deleteBlock.ok, true);
  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['POST', '/notes/note_001/blocks', {
      content: 'New backend-owned paragraph.',
    }],
    ['DELETE', '/blocks/block_paragraph_001', {
      noteId: 'note_001',
    }],
  ]);
});

test('event controller sends note read digest read and provenance lookup actions from caller-resolved ids', async () => {
  const calls = [];
  const controller = createController(calls, (event) => {
    if (event.target === 'thin_rail' || event.target === 'next_open_digest' || event.target === 'writing_chrome') {
      return { noteId: event.noteId ?? 'note_001' };
    }
    return {
      provenance: {
        sourceSpanId: 'span_001',
        sourceBlockId: 'block_source_001',
        startOffset: 4,
        endOffset: 42,
      },
    };
  });

  const noteRead = await controller.handleRenderEvent({
    action: 'open_recent_thought',
    target: 'thin_rail',
    noteId: 'note_recent_001',
    apiIntent: 'GET /notes/:noteId',
  });
  const digest = await controller.handleRenderEvent({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'GET /notes/:noteId/digest',
  });
  const manualStructure = await controller.handleRenderEvent({
    action: 'manual_organize',
    target: 'writing_chrome',
    apiIntent: 'POST /notes/:noteId/structure/manual',
  });
  const provenance = await controller.handleRenderEvent({
    action: 'inspect_source',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'provenance.lookup',
  });

  assert.equal(noteRead.ok, true);
  assert.equal(digest.ok, true);
  assert.equal(manualStructure.ok, true);
  assert.equal(provenance.ok, true);
  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['GET', '/notes/note_recent_001', undefined],
    ['GET', '/notes/note_001/digest', undefined],
    ['POST', '/notes/note_001/structure/manual', undefined],
    ['POST', '/provenance/source', {
      sourceSpanId: 'span_001',
      sourceBlockId: 'block_source_001',
      startOffset: 4,
      endOffset: 42,
    }],
  ]);
});

test('event controller treats editor apiIntent none actions as no-ops without resolving ids or sending transport', async () => {
  const calls = [];
  let resolveCalls = 0;
  const controller = createController(calls, () => {
    resolveCalls += 1;
    return { operationId: 'operation_should_not_send' };
  });

  const results = [];
  for (const action of ['edit_block', 'save_block', 'cancel_edit']) {
    results.push(await controller.handleRenderEvent({
      action,
      target: 'block_editor',
      blockId: 'block_paragraph_001',
      apiIntent: 'none',
    }));
  }

  assert.deepEqual(results, [{
    ok: true,
    status: 'noop',
    errors: [],
  }, {
    ok: true,
    status: 'noop',
    errors: [],
  }, {
    ok: true,
    status: 'noop',
    errors: [],
  }]);
  assert.equal(resolveCalls, 0);
  assert.equal(calls.length, 0);
});

test('event controller returns errors and does not call transport for invalid mappings', async () => {
  const calls = [];
  const controller = createController(calls, () => ({}));

  const missingOperation = await controller.handleRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  });
  const missingContent = await controller.handleRenderEvent({
    action: 'edit',
    target: 'memory_candidate_block',
    blockId: 'block_ai_memory_candidate_001',
    apiIntent: 'POST /memory/:memoryId/edit',
  });
  const invalidEvent = await controller.handleRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
  });
  const missingProvenance = await controller.handleRenderEvent({
    action: 'inspect_source',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'provenance.lookup',
  });

  assert.equal(missingOperation.ok, false);
  assert.equal(missingOperation.status, 'invalid_mapping');
  assert.match(missingOperation.errors.join('\n'), /operationId is required/);
  assert.equal(missingContent.ok, false);
  assert.equal(missingContent.status, 'invalid_mapping');
  assert.match(missingContent.errors.join('\n'), /memoryId is required/);
  assert.match(missingContent.errors.join('\n'), /content is required/);
  assert.equal(invalidEvent.ok, false);
  assert.equal(invalidEvent.status, 'invalid_event');
  assert.match(invalidEvent.errors.join('\n'), /apiIntent is required/);
  assert.equal(missingProvenance.ok, false);
  assert.equal(missingProvenance.status, 'invalid_mapping');
  assert.match(missingProvenance.errors.join('\n'), /provenance is required/);
  assert.equal(calls.length, 0);
});

test('event controller returns structured errors and does not send invalid provenance mapping', async () => {
  const calls = [];
  const controller = createController(calls, () => ({
    provenance: {
      sourceSpanId: 'span_001',
      sourceBlockId: 'block_source_001',
      startOffset: 42,
      endOffset: 4,
    },
  }));

  const result = await controller.handleRenderEvent({
    action: 'inspect_source',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'provenance.lookup',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_mapping');
  assert.match(result.errors.join('\n'), /endOffset must be greater than or equal to startOffset/);
  assert.equal(calls.length, 0);
});

test('event controller rejects invalid runtime metadata before resolving ids or sending transport', async () => {
  const calls = [];
  let resolveCalls = 0;
  const controller = createNoteSurfaceEventController({
    workspaceId: 'workspace_unset',
    userId: ' user_001',
    resolveActionInput() {
      resolveCalls += 1;
      return { operationId: 'operation_001' };
    },
    transport: {
      async send(request) {
        calls.push(request);
        return {
          ok: true,
          status: 200,
          errors: [],
        };
      },
    },
  });

  const result = await controller.handleRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_mapping');
  assert.deepEqual(result.errors, [
    'workspaceId must be a stable non-sentinel runtime id',
    'userId must be a stable non-sentinel runtime id',
  ]);
  assert.equal(resolveCalls, 0);
  assert.equal(calls.length, 0);
});

test('event controller converts transport exceptions into transport errors', async () => {
  const controller = createNoteSurfaceEventController({
    ...metadata,
    resolveActionInput() {
      return { operationId: 'operation_001' };
    },
    transport: {
      async send() {
        throw new Error('network unavailable');
      },
    },
  });

  const result = await controller.handleRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'transport_error');
  assert.equal(result.request.path, '/ai-operations/operation_001/accept');
  assert.deepEqual(result.errors, ['transport failed: network unavailable']);
});

test('event controller source stays dependency-free and does not own runtime or mutation behavior', async () => {
  const facadeSource = await readFile(new URL('../../apps/web/src/noteSurfaceEventController.ts', import.meta.url), 'utf8');
  const source = await readFile(
    new URL('../../apps/web/src/runtime/actions/noteSurfaceEventController.ts', import.meta.url),
    'utf8',
  );

  assert.match(facadeSource, /export \* from '\.\/runtime\/actions\/noteSurfaceEventController\.ts'/);
  assert.match(source, /export function createNoteSurfaceEventController/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|new Request|globalThis\.fetch/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
});

function createController(calls, resolveActionInput) {
  return createNoteSurfaceEventController({
    ...metadata,
    resolveActionInput,
    transport: {
      async send(request) {
        calls.push(request);
        return {
          ok: true,
          status: 200,
          body: { handled: true },
          errors: [],
        };
      },
    },
  });
}
