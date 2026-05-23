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
    renderPanel('2 静かな保存', createWritingModel(), { variant: 'writing' }),
    renderPanel('3 戻ってきた整理', createReturnLayerModel(), { variant: 'return' }),
    renderPanel('4 出典確認', createProvenanceModel(), { variant: 'provenance' }),
    renderPanel('5 続きを書く', createContinueModel(), { variant: 'continue', wide: true }),
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
    paragraphBlock('block_placeholder', '\u200B', 0),
  ]), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    nextOpenDigest: { available: false },
  });
}

function createReturnLayerModel() {
  return createNoteSurfaceViewModel(createDocument([
    paragraphBlock('block_placeholder', '\u200B', 0),
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

function createProvenanceModel() {
  return createNoteSurfaceViewModel(createDocument(userParagraphs()), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    expandedDigest: true,
    nextOpenDigest: digestInput(),
    provenancePopover: {
      open: true,
      sourceBlockId: 'block_user_002',
      sourceNoteId: 'note_product_ui_direction',
      sourceTitle: 'このノートの本文',
      startOffset: 0,
      endOffset: 36,
      excerpt: 'UIはその体験を静かに支える器である。',
      reason: '整理結果が参照した本文の範囲。',
    },
  });
}

function createContinueModel() {
  return createNoteSurfaceViewModel(createDocument(userParagraphs()), {
    workspaceName: 'ANN',
    recentThoughts: recentThoughts(),
    nextOpenDigest: { available: false },
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
      { id: 'digest_001', text: '書く面を主役にし、整理結果は戻ってきた時だけ静かに出す', sourceBlockId: 'block_user_001', sourceNoteId: 'note_product_ui_direction' },
      { id: 'digest_002', text: '書いた思考を失わず、次に続けやすい入口として返す', sourceBlockId: 'block_user_002', sourceNoteId: 'note_product_ui_direction' },
      { id: 'digest_003', text: 'ユーザーの本文がSource of Truth、整理結果はprojectionとして扱う', sourceBlockId: 'block_user_002', sourceNoteId: 'note_product_ui_direction' },
    ],
  };
}

function recentThoughts() {
  return [
    { id: 'note_product_ui_direction', title: 'プロダクトUIの方向性', updatedLabel: '昨日・更新', active: true },
    { id: 'note_organization', title: '整理のあり方', updatedLabel: '2日前・更新' },
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
