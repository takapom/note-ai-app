#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { renderNoteSurfaceHtml } from '../apps/web/src/noteSurfaceHtmlRenderer.ts';
import { createNoteSurfaceViewModel } from '../apps/web/src/noteSurface.ts';

const outputPath = new URL('../dist/web/preview-storyboard.html', import.meta.url);
const indexPath = new URL('../apps/web/public/index.html', import.meta.url);

async function main() {
  const indexHtml = await readFile(indexPath, 'utf8');
  const styleMatch = indexHtml.match(/<style>[\s\S]*?<\/style>/);
  const baseStyle = styleMatch?.[0] ?? '';
  const panels = createStoryboardPanels();

  const page = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AI Native Note — UI構成プレビュー</title>
    ${baseStyle}
    <style>
      body {
        margin: 0;
        background: #f3f0ea;
      }

      .ann-storyboard {
        min-height: 100vh;
        padding: 0.85rem 2.5rem 1.25rem;
      }

      .ann-storyboard__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(30rem, 1fr));
        gap: 0.9rem 3rem;
        align-items: start;
      }

      .ann-storyboard__panel {
        display: grid;
        gap: 0.35rem;
      }

      .ann-storyboard__panel--wide {
        grid-column: 1 / -1;
        width: min(47rem, 56vw);
        justify-self: center;
      }

      .ann-storyboard__label {
        margin: 0;
        font-size: 1.15rem;
        line-height: 1.2;
        font-weight: 700;
        color: #111;
      }

      .ann-storyboard__frame {
        height: 14.65rem;
        overflow: hidden;
        background: var(--ann-surface);
        border: 1px solid rgba(33, 30, 26, 0.12);
        box-shadow: 0 0.65rem 1.4rem rgba(33, 30, 26, 0.14);
      }

      .ann-storyboard__panel--wide .ann-storyboard__frame {
        height: 13.95rem;
      }

      .ann-storyboard__frame .ann-app--quiet-writing {
        grid-template-columns: 8.6rem minmax(0, 1fr);
        min-height: 100%;
        height: 100%;
        background: var(--ann-surface);
      }

      .ann-storyboard__frame .ann-thin-rail {
        position: relative;
        padding: 0.65rem 0.55rem;
        gap: 0.65rem;
      }

      .ann-storyboard__frame .ann-thin-rail__workspace {
        font-size: 0.6rem;
      }

      .ann-storyboard__frame .ann-thin-rail::after {
        content: "□";
        position: absolute;
        top: 0.62rem;
        right: 0.55rem;
        font-size: 0.55rem;
        color: var(--ann-ink);
      }

      .ann-storyboard__frame .ann-thin-rail__label,
      .ann-storyboard__frame .ann-thin-rail__thought-meta,
      .ann-storyboard__frame .ann-writing-chrome__status,
      .ann-storyboard__frame .ann-block-status {
        font-size: 0.5rem;
      }

      .ann-storyboard__frame .ann-thin-rail__mark {
        display: none;
      }

      .ann-storyboard__frame .ann-thin-rail__list {
        gap: 0.15rem;
      }

      .ann-storyboard__frame .ann-thin-rail__thought {
        padding: 0.25rem 0.35rem;
        border-radius: 0.25rem;
      }

      .ann-storyboard__frame .ann-thin-rail__thought-title {
        font-size: 0.52rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ann-storyboard__frame .ann-thin-rail__tools {
        flex-direction: column;
        gap: 0.18rem;
      }

      .ann-storyboard__frame .ann-icon-button,
      .ann-storyboard__frame .ann-text-button {
        min-height: 1.15rem;
        padding: 0 0.35rem;
        border-radius: 0.2rem;
        font-size: 0.5rem;
      }

      .ann-storyboard__frame .ann-main {
        min-height: 0;
      }

      .ann-storyboard__frame .ann-writing-chrome {
        padding: 0.45rem 0.8rem 0;
      }

      .ann-storyboard__frame .ann-note-surface {
        --ann-note-max-width: 24.5rem;
        padding: 0.75rem 0.9rem 1rem;
      }

      .ann-storyboard__panel--wide .ann-note-surface {
        --ann-note-max-width: 25rem;
        padding-top: 0.6rem;
      }

      .ann-storyboard__frame .ann-note-header h1 {
        margin-bottom: 0.32rem;
        font-size: 1.05rem;
        line-height: 1.2;
      }

      .ann-storyboard__frame .ann-note-header p {
        margin-bottom: 0.5rem;
        font-size: 0.5rem;
        line-height: 1.5;
      }

      .ann-storyboard__frame .ann-block-editor {
        gap: 0.35rem;
      }

      .ann-storyboard__frame .ann-block-list {
        display: grid;
        gap: 0.25rem;
      }

      .ann-storyboard__frame .ann-block {
        padding: 0;
      }

      .ann-storyboard__frame .ann-block-text {
        min-height: 0.95rem;
        font-size: 0.52rem;
        line-height: 1.55;
      }

      .ann-storyboard__frame .ann-block-controls,
      .ann-storyboard__frame .ann-block-status {
        display: none;
      }

      .ann-storyboard__frame .ann-return-layer--inline {
        margin-bottom: 0.55rem;
        border-radius: 0.28rem;
      }

      .ann-storyboard__frame .ann-return-layer--expanded {
        padding: 0.45rem 0.55rem;
        box-shadow: none;
      }

      .ann-storyboard__frame .ann-return-layer__header {
        margin-bottom: 0.25rem;
      }

      .ann-storyboard__frame .ann-return-layer__label,
      .ann-storyboard__frame .ann-inline-label {
        font-size: 0.5rem;
      }

      .ann-storyboard__frame .ann-return-layer__summary {
        margin: 0.14rem 0 0.35rem;
        font-size: 0.66rem;
      }

      .ann-storyboard__frame .ann-return-layer__points {
        gap: 0.22rem;
        margin-bottom: 0;
      }

      .ann-storyboard__frame .ann-return-layer__point {
        gap: 0.125rem 0.5rem;
      }

      .ann-storyboard__frame .ann-return-layer__point-index,
      .ann-storyboard__frame .ann-return-layer__point-title {
        font-size: 0.5rem;
      }

      .ann-storyboard__frame .ann-return-layer__actions {
        display: none;
      }

      .ann-storyboard__frame .ann-ai-assist-block {
        padding: 0.45rem 0.55rem;
        border-radius: 0.28rem;
        gap: 0.22rem;
      }

      .ann-storyboard__frame .ann-inline-actions button {
        min-height: 1.1rem;
        padding: 0 0.42rem;
        font-size: 0.5rem;
        border-radius: 0.2rem;
      }

      .ann-storyboard__frame .ann-provenance-popover[data-open="true"] {
        position: absolute;
        inset: auto 0.95rem 0.95rem auto;
        width: 10.2rem;
        padding: 0.5rem;
        border-radius: 0.28rem;
        font-size: 0.5rem;
        box-shadow: 0 0.55rem 1rem rgba(33, 30, 26, 0.14);
      }

      .ann-storyboard__frame .ann-provenance-popover h2 {
        margin: 0 0 0.25rem;
        font-size: 0.6rem;
      }

      .ann-storyboard__frame .ann-provenance-popover p {
        margin: 0.18rem 0;
      }

      .ann-storyboard__frame .ann-provenance-popover blockquote {
        margin: 0.5rem 0 0;
        padding-left: 0.5rem;
        border-left: 2px solid var(--ann-accent);
      }

      .ann-storyboard__panel--write .ann-note-header p {
        display: none;
      }

      .ann-storyboard__panel--write .ann-note-surface {
        padding-top: 1.35rem;
      }

      .ann-storyboard__panel--write .ann-block-list {
        margin-top: 0.65rem;
      }

      .ann-storyboard__panel--return .ann-block-list {
        border-top: 1px solid var(--ann-hairline);
        padding-top: 0.35rem;
      }

      .ann-storyboard__panel--assist .ann-ai-assist-block {
        margin-top: 0.15rem;
      }

      .ann-storyboard__panel--assist .ann-note-header h1,
      .ann-storyboard__panel--provenance .ann-note-header h1 {
        margin-bottom: 0.25rem;
      }

      .ann-storyboard__panel--assist .ann-note-header p,
      .ann-storyboard__panel--provenance .ann-note-header p {
        margin-bottom: 0.35rem;
      }

      .ann-storyboard__panel--assist .ann-block-list,
      .ann-storyboard__panel--provenance .ann-block-list {
        gap: 0.18rem;
      }

      .ann-storyboard__placeholder {
        color: var(--ann-ink-faint);
      }

      .ann-storyboard__cursor {
        color: var(--ann-ink);
      }
    </style>
  </head>
  <body>
    <main class="ann-storyboard">
      <div class="ann-storyboard__grid">
        ${panels.join('\n')}
      </div>
    </main>
  </body>
</html>
`;

  await writeFile(outputPath, page, 'utf8');
  process.stdout.write(`Wrote ${outputPath.pathname}\n`);
}

function createStoryboardPanels() {
  return [
    renderPanel('1 書く面', createWriteModel(), { variant: 'write' }),
    renderPanel('2 戻ってきた整理', createReturnLayerModel(), { variant: 'return' }),
    renderPanel('3 執筆中', createWritingModel(), { variant: 'writing' }),
    renderPanel('4 AI補助', createAiAssistModel(), { variant: 'assist' }),
    renderPanel('5 出典確認', createProvenanceModel(), { variant: 'provenance', wide: true }),
  ];
}

function renderPanel(label, model, options = {}) {
  const { html } = renderNoteSurfaceHtml(model);
  const classes = [
    'ann-storyboard__panel',
    options.wide === true ? 'ann-storyboard__panel--wide' : '',
    options.variant === undefined ? '' : `ann-storyboard__panel--${options.variant}`,
  ].filter(Boolean).join(' ');
  return [
    `<section class="${classes}">`,
    `<h2 class="ann-storyboard__label">${escapeHtml(label)}</h2>`,
    `<div class="ann-storyboard__frame">${html}</div>`,
    '</section>',
  ].join('');
}

function createWriteModel() {
  return createNoteSurfaceViewModel(createDocument([
    paragraphBlock('block_placeholder', '/　ここから書く｜', 0),
  ]), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    nextOpenDigest: { available: false },
  });
}

function createReturnLayerModel() {
  return createNoteSurfaceViewModel(createDocument([
    paragraphBlock('block_placeholder', 'ここから書く｜', 0),
  ]), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    expandedDigest: true,
    nextOpenDigest: digestInput(),
  });
}

function createWritingModel() {
  return createNoteSurfaceViewModel(createDocument(userParagraphs()), {
    workspaceName: 'ANN',
    aiStatus: 'structuring',
    recentThoughts: recentThoughts(),
    nextOpenDigest: { available: false },
  });
}

function createAiAssistModel() {
  return createNoteSurfaceViewModel(createDocument([
    ...userParagraphs(),
    aiAssistBlock(),
  ]), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    sourceSpanIdByBlockId: {
      block_ai_assist: 'source_span_ai_assist',
    },
    nextOpenDigest: { available: false },
  });
}

function createProvenanceModel() {
  return createNoteSurfaceViewModel(createDocument([
    ...userParagraphs(),
    aiAssistBlock(),
  ]), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    sourceSpanIdByBlockId: {
      block_ai_assist: 'source_span_ai_assist',
    },
    nextOpenDigest: { available: false },
    provenancePopover: {
      open: true,
      sourceBlockId: 'block_user_002',
      sourceNoteId: 'note_product_ui_direction',
      sourceTitle: '前回のノート',
      startOffset: 0,
      endOffset: 36,
      excerpt: 'UIはその体験を静かに支える器である。',
      reason: 'AI補助が参照した前回の文脈。',
    },
  });
}

function createDocument(blocks) {
  const now = 1_779_248_149_000;

  return {
    note: {
      id: 'note_product_ui_direction',
      workspaceId: 'workspace_storyboard',
      title: 'プロダクトUIの方向性',
      descriptionUser: '整理済みの入口あり ・ 昨日の更新から',
      descriptionEffective: '整理済みの入口あり ・ 昨日の更新から',
      createdAt: now,
      updatedAt: now,
    },
    sections: [],
    blocks,
  };
}

function userParagraphs() {
  return [
    paragraphBlock(
      'block_user_001',
      'このプロダクトは、AIのすごさを見せるものではない。\n自然に書いた思考が失われず、後から整理され、必要なときに同じノートの中へ返ってくることが価値になる。',
      0,
    ),
    paragraphBlock(
      'block_user_002',
      'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。',
      1,
    ),
  ];
}

function aiAssistBlock() {
  return {
    id: 'block_ai_assist',
    noteId: 'note_product_ui_direction',
    type: 'ai_summary',
    contentJson: {
      text: 'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。\n特に「再入力の速さ」を最優先順位とする。',
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: 'block_user_002',
          startOffset: 0,
          endOffset: 36,
          reason: 'AI assist derived from user-authored paragraph.',
        },
      ],
    },
    plainText: 'UIはその体験を静かに支える器である。\n書くことを妨げず、整理された思考が自然に混ざり込む面。\n特に「再入力の速さ」を最優先順位とする。',
    position: 2,
    origin: 'ai',
    contentHash: 'hash_block_ai_assist',
    createdAt: 1_779_248_149_000,
    updatedAt: 1_779_248_149_000,
  };
}

function paragraphBlock(id, text, position) {
  return {
    id,
    noteId: 'note_product_ui_direction',
    type: 'paragraph',
    contentJson: { text },
    plainText: text,
    position,
    origin: 'user',
    contentHash: `hash_${id}`,
    createdAt: 1_779_248_149_000,
    updatedAt: 1_779_248_149_000,
  };
}

function digestInput() {
  return {
    available: true,
    unresolvedQuestions: [
      { id: 'digest_001', text: 'AIはチャットではなく、書く面の中に静かに存在する' },
      { id: 'digest_002', text: '書く体験を最優先にし、整理は後から自然に戻す' },
      { id: 'digest_003', text: 'ユーザーの本文がSource of Truth、AIは提案として扱う' },
    ],
  };
}

function recentThoughts() {
  return [
    { id: 'note_product_ui_direction', title: 'プロダクトUIの方向性', updatedLabel: '昨日・更新', active: true },
    { id: 'note_ai_assist', title: 'AI補助のあり方', updatedLabel: '2日前・更新' },
    { id: 'note_memory', title: 'メモリの扱い方', updatedLabel: '3日前・更新' },
    { id: 'note_boundary', title: '構造化の境界', updatedLabel: '4日前・更新' },
    { id: 'note_design', title: '設計メモ', updatedLabel: '5日前・更新' },
  ];
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
