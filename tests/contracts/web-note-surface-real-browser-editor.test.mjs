import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const root = new URL('../../', import.meta.url);
const chromeExecutable = findChromeExecutable();

test('real browser editor preserves cursor and reserved status layout across save renders', {
  skip: chromeExecutable === undefined ? 'Google Chrome is required for the real browser editor guard' : false,
  timeout: 45_000,
}, async (context) => {
  assert.ok(chromeExecutable);
  buildWebArtifact();

  const server = await createNoteSurfaceServer();
  let chrome;
  let page;

  try {
    try {
      chrome = await launchChrome(chromeExecutable);
    } catch (error) {
      if (String(error instanceof Error ? error.message : error).includes('Chrome DevTools endpoint did not start')) {
        context.skip('Google Chrome is installed but cannot start DevTools in this sandbox');
        return;
      }
      throw error;
    }

    page = await openPage(chrome.debuggingPort, `${server.origin}/`);
    const result = await evaluate(page, `(${runEditorStabilityScenario.toString()})()`);

    assert.equal(result.mounted, true);
    assert.equal(result.beforeSave.activeBlockId, 'block_paragraph_001');
    assert.equal(result.saving.activeBlockId, 'block_paragraph_001');
    assert.equal(result.saved.activeBlockId, 'block_paragraph_001');
    assert.equal(result.beforeSave.selectedOffset, 18);
    assert.equal(result.saving.selectedOffset, 18);
    assert.equal(result.saved.selectedOffset, 18);
    assert.equal(result.saved.text, result.savedText);
    assert.equal(result.saved.saveStatus, 'saved');
    assert.equal(result.patchBody.content, result.savedText);
    assertStableNumber(result.beforeSave.blockLeft, result.saving.blockLeft, 'block left changed while saving');
    assertStableNumber(result.beforeSave.blockLeft, result.saved.blockLeft, 'block left changed after save');
    assertStableNumber(result.beforeSave.blockWidth, result.saving.blockWidth, 'block width changed while saving');
    assertStableNumber(result.beforeSave.blockWidth, result.saved.blockWidth, 'block width changed after save');
    assertStableNumber(result.beforeSave.statusHeight, result.saving.statusHeight, 'status height changed while saving');
    assertStableNumber(result.beforeSave.statusHeight, result.saved.statusHeight, 'status height changed after save');
  } finally {
    await page?.close();
    await chrome?.close();
    await server.close();
  }
});

function runEditorStabilityScenario() {
  return new Promise((resolve, reject) => {
    const savedText = 'The MVP keeps cursor flow while saving edits.';
    const cursorOffset = 18;

    waitFor(() => document.querySelector('[data-block-id="block_paragraph_001"] [data-block-editor-content="true"]'))
      .then(async () => {
        const editor = readEditor();
        editor.textContent = savedText;
        setSelectionOffset(editor, cursorOffset);
        const beforeSave = snapshot();

        readSaveButton().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await waitFor(() => readBlock().dataset.editorSaveStatus === 'saving');
        const saving = snapshot();
        await waitFor(() => readBlock().dataset.editorSaveStatus === 'saved');
        const saved = snapshot();
        const patchBody = await waitFor(() => window.__annPatchBody);

        resolve({
          mounted: true,
          savedText,
          patchBody,
          beforeSave,
          saving,
          saved,
        });
      })
      .catch(reject);
  });

  function readBlock() {
    const block = document.querySelector('[data-block-id="block_paragraph_001"]');
    if (!(block instanceof HTMLElement)) {
      throw new Error('paragraph block was not mounted');
    }
    return block;
  }

  function readEditor() {
    const editor = readBlock().querySelector('[data-block-editor-content="true"]');
    if (!(editor instanceof HTMLElement)) {
      throw new Error('paragraph editor was not mounted');
    }
    return editor;
  }

  function readSaveButton() {
    const button = readBlock().querySelector('[data-action="save_block"][data-target="block_editor"]');
    if (!(button instanceof HTMLElement)) {
      throw new Error('save button was not mounted');
    }
    return button;
  }

  function snapshot() {
    const block = readBlock();
    const editor = readEditor();
    const status = block.querySelector('[data-editor-status-region="fixed"]');
    if (!(status instanceof HTMLElement)) {
      throw new Error('status region was not mounted');
    }

    const blockRect = block.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    return {
      activeBlockId: document.activeElement?.closest?.('article[data-block-id]')?.dataset.blockId,
      selectedOffset: selectedTextOffset(editor),
      text: editor.textContent,
      saveStatus: block.dataset.editorSaveStatus,
      blockLeft: blockRect.left,
      blockWidth: blockRect.width,
      statusHeight: statusRect.height,
    };
  }

  function setSelectionOffset(element, requestedOffset) {
    element.focus({ preventScroll: true });
    const target = findTextPosition(element, requestedOffset);
    const range = document.createRange();
    range.setStart(target.node, target.offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectedTextOffset(element) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      return -1;
    }

    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) {
      return -1;
    }

    const prefix = range.cloneRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(range.startContainer, range.startOffset);
    return prefix.toString().length;
  }

  function findTextPosition(rootElement, requestedOffset) {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    let consumed = 0;
    let lastTextNode = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      lastTextNode = node;
      const textLength = node.textContent.length;
      if (consumed + textLength >= requestedOffset) {
        return { node, offset: requestedOffset - consumed };
      }
      consumed += textLength;
    }

    return lastTextNode === null
      ? { node: rootElement, offset: 0 }
      : { node: lastTextNode, offset: lastTextNode.textContent.length };
  }

  async function waitFor(predicate) {
    for (let index = 0; index < 100; index += 1) {
      const value = predicate();
      if (value) {
        return value;
      }
      await new Promise((resolveWait) => {
        setTimeout(resolveWait, 25);
      });
    }
    throw new Error('timed out waiting for browser condition');
  }
}

