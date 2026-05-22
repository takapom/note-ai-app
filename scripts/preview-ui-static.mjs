#!/usr/bin/env node

import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { renderNoteSurfaceHtml } from '../apps/web/src/noteSurfaceHtmlRenderer.ts';
import { createNoteSurfaceViewModel } from '../apps/web/src/noteSurface.ts';

const outputPath = new URL('../dist/web/preview-static.html', import.meta.url);
const indexPath = new URL('../apps/web/public/index.html', import.meta.url);
const distRoot = new URL('../dist/web/', import.meta.url);

async function main() {
  const serve = process.argv.includes('--serve');
  const document = createPreviewDocument();
  const { html } = renderNoteSurfaceHtml(createNoteSurfaceViewModel(document, {
    workspaceName: 'ANN',
    expandedDigest: true,
    sourceSpanIdByBlockId: {
      block_ai_assist_preview_001: 'source_span_ai_assist_preview_001',
    },
    recentThoughts: [
      { id: document.note.id, title: 'プロダクトUIの方向性', updatedLabel: '昨日・更新', active: true },
      { id: 'note_ai_assist', title: 'AI補助のあり方', updatedLabel: '2日前・更新' },
      { id: 'note_memory', title: 'メモリの扱い方', updatedLabel: '3日前・更新' },
      { id: 'note_boundary', title: '構造化の境界', updatedLabel: '4日前・更新' },
      { id: 'note_design', title: '設計メモ', updatedLabel: '5日前・更新' },
    ],
    nextOpenDigest: {
      available: true,
      unresolvedQuestions: [
        {
          id: 'digest_preview_001',
          text: 'AIはチャットではなく、書く面の中に静かに存在する',
        },
        {
          id: 'digest_preview_002',
          text: '書く体験を最優先にし、整理は後から自然に戻す',
        },
        {
          id: 'digest_preview_003',
          text: 'ユーザーの本文がSource of Truth、AIは提案として扱う',
        },
      ],
      decisions: [
        { id: 'digest_decision_001', text: 'AI補助は承認待ちではなく、同じノート面に戻す' },
      ],
    },
  }));

  const indexHtml = await readFile(indexPath, 'utf8');
  const styleMatch = indexHtml.match(/<style>[\s\S]*?<\/style>/);
  const style = styleMatch?.[0] ?? '';

  const page = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Native Note — 静的プレビュー</title>
    ${style}
  </head>
  <body>
    ${html}
  </body>
</html>
`;

  await writeFile(outputPath, page, 'utf8');
  process.stdout.write(`Wrote ${outputPath.pathname}\n`);

  if (!serve) {
    process.stdout.write('Open the file directly, or run:\n');
    process.stdout.write('  node scripts/preview-ui-static.mjs --serve\n');
    return;
  }

  const port = process.env.PREVIEW_STATIC_PORT ?? '4173';
  process.stdout.write(`Serving dist/web at http://127.0.0.1:${port}/preview-static.html\n`);
  serveDist(Number(port));
}

function createPreviewDocument() {
  const now = Date.now();
  const noteId = 'note_product_ui_direction';
  const workspaceId = 'workspace_local_preview';

  return {
    note: {
      id: noteId,
      workspaceId,
      title: 'プロダクトUIの方向性',
      descriptionUser: '整理済みの入口あり ・ 昨日の更新から',
      descriptionEffective: '整理済みの入口あり ・ 昨日の更新から',
      createdAt: now,
      updatedAt: now,
    },
    sections: [],
    blocks: [
      {
        id: 'block_user_preview_001',
        noteId,
        type: 'paragraph',
        contentJson: {
          text: 'このプロダクトは、AIのすごさを見せるものではない。\n自然に書いた思考が失われず、後から整理され、必要なときに同じノートの中へ返ってくることが価値になる。',
        },
        plainText: 'このプロダクトは、AIのすごさを見せるものではない。\n自然に書いた思考が失われず、後から整理され、必要なときに同じノートの中へ返ってくることが価値になる。',
        position: 0,
        origin: 'user',
        contentHash: 'hash_block_user_preview_001',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'block_user_preview_002',
        noteId,
        type: 'paragraph',
        contentJson: {
          text: 'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。',
        },
        plainText: 'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。',
        position: 1,
        origin: 'user',
        contentHash: 'hash_block_user_preview_002',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'block_ai_assist_preview_001',
        noteId,
        type: 'ai_summary',
        contentJson: {
          text: 'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。',
          annotations: [
            {
              kind: 'source_span',
              sourceBlockId: 'block_user_preview_002',
              startOffset: 0,
              endOffset: 30,
              reason: 'AI assist derived from user-authored paragraph.',
            },
          ],
        },
        plainText: 'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。',
        position: 2,
        origin: 'ai',
        contentHash: 'hash_block_ai_assist_preview_001',
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function serveDist(port) {
  const rootPath = distRoot.pathname;
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname === '/' ? '/preview-static.html' : url.pathname);
    const filePath = normalize(join(rootPath, pathname));
    if (!filePath.startsWith(rootPath)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    readFile(filePath).then((data) => {
      response.writeHead(200, {
        'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(data);
    }).catch(() => {
      response.writeHead(404);
      response.end('Not found');
    });
  });

  server.listen(port, '127.0.0.1');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
