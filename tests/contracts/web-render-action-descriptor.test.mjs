import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeNoteSurfaceRenderActionDescriptor,
  readNoteSurfaceRenderActionDescriptor,
  readNoteSurfaceRenderActionDescriptorRawString,
} from '../../apps/web/src/runtime/actions/renderActionDescriptor.ts';

test('render action descriptor normalizes direct fields before dataset fields', () => {
  const normalized = normalizeNoteSurfaceRenderActionDescriptor({
    action: 'save_block',
    target: 'block_editor',
    apiIntent: 'block.update',
    blockId: 'block_source_001',
    content: '',
    dataset: {
      action: 'delete',
      target: 'ai_assist_block',
      apiIntent: 'POST /ai-operations/:operationId/dismiss',
      blockId: 'block_dataset_001',
      content: 'dataset content',
    },
  });

  assert.deepEqual(normalized, {
    ok: true,
    descriptor: {
      action: 'save_block',
      target: 'block_editor',
      apiIntent: 'block.update',
      blockId: 'block_source_001',
      content: '',
    },
  });
});

test('render action descriptor reads current target and target dataset fallbacks', () => {
  assert.deepEqual(readNoteSurfaceRenderActionDescriptor({
    currentTarget: {
      dataset: {
        action: 'remember',
        target: 'memory_candidate_block',
        apiIntent: 'POST /memory/:memoryId/accept',
        blockId: 'block_memory_001',
      },
    },
  }), {
    action: 'remember',
    target: 'memory_candidate_block',
    apiIntent: 'POST /memory/:memoryId/accept',
    blockId: 'block_memory_001',
    dataAction: 'remember',
  });

  assert.deepEqual(readNoteSurfaceRenderActionDescriptor({
    target: {
      dataset: {
        action: 'expand_digest',
        target: 'next_open_digest',
      },
    },
  }), {
    action: 'expand_digest',
    target: 'next_open_digest',
    apiIntent: 'none',
    dataAction: 'expand_digest',
  });
});

test('render action descriptor treats dataAction as the action alias', () => {
  assert.deepEqual(readNoteSurfaceRenderActionDescriptor({
    dataAction: 'continue_writing',
    target: 're_entry_surface',
    apiIntent: 'none',
    directionId: 'direction_001',
  }), {
    action: 'continue_writing',
    target: 're_entry_surface',
    apiIntent: 'none',
    dataAction: 'continue_writing',
    directionId: 'direction_001',
  });
});

test('render action descriptor reports required field errors for normalized events', () => {
  const normalized = normalizeNoteSurfaceRenderActionDescriptor({
    dataset: {
      action: ' ',
      target: 'block_editor',
    },
  });

  assert.equal(normalized.ok, false);
  assert.deepEqual(normalized.errors, [
    'action is required',
    'apiIntent is required',
  ]);
});

test('render action descriptor raw string reader preserves empty content without coercion', () => {
  assert.equal(readNoteSurfaceRenderActionDescriptorRawString({
    target: {
      dataset: {
        content: '',
      },
    },
  }, 'content'), '');
  assert.equal(readNoteSurfaceRenderActionDescriptorRawString({
    dataset: {
      content: 123,
    },
  }, 'content'), undefined);
  assert.equal(readNoteSurfaceRenderActionDescriptorRawString(undefined, 'content'), undefined);
});
