import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceActionInputResolver } from '../../apps/web/src/noteSurfaceActionInputResolver.ts';
import { createNoteSurfaceEventController } from '../../apps/web/src/noteSurfaceEventController.ts';

const metadata = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
};

test('action input resolver returns operation ids for AI assist accept and dismiss from caller block maps', () => {
  const resolveActionInput = createNoteSurfaceActionInputResolver({
    operationIdByBlockId: {
      block_ai_accept_001: 'operation_accept_001',
      block_ai_delete_001: 'operation_dismiss_001',
    },
  });

  assert.deepEqual(resolveActionInput({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_accept_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  }), { operationId: 'operation_accept_001' });
  assert.deepEqual(resolveActionInput({
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_delete_001',
    apiIntent: 'ai_assist.dismiss',
  }), { operationId: 'operation_dismiss_001' });
});

test('action input resolver returns memory ids and edit content from caller supplied lookups', () => {
  const resolveActionInput = createNoteSurfaceActionInputResolver({
    memoryIdByBlockId(blockId) {
      return `memory_for_${blockId}`;
    },
    memoryEditContentByBlockId: {
      block_memory_edit_001: 'Remember the source-backed editor preference.',
      block_memory_empty_001: '',
      block_memory_non_string_001: 123,
    },
  });

  for (const [action, apiIntent] of [
    ['remember', 'POST /memory/:memoryId/accept'],
    ['reject', 'POST /memory/:memoryId/reject'],
    ['delete', 'POST /memory/:memoryId/delete'],
    ['snooze', 'POST /memory/:memoryId/hold'],
  ]) {
    assert.deepEqual(resolveActionInput({
      action,
      target: 'memory_candidate_block',
      blockId: `block_memory_${action}_001`,
      apiIntent,
    }), { memoryId: `memory_for_block_memory_${action}_001` });
  }

  assert.deepEqual(resolveActionInput({
    action: 'edit',
    target: 'memory_candidate_block',
    blockId: 'block_memory_edit_001',
    apiIntent: 'POST /memory/:memoryId/edit',
  }), {
    memoryId: 'memory_for_block_memory_edit_001',
    content: 'Remember the source-backed editor preference.',
  });
  assert.deepEqual(resolveActionInput({
    action: 'edit',
    target: 'memory_candidate_block',
    blockId: 'block_memory_empty_001',
    apiIntent: 'memory.edit',
  }), { memoryId: 'memory_for_block_memory_empty_001' });
  assert.deepEqual(resolveActionInput({
    action: 'edit',
    target: 'memory_candidate_block',
    blockId: 'block_memory_non_string_001',
    apiIntent: 'memory.edit',
  }), { memoryId: 'memory_for_block_memory_non_string_001' });
});

test('action input resolver returns block id and plain text content for editor save actions', () => {
  const resolveActionInput = createNoteSurfaceActionInputResolver({});

  assert.deepEqual(resolveActionInput({
    action: 'save_block',
    target: 'block_editor',
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    content: 'Updated user-authored block text.',
    apiIntent: 'block.update',
  }), {
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    content: 'Updated user-authored block text.',
  });
  assert.deepEqual(resolveActionInput({
    action: 'save_block',
    target: 'block_editor',
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
    apiIntent: 'PATCH /blocks/:blockId',
  }), {
    noteId: 'note_001',
    blockId: 'block_paragraph_001',
  });
});

test('action input resolver returns note lifecycle ids with event note id before configured active note id', () => {
  const resolveActionInput = createNoteSurfaceActionInputResolver({
    activeNoteId: 'note_active_001',
    noteIdByTarget: {
      next_open_digest: 'note_target_001',
      writing_chrome: 'note_target_002',
    },
  });

  assert.deepEqual(resolveActionInput({
    action: 'read_digest',
    target: 'next_open_digest',
    noteId: 'note_event_001',
    apiIntent: 'GET /notes/:noteId/digest',
  }), { noteId: 'note_event_001' });
  assert.deepEqual(resolveActionInput({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'digest.read',
  }), { noteId: 'note_active_001' });
  assert.deepEqual(resolveActionInput({
    action: 'manual_organize',
    target: 'writing_chrome',
    noteId: 'note_event_002',
    apiIntent: 'note.manual_structure',
  }), { noteId: 'note_event_002' });
  assert.deepEqual(resolveActionInput({
    action: 'manual_organize',
    target: 'writing_chrome',
    apiIntent: 'POST /notes/:noteId/structure/manual',
  }), { noteId: 'note_active_001' });

  const targetFallback = createNoteSurfaceActionInputResolver({
    noteIdByTarget: {
      next_open_digest: 'note_target_001',
    },
  });
  assert.deepEqual(targetFallback({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'digest.read',
  }), { noteId: 'note_target_001' });
  assert.deepEqual(targetFallback({
    action: 'manual_organize',
    target: 'writing_chrome',
    apiIntent: 'note.manual_structure',
  }), undefined);
});

