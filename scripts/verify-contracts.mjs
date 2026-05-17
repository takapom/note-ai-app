#!/usr/bin/env node
// Contract verification script.
// Authority: docs/contracts/verification-lanes.md

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const failures = [];

async function listFiles(dir, predicate = () => true) {
  const base = join(root, dir);
  const entries = await readdir(base, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(relative, predicate)));
    } else if (predicate(relative)) {
      files.push(relative);
    }
  }

  return files.sort();
}

async function read(path) {
  return readFile(join(root, path), 'utf8');
}

function fail(message) {
  failures.push(message);
}

async function verifyGeneratedRegisterReferences() {
  const register = await read('docs/generated/register.md');
  for (const dir of ['docs/contracts', 'docs/guides', 'docs/runbooks', 'docs/records']) {
    for (const file of await listFiles(dir, (path) => path.endsWith('.md'))) {
      if (!register.includes(`\`${file}\``)) {
        fail(`register is missing ${file}`);
      }
    }
  }
}

async function verifyContractHeaders() {
  const required = [
    'ドキュメント種別:',
    '権威:',
    'オーナー:',
    '付随契約:',
    '生成済み companion:',
    '検証レーン:',
    'ステータス:',
    '## 目的',
    '## この契約が所有するもの',
    '## この契約が所有しないもの',
    '## 不変条件',
    '## 許可されるトポロジー',
    '## 移行用の seam',
    '## 削除対象',
    '## ガード / 検証',
  ];

  for (const file of await listFiles('docs/contracts', (path) => path.endsWith('.md'))) {
    const source = await read(file);
    for (const marker of required) {
      if (!source.includes(marker)) {
        fail(`${file} is missing "${marker}"`);
      }
    }
  }
}

async function verifyForbiddenMvpConcepts() {
  const files = await listFiles('.', (path) => path.endsWith('.md') || path.endsWith('.ts'));
  const allowedPolicyFiles = new Set([
    'docs/contracts/mvp-scope.md',
    'docs/contracts/product-principles.md',
    'docs/contracts/frontend-ui.md',
    'docs/contracts/unified-note-surface.md',
    'docs/contracts/non-functional-requirements.md',
    'docs/contracts/mvp-acceptance.md',
    'docs/guides/implementation-readiness-guide.md',
    'docs/guides/review-guide.md',
    'AGENTS.md',
    'README.md',
  ]);

  for (const file of files) {
    if (file.startsWith('.agents/') || file.startsWith('.codex/') || file === 'ai_native_note_requirements.md') {
      continue;
    }
    const source = await read(file);
    const suspicious = [
      /persistent AI chat panel/i,
      /AI mode switcher/i,
      /keystroke.*LLM/i,
      /Markdown as internal SoT/i,
    ];
    if (!allowedPolicyFiles.has(file) && suspicious.some((pattern) => pattern.test(source))) {
      fail(`${file} mentions a forbidden MVP concept outside an allowed policy context`);
    }
  }
}

async function verifyLiveContractAuthorityComments() {
  for (const file of await listFiles('contexts', (path) => path.endsWith('Contract.ts'))) {
    const source = await read(file);
    if (!source.includes('Authority: docs/contracts/')) {
      fail(`${file} is missing an authority comment`);
    }
  }
}

async function verifyTopologyConstraints() {
  for (const file of await listFiles('contexts', (path) => path.endsWith('.ts'))) {
    const source = await read(file);
    if (/from\s+['"][^'"]*apps\//.test(source)) {
      fail(`${file} imports from apps/*, which violates repository topology`);
    }
    if (/from\s+['"][^'"]*docs\/generated\//.test(source)) {
      fail(`${file} imports from generated docs, which violates repository topology`);
    }
  }
}

async function verifyGeneratedOpenApiAuthority() {
  const source = await read('apps/workspace-api/generated/openapi.json');
  const openapi = JSON.parse(source);
  if (openapi['x-authority-contract'] !== 'docs/contracts/api-events.md') {
    fail('apps/workspace-api/generated/openapi.json must cite docs/contracts/api-events.md as x-authority-contract');
  }
  if (openapi['x-projection-only'] !== true) {
    fail('apps/workspace-api/generated/openapi.json must be marked x-projection-only');
  }
}

await verifyGeneratedRegisterReferences();
await verifyContractHeaders();
await verifyForbiddenMvpConcepts();
await verifyLiveContractAuthorityComments();
await verifyTopologyConstraints();
await verifyGeneratedOpenApiAuthority();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (args.has('--lint')) {
  console.log('lint checks passed.');
} else {
  console.log('contract checks passed.');
}
