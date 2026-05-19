import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceDomHost } from '../../apps/web/src/noteSurfaceDomHost.ts';

test('DOM host replaces root HTML through the injected root boundary', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);

  host.setHtml('<main data-surface="single-note">Rendered note surface</main>');

  assert.equal(root.innerHTML, '<main data-surface="single-note">Rendered note surface</main>');
});

test('DOM host delegates click actions and enriches missing apiIntent from render events', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([createRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  })], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  const button = createActionElement({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  });
  const iconInsideButton = {
    closest(selector) {
      assert.equal(selector, '[data-action]');
      return button;
    },
  };

  root.click(iconInsideButton);

  assert.equal(root.listeners.click.length, 1);
  assert.equal(handled.length, 1);
  assert.equal(handled[0].action, 'adopt');
  assert.equal(handled[0].target, 'ai_assist_block');
  assert.equal(handled[0].blockId, 'block_ai_question_001');
  assert.equal(handled[0].apiIntent, 'POST /ai-operations/:operationId/accept');
  assert.equal(handled[0].emitsAiProviderCall, false);
  assert.deepEqual(handled[0].dataset, {
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
  });
});

test('DOM host preserves explicit dataset apiIntent without requiring a render event match', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  root.click(createActionElement({
    action: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'GET /notes/:noteId/digest',
  }));

  assert.equal(handled.length, 1);
  assert.deepEqual(handled[0], {
    dataset: {
      action: 'read_digest',
      target: 'next_open_digest',
      apiIntent: 'GET /notes/:noteId/digest',
    },
    action: 'read_digest',
    dataAction: 'read_digest',
    target: 'next_open_digest',
    apiIntent: 'GET /notes/:noteId/digest',
  });
});

test('DOM host enriches save block clicks with same-block plain text content', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([createRenderEvent({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
    apiIntent: 'block.update',
  })], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  root.click(createSaveActionElement({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
  }, 'Updated user-authored block text.'));

  assert.equal(handled.length, 1);
  assert.equal(handled[0].apiIntent, 'block.update');
  assert.equal(handled[0].content, 'Updated user-authored block text.');
});

test('DOM host marks save descriptors while block input composition is active or pending', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([createRenderEvent({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
    apiIntent: 'block.update',
  })], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  const saveButton = createSaveActionElement({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
  }, 'Composing draft text.');
  const editorContent = saveButton.editorContent;

  root.fire('compositionstart', editorContent);
  root.click(saveButton);
  root.fire('compositionend', editorContent);
  root.click(saveButton);
  root.fire('input', editorContent);
  root.click(saveButton);

  assert.equal(handled.length, 3);
  assert.equal(handled[0].content, 'Composing draft text.');
  assert.equal(handled[0].focusedBlockId, 'block_paragraph_001');
  assert.equal(handled[0].inputCompositionState, 'active');
  assert.equal(handled[1].inputCompositionState, 'pending');
  assert.equal(handled[2].inputCompositionState, undefined);
});

test('DOM host clears composition state when rendered HTML is replaced', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([createRenderEvent({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
    apiIntent: 'block.update',
  })], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  const saveButton = createSaveActionElement({
    action: 'save_block',
    target: 'block_editor',
    blockId: 'block_paragraph_001',
  }, 'Draft after host render replacement.');

  root.fire('compositionstart', saveButton.editorContent);
  host.setHtml('<article data-block-id="block_paragraph_001"></article>');
  root.click(saveButton);

  assert.equal(handled.length, 1);
  assert.equal(handled[0].focusedBlockId, 'block_paragraph_001');
  assert.equal(handled[0].inputCompositionState, undefined);
});

test('DOM host replaces prior click listener on repeated bindActionEvents calls', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([createRenderEvent({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/accept',
  })], async () => {
    handled.push('first');
    return { ok: true, status: 'handled', errors: [] };
  });
  host.bindActionEvents([createRenderEvent({
    action: 'remember',
    target: 'memory_candidate_block',
    blockId: 'block_ai_memory_candidate_001',
    apiIntent: 'POST /memory/:memoryId/accept',
  })], async (descriptor) => {
    handled.push(descriptor.apiIntent);
    return { ok: true, status: 'handled', errors: [] };
  });

  root.click(createActionElement({
    action: 'remember',
    target: 'memory_candidate_block',
    blockId: 'block_ai_memory_candidate_001',
  }));

  assert.equal(root.addedListeners, 5);
  assert.equal(root.removedListeners, 1);
  assert.equal(root.listeners.click.length, 1);
  assert.deepEqual(handled, ['POST /memory/:memoryId/accept']);
});

test('DOM host ignores clicks without a data-action element', () => {
  const root = createFakeRoot();
  const host = createNoteSurfaceDomHost(root);
  const handled = [];

  host.bindActionEvents([], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  root.click({ dataset: { target: 'block_editor' } });

  assert.equal(handled.length, 0);
});

test('DOM host source owns only the thin DOM adapter boundary', async () => {
  const source = await readFile(new URL('../../apps/web/src/noteSurfaceDomHost.ts', import.meta.url), 'utf8');

  assert.match(source, /export function createNoteSurfaceDomHost/);
  assert.match(source, /innerHTML/);
  assert.match(source, /addEventListener/);
  assert.match(source, /closest/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /noteSurfaceEventController|noteSurfaceApiTransport/);
  assert.doesNotMatch(source, /fetch\(|globalThis\.fetch|XMLHttpRequest|new Request/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
});

function createFakeRoot() {
  return {
    innerHTML: '',
    listeners: {
      click: [],
      compositionstart: [],
      compositionend: [],
      input: [],
    },
    addedListeners: 0,
    removedListeners: 0,
    addEventListener(type, listener) {
      this.addedListeners += 1;
      this.listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      this.removedListeners += 1;
      this.listeners[type] = this.listeners[type].filter((entry) => entry !== listener);
    },
    click(target) {
      for (const listener of this.listeners.click) {
        listener({ target });
      }
    },
    fire(type, target) {
      for (const listener of this.listeners[type]) {
        listener({ target });
      }
    },
  };
}

function createActionElement(dataset) {
  const element = {
    dataset,
    closest(selector) {
      assert.equal(selector, '[data-action]');
      return element;
    },
  };
  return element;
}

function createSaveActionElement(dataset, content) {
  const article = {
    dataset: {
      blockId: dataset.blockId,
    },
    querySelector(selector) {
      assert.equal(selector, '[data-block-editor-content="true"]');
      return contentElement;
    },
  };
  const contentElement = {
    textContent: content,
    closest(selector) {
      assert.equal(selector, 'article[data-block-id]');
      return article;
    },
  };
  const button = {
    dataset,
    editorContent: contentElement,
    closest(selector) {
      if (selector === '[data-action]') {
        return button;
      }
      assert.equal(selector, 'article[data-block-id]');
      return article;
    },
  };
  return button;
}

function createRenderEvent(overrides) {
  return {
    label: overrides.action,
    dataAction: overrides.action,
    noteId: 'note_001',
    blockType: 'paragraph',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
    ...overrides,
  };
}