test('action input resolver returns provenance lookup input from caller block map', () => {
  const provenance = {
    sourceSpanId: 'span_001',
    sourceBlockId: 'block_source_001',
    startOffset: 4,
    endOffset: 42,
  };
  const resolveActionInput = createNoteSurfaceActionInputResolver({
    provenanceByBlockId: {
      block_ai_source_001: provenance,
    },
  });

  assert.deepEqual(resolveActionInput({
    action: 'inspect_source',
    target: 'ai_assist_block',
    blockId: 'block_ai_source_001',
    apiIntent: 'provenance.lookup',
  }), { provenance });
});

test('action input resolver returns undefined for no-op editor actions unsupported intents and missing maps', () => {
  const resolveActionInput = createNoteSurfaceActionInputResolver({
    activeNoteId: 'note_active_001',
    operationIdByBlockId: {
      block_ai_001: 'operation_001',
    },
  });

  for (const action of ['edit_block', 'save_block', 'cancel_edit']) {
    assert.equal(resolveActionInput({
      action,
      target: 'block_editor',
      blockId: 'block_paragraph_001',
      apiIntent: 'none',
    }), undefined);
  }
  assert.equal(resolveActionInput({
    action: 'open_external',
    target: 'ai_assist_block',
    blockId: 'block_ai_001',
    apiIntent: 'POST /external/action',
  }), undefined);
  assert.equal(resolveActionInput({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_missing_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  }), undefined);
  assert.equal(resolveActionInput({
    action: 'inspect_source',
    target: 'ai_assist_block',
    blockId: 'block_missing_001',
    apiIntent: 'provenance.lookup',
  }), undefined);
});

test('action input resolver integrates with the event controller without owning transport policy', async () => {
  const calls = [];
  const controller = createNoteSurfaceEventController({
    ...metadata,
    resolveActionInput: createNoteSurfaceActionInputResolver({
      activeNoteId: 'note_active_001',
      operationIdByBlockId: {
        block_ai_001: 'operation_001',
      },
      memoryIdByBlockId: {
        block_memory_001: 'memory_001',
      },
      memoryEditContentByBlockId: {
        block_memory_001: 'Remember the source-backed editor preference.',
      },
      provenanceByBlockId: {
        block_source_001: {
          sourceSpanId: 'span_001',
          sourceBlockId: 'block_source_001',
          startOffset: 4,
          endOffset: 42,
        },
      },
    }),
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

  for (const event of [
    {
      action: 'save_block',
      target: 'block_editor',
      noteId: 'note_001',
      blockId: 'block_paragraph_001',
      content: 'Updated user-authored block text.',
      apiIntent: 'block.update',
    },
    {
      action: 'adopt',
      target: 'ai_assist_block',
      blockId: 'block_ai_001',
      apiIntent: 'POST /ai-operations/:operationId/accept',
    },
    {
      action: 'edit',
      target: 'memory_candidate_block',
      blockId: 'block_memory_001',
      apiIntent: 'POST /memory/:memoryId/edit',
    },
    {
      action: 'read_digest',
      target: 'next_open_digest',
      apiIntent: 'GET /notes/:noteId/digest',
    },
    {
      action: 'manual_organize',
      target: 'writing_chrome',
      apiIntent: 'POST /notes/:noteId/structure/manual',
    },
    {
      action: 'inspect_source',
      target: 'provenance_popover',
      blockId: 'block_source_001',
      apiIntent: 'POST /provenance/source',
    },
  ]) {
    const result = await controller.handleRenderEvent(event);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'sent');
  }

  assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [
    ['PATCH', '/blocks/block_paragraph_001', {
      noteId: 'note_001',
      content: 'Updated user-authored block text.',
    }],
    ['POST', '/ai-operations/operation_001/accept', undefined],
    ['POST', '/memory/memory_001/edit', { content: 'Remember the source-backed editor preference.' }],
    ['GET', '/notes/note_active_001/digest', undefined],
    ['POST', '/notes/note_active_001/structure/manual', undefined],
    ['POST', '/provenance/source', {
      sourceSpanId: 'span_001',
      sourceBlockId: 'block_source_001',
      startOffset: 4,
      endOffset: 42,
    }],
  ]);
});

test('action input resolver source stays dependency-free and does not own backend actions', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceActionInputResolver.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceActionInputResolver/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|new Request|globalThis\.fetch/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /trim\(/);
});
