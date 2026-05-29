import assert from 'node:assert/strict';
import test from 'node:test';

import { focusEditableBlockSoon } from '../../apps/web/src/note-surface/state/noteSurfaceFocusScheduler.ts';

test('note surface focus scheduler focuses the editable block content after the configured delay', () => {
  const selectors = [];
  const delays = [];
  let focused = false;

  focusEditableBlockSoon('block_001', {
    setTimeout(callback, delay) {
      delays.push(delay);
      callback();
      return 1;
    },
    document: {
      querySelector(selector) {
        selectors.push(selector);
        return {
          focus() {
            focused = true;
          },
        };
      },
    },
  });

  assert.deepEqual(delays, [80]);
  assert.deepEqual(selectors, ['[data-block-id="block_001"] [data-block-editor-content="true"]']);
  assert.equal(focused, true);
});

test('note surface focus scheduler ignores missing block ids and missing documents', () => {
  let timerCalls = 0;

  focusEditableBlockSoon(undefined, {
    setTimeout() {
      timerCalls += 1;
      return 1;
    },
  });
  focusEditableBlockSoon('block_001', {
    setTimeout(callback) {
      timerCalls += 1;
      callback();
      return 1;
    },
  });

  assert.equal(timerCalls, 1);
});
