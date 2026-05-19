import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const wranglerUrl = new URL('../../wrangler.toml', import.meta.url);
const workerEntrypointUrl = new URL('../../apps/worker/src/workerEntrypoint.ts', import.meta.url);

test('wrangler config serves web build artifacts through the Worker deployment', async () => {
  const source = await readFile(wranglerUrl, 'utf8');
  const config = parseWranglerConfig(source);

  assert.equal(config.main, 'apps/worker/src/workerEntrypoint.ts');
  assert.equal(config.compatibility_date, '2026-05-19');
  assert.equal(config.assets?.directory, './dist/web');
  assert.deepEqual(config.assets?.run_worker_first, [
    '/api/*',
    '/notes/*',
    '/blocks/*',
    '/ai-operations/*',
    '/memory/*',
    '/provenance/*',
  ]);
});

test('wrangler config keeps API routes Worker-first and static assets asset-first', async () => {
  const source = await readFile(wranglerUrl, 'utf8');
  const config = parseWranglerConfig(source);
  const workerFirst = new Set(config.assets?.run_worker_first ?? []);

  for (const route of ['/notes/*', '/blocks/*', '/ai-operations/*', '/memory/*', '/provenance/*']) {
    assert.equal(workerFirst.has(route), true, `${route} must run Worker script first`);
  }

  assert.equal(workerFirst.has('/*'), false, 'static assets outside API patterns must remain asset-first');
  assert.equal(config.assets?.binding, undefined, 'static assets do not need a runtime binding for MVP routing');
});

test('wrangler config does not inline runtime secrets or tenant identity', async () => {
  const source = await readFile(wranglerUrl, 'utf8');

  assert.doesNotMatch(source, /\b(?:TURSO|LIBSQL|DATABASE|TOKEN|SECRET|PASSWORD|API_KEY|WORKSPACE_ID|USER_ID|AUTH_SHARED_SECRET)\b/i);
  assert.doesNotMatch(source, /\[\[?(?:vars|secrets)\]?\]/i);
});

test('configured Worker main currently exposes a deployable default fetch export', async () => {
  const source = await readFile(workerEntrypointUrl, 'utf8');

  assert.match(source, /export\s+default\s*\{\s*fetch:\s*createWorkerFetchHandler\(\)\s*,?\s*\}/s);
});

function parseWranglerConfig(source) {
  const result = {};
  let currentSection = result;
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = stripComment(lines[index]).trim();
    if (rawLine.length === 0) {
      continue;
    }

    const sectionMatch = rawLine.match(/^\[([A-Za-z0-9_-]+)\]$/);
    if (sectionMatch) {
      result[sectionMatch[1]] ??= {};
      currentSection = result[sectionMatch[1]];
      continue;
    }

    const assignmentMatch = rawLine.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    assert.notEqual(assignmentMatch, null, `unsupported wrangler.toml line: ${rawLine}`);
    const [, key, rawValue] = assignmentMatch;

    if (rawValue === '[') {
      const values = [];
      index += 1;
      for (; index < lines.length; index += 1) {
        const arrayLine = stripComment(lines[index]).trim();
        if (arrayLine === ']') {
          break;
        }
        if (arrayLine.length > 0) {
          values.push(parseTomlScalar(arrayLine.replace(/,$/, '')));
        }
      }
      currentSection[key] = values;
      continue;
    }

    currentSection[key] = parseTomlScalar(rawValue);
  }

  return result;
}

function stripComment(line) {
  const commentStart = line.indexOf('#');
  return commentStart === -1 ? line : line.slice(0, commentStart);
}

function parseTomlScalar(value) {
  const trimmed = value.trim();
  const stringMatch = trimmed.match(/^"([^"]*)"$/);
  if (stringMatch) {
    return stringMatch[1];
  }
  return trimmed;
}
