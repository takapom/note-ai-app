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
    action: 'delete',
    target: 'ai_assist_block',
    blockId: 'block_ai_question_001',
    apiIntent: 'POST /ai-operations/:operationId/dismiss',
  })], async (descriptor) => {
    handled.push(descriptor);
    return { ok: true, status: 'handled', errors: [] };
  });

  const button = createActionElement({
    action: 'delete',
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
  assert.equal(handled[0].action, 'delete');
  assert.equal(handled[0].target, 'ai_assist_block');
  assert.equal(handled[0].blockId, 'block_ai_question_001');
  assert.equal(handled[0].apiIntent, 'POST /ai-operations/:operationId/dismiss');
  assert.equal(handled[0].emitsAiProviderCall, false);
  assert.deepEqual(handled[0].dataset, {
    action: 'delete',
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

test('DOM host preserves markdown-like shortcut text for backend-owned block update semantics', () => {
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
  }, '## Backend owns structural conversion'));

  assert.equal(handled.length, 1);
  assert.equal(handled[0].content, '## Backend owns structural conversion');
});

test('DOM host snapshots dirty user-authored block drafts without transforming text', () => {
  const root = createFakeRoot({
    articles: [
      createBlockArticle({
        blockId: 'block_paragraph_001',
        origin: 'user',
        saveStatus: 'dirty',
        content: '  ## Backend owns this shortcut text  ',
      }),
      createBlockArticle({
        blockId: 'block_paragraph_002',
        origin: 'user',
        saveStatus: 'error',
        content: 'Retryable local draft.',
      }),
    ],
  });
  const host = createNoteSurfaceDomHost(root);

  const drafts = host.readDirtyBlockDrafts();

  assert.deepEqual(drafts, [
    {
      blockId: 'block_paragraph_001',
      content: '  ## Backend owns this shortcut text  ',
    },
    {
      blockId: 'block_paragraph_002',
      content: 'Retryable local draft.',
    },
  ]);
});

test('DOM host excludes non-user, saved, and in-flight block drafts from snapshots', () => {
  const root = createFakeRoot({
    articles: [
      createBlockArticle({
        blockId: 'block_user_saved_001',
        origin: 'user',
        saveStatus: 'saved',
        content: 'Already saved user text.',
      }),
      createBlockArticle({
        blockId: 'block_user_saving_001',
        origin: 'user',
        saveStatus: 'saving',
        content: 'In-flight user text.',
      }),
      createBlockArticle({
        blockId: 'block_ai_001',
        origin: 'ai',
        saveStatus: 'dirty',
        content: 'AI assist draft must not flush as user content.',
      }),
      createBlockArticle({
        blockId: 'block_memory_001',
        origin: 'ai',
        saveStatus: 'error',
        content: 'Memory candidate draft must not flush as user content.',
      }),
      createBlockArticle({
        blockId: 'block_user_dirty_001',
        origin: 'user',
        saveStatus: 'dirty',
        content: 'Only this user draft is eligible.',
      }),
    ],
  });
  const host = createNoteSurfaceDomHost(root);

  const drafts = host.readDirtyBlockDrafts();

  assert.deepEqual(drafts, [
    {
      blockId: 'block_user_dirty_001',
      content: 'Only this user draft is eligible.',
    },
  ]);
});

test('DOM host marks dirty draft snapshots while input composition is active or pending', () => {
  const article = createBlockArticle({
    blockId: 'block_paragraph_001',
    origin: 'user',
    saveStatus: 'dirty',
    content: 'IME draft text.',
  });
  const root = createFakeRoot({ articles: [article] });
  const host = createNoteSurfaceDomHost(root);

  root.fire('compositionstart', article.editorContent);
  const active = host.readDirtyBlockDrafts();
  root.fire('compositionend', article.editorContent);
  const pending = host.readDirtyBlockDrafts();
  root.fire('input', article.editorContent);
  const idle = host.readDirtyBlockDrafts();

  assert.deepEqual(active, [{
    blockId: 'block_paragraph_001',
    content: 'IME draft text.',
    inputCompositionState: 'active',
  }]);
  assert.deepEqual(pending, [{
    blockId: 'block_paragraph_001',
    content: 'IME draft text.',
    inputCompositionState: 'pending',
  }]);
  assert.deepEqual(idle, [{
    blockId: 'block_paragraph_001',
    content: 'IME draft text.',
  }]);
});

test('DOM host marks edited user-authored blocks dirty on input for page leave flush', () => {
  const article = createBlockArticle({
    blockId: 'block_paragraph_001',
    origin: 'user',
    saveStatus: 'saved',
    content: 'Draft typed before reload.',
  });
  const root = createFakeRoot({ articles: [article] });
  const host = createNoteSurfaceDomHost(root);

  root.fire('input', article.editorContent);

  assert.equal(article.dataset.editorSaveStatus, 'dirty');
  assert.equal(article.statusRegion.dataset.editorSaveStatus, 'dirty');
  assert.equal(article.statusMessage.textContent, '未保存の変更');
  assert.deepEqual(host.readDirtyBlockDrafts(), [{
    blockId: 'block_paragraph_001',
    content: 'Draft typed before reload.',
  }]);
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

function createFakeRoot(options = {}) {
  return {
    innerHTML: '',
    articles: options.articles ?? [],
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
    querySelectorAll(selector) {
      assert.equal(selector, 'article[data-block-id][data-block-origin="user"]');
      return this.articles.filter((article) => article.dataset.blockOrigin === 'user');
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

function createBlockArticle({ blockId, origin, saveStatus, content }) {
  const statusRegion = {
    dataset: {
      editorSaveStatus: saveStatus,
    },
  };
  const statusMessage = {
    textContent: saveStatus === 'saved' ? '保存済み' : '未保存の変更',
  };
  const article = {
    dataset: {
      blockId,
      blockOrigin: origin,
      editorSaveStatus: saveStatus,
    },
    querySelector(selector) {
      if (selector === '[data-block-editor-content="true"]') {
        return contentElement;
      }
      if (selector === '[data-editor-status-region="fixed"]') {
        return statusRegion;
      }
      if (selector === '[data-editor-status-message="true"]') {
        return statusMessage;
      }
      assert.fail(`unexpected selector: ${selector}`);
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
  article.editorContent = contentElement;
  article.statusRegion = statusRegion;
  article.statusMessage = statusMessage;
  return article;
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
