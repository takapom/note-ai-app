import { renderNoteSurfaceHtml } from '../../src/noteSurfaceHtmlRenderer.ts';
import { createNoteSurfaceViewModel } from '../../src/noteSurface.ts';
import type { NoteDocumentContract } from '../../../../contexts/note-model/src/contract/noteTypes.ts';
import { storyboardCss } from './storyboardCss.ts';

export default function Page() {
  const panels = createStoryboardPanels();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: storyboardCss }} />
      <main className="ann-storyboard">
        <div className="ann-storyboard__grid" dangerouslySetInnerHTML={{ __html: panels.join('\n') }} />
      </main>
    </>
  );
}

function createStoryboardPanels(): string[] {
  return [
    renderPanel('1 書く面', createWriteModel(), { variant: 'write' }),
    renderPanel('2 戻ってきた整理', createReturnLayerModel(), { variant: 'return' }),
    renderPanel('3 執筆中', createWritingModel(), { variant: 'writing' }),
    renderPanel('4 AI補助', createAiAssistModel(), { variant: 'assist' }),
    renderPanel('5 出典確認', createProvenanceModel(), { variant: 'provenance', wide: true }),
  ];
}

function renderPanel(
  label: string,
  model: ReturnType<typeof createNoteSurfaceViewModel>,
  options: { variant?: string; wide?: boolean } = {},
): string {
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

function createDocument(blocks: NoteDocumentContract['blocks']): NoteDocumentContract {
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

function userParagraphs(): NoteDocumentContract['blocks'] {
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

function aiAssistBlock(): NoteDocumentContract['blocks'][number] {
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

function paragraphBlock(
  id: string,
  text: string,
  position: number,
): NoteDocumentContract['blocks'][number] {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
