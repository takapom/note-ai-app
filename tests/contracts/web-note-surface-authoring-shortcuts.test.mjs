import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAuthoringShortcutToBlockContent } from '../../apps/web/src/noteSurfaceAuthoringShortcuts.ts';
import { createNoteSurfaceActionInputResolver } from '../../apps/web/src/noteSurfaceActionInputResolver.ts';

test('authoring shortcuts normalize markdown-like prefixes into block intents', () => {
  assert.deepEqual(applyAuthoringShortcutToBlockContent('## MVP scope'), {
    content: 'MVP scope',
    intent: 'heading',
    headingLevel: 2,
  });
  assert.deepEqual(applyAuthoringShortcutToBlockContent('> Keep writing first'), {
    content: 'Keep writing first',
    intent: 'quote',
  });
  assert.deepEqual(applyAuthoringShortcutToBlockContent('- Capture the decision'), {
    content: 'Capture the decision',
    intent: 'bullet',
  });
});

test('provenance resolver does not infer return layer source lookup from source block id', () => {
  const resolveActionInput = createNoteSurfaceActionInputResolver({
    provenanceByBlockId: {
      block_ai_question_001: {
        sourceSpanId: 'source_span_ai_question_001',
        sourceBlockId: 'block_paragraph_001',
        startOffset: 0,
        endOffset: 24,
      },
    },
  });

  assert.equal(resolveActionInput({
    action: 'inspect_source',
    target: 'return_layer',
    blockId: 'block_paragraph_001',
    apiIntent: 'provenance.lookup',
  }), undefined);
});