async function createNoteSurfaceServer() {
  const html = await readFile(new URL('dist/web/index.html', root), 'utf8');
  const assetsRoot = new URL('dist/web/', root);
  let patchBody;

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(injectRootDataset(html, `${origin}/api/`));
      return;
    }

    if (requestUrl.pathname === '/__ann/bootstrap' && request.method === 'GET') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      responseJson(response, {
        ok: true,
        apiBaseUrl: `${origin}/api/`,
        workspaceId: 'workspace_001',
        userId: 'user_001',
        noteId: 'note_001',
      });
      return;
    }

    if (requestUrl.pathname.startsWith('/assets/')) {
      try {
        const asset = await readFile(new URL(`.${requestUrl.pathname}`, assetsRoot));
        response.setHeader('content-type', requestUrl.pathname.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        response.end(asset);
      } catch {
        response.writeHead(404).end('not found');
      }
      return;
    }

    if (requestUrl.pathname === '/api/notes/note_001' && request.method === 'GET') {
      responseJson(response, { document: noteDocumentFixture });
      return;
    }

    if (requestUrl.pathname === '/api/notes/note_001/digest' && request.method === 'GET') {
      responseJson(response, { available: false });
      return;
    }

    if (requestUrl.pathname === '/api/blocks/block_paragraph_001' && request.method === 'PATCH') {
      patchBody = JSON.parse(await readRequestBody(request));
      setTimeout(() => {
        responseJson(response, {
          ok: true,
          block: {
            id: 'block_paragraph_001',
            plainText: patchBody.content,
            contentJson: { text: patchBody.content },
          },
        });
      }, 120);
      return;
    }

    if (requestUrl.pathname === '/__ann-test-state') {
      responseJson(response, { patchBody });
      return;
    }

    response.writeHead(404).end('not found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();

  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () => {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      server.close();
    },
  };
}

function injectRootDataset(html, apiBaseUrl) {
  const viewState = JSON.stringify({
    editingBlockIds: ['block_paragraph_001'],
  });

  return html.replace(
    '<main data-note-surface-root></main>',
    [
      '<main data-note-surface-root',
      ` data-api-base-url="${escapeAttribute(apiBaseUrl)}"`,
      ' data-workspace-id="workspace_001"',
      ' data-user-id="user_001"',
      ' data-note-id="note_001"',
      ` data-view-state-json='${viewState}'`,
      '></main>',
      '<script>',
      'window.__annPatchBody = undefined;',
      'const originalFetch = window.fetch.bind(window);',
      'window.fetch = async (...args) => {',
      '  const response = await originalFetch(...args);',
      '  if (String(args[0]).includes("/api/blocks/block_paragraph_001")) {',
      '    window.__annPatchBody = JSON.parse(args[1].body);',
      '  }',
      '  return response;',
      '};',
      '</script>',
    ].join(''),
  );
}

function responseJson(response, body) {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function buildWebArtifact() {
  const result = spawnSync(process.execPath, ['scripts/build-web.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    [
      'node scripts/build-web.mjs failed',
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'),
  );
}

async function launchChrome(executable) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'ann-chrome-'));
  const debuggingPort = await reservePort();
  const processRef = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdio: 'ignore',
  });
  processRef.unref();

  await waitForDevTools(debuggingPort);

  return {
    debuggingPort,
    close: async () => {
      processRef.kill('SIGTERM');
      const exited = await waitForProcessExit(processRef, 1_000);
      if (!exited) {
        processRef.kill('SIGKILL');
        processRef.unref();
        await waitForProcessExit(processRef, 500);
      }
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

async function openPage(debuggingPort, url) {
  const version = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/version`);
  const browser = await CdpClient.connect(version.webSocketDebuggerUrl);
  const created = await browser.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/list`);
  const target = targets.find((entry) => entry.id === created.targetId);
  assert.ok(target?.webSocketDebuggerUrl, 'created Chrome target must expose a page websocket');
  await browser.close();

  const page = await CdpClient.connect(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  const loaded = page.once('Page.loadEventFired');
  await page.send('Page.navigate', { url });
  await loaded;
  return page;
}

async function evaluate(page, expression) {
  const response = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });

  if (response.exceptionDetails !== undefined) {
    throw new Error(response.exceptionDetails.text ?? 'browser evaluation failed');
  }

  return response.result.value;
}

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    const client = new CdpClient(socket);
    await client.opened;
    return client;
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.opened = new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    socket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const waiters = this.eventWaiters.get(method) ?? [];
      waiters.push(resolve);
      this.eventWaiters.set(method, waiters);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return;
    }

    this.socket.close();
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending === undefined) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    const waiters = this.eventWaiters.get(message.method);
    const waiter = waiters?.shift();
    if (waiter !== undefined) {
      waiter(message.params ?? {});
    }
  }
}

async function waitForDevTools(port) {
  for (let index = 0; index < 100; index += 1) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }

  throw new Error('Chrome DevTools endpoint did not start');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return port;
}

function findChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    process.env.CHROME_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
      return candidate;
    }
  }

  return undefined;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function assertStableNumber(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} !== ${expected}`);
}

function waitForProcessExit(processRef, timeoutMs) {
  if (processRef.exitCode !== null || processRef.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      processRef.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    processRef.once('exit', onExit);
  });
}
