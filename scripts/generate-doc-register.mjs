#!/usr/bin/env node
// Generates docs/generated/register.md.
// Authority: docs/contracts/documentation-system.md

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const registerPath = join(root, 'docs/generated/register.md');
const args = new Set(process.argv.slice(2));

async function listMarkdown(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${dir}/${entry.name}`)
    .sort();
}

function section(title, paths) {
  return [`## ${title}`, '', ...paths.map((path) => `- \`${path}\``), ''].join('\n');
}

async function buildRegister() {
  const contracts = await listMarkdown('docs/contracts');
  const guides = await listMarkdown('docs/guides');
  const runbooks = await listMarkdown('docs/runbooks');
  const records = await listMarkdown('docs/records');

  return [
    '# 生成ドキュメントレジスター',
    '',
    'ドキュメント種別: 生成。マシン所有の証跡です。手動で編集してはいけません。',
    '',
    section('コントラクト', contracts),
    section('ガイド', guides),
    section('ランブック', runbooks),
    section('記録', records),
    '## スキル',
    '',
    '`.agents/skills/**/SKILL.md` を参照してください。',
    '',
    '## サブエージェントブリーフ',
    '',
    '`agents/subagents/*.md` を参照してください。',
    '',
  ].join('\n');
}

const next = await buildRegister();

if (args.has('--check')) {
  const current = await readFile(registerPath, 'utf8');
  if (current !== next) {
    console.error('docs/generated/register.md is stale. Run npm run docs:register.');
    process.exit(1);
  }
  console.log('docs/generated/register.md is current.');
} else {
  await writeFile(registerPath, next);
  console.log('updated docs/generated/register.md');
}
