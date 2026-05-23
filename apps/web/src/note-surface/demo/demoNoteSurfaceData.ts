import type { NoteDocumentContract } from '../../../../../contexts/note-model/src/contract/noteTypes.ts';
import type { NextOpenDigestInput, ProvenancePopoverInput, RecentThoughtInput } from '../viewModelTypes.ts';

export const DEMO_NOTE_ID = 'note_product_ui_direction';
export const DEMO_USER_BLOCK_ID = 'block_user_001';
export const DEMO_AI_BLOCK_ID = 'block_ai_assist';
export const DEMO_MEMORY_BLOCK_ID = 'block_memory_candidate';
export const DEMO_NOW = 1_779_248_149_000;
export const DEMO_PLACEHOLDER_TEXT = '\u200B';

export interface DemoDocumentInput {
  bodyText: string;
  includeAiAssist: boolean;
  includeMemoryCandidate: boolean;
}

export function createDemoDocument(input: DemoDocumentInput): NoteDocumentContract {
  const blocks: NoteDocumentContract['blocks'] = [paragraphBlock(DEMO_USER_BLOCK_ID, input.bodyText, 0)];
  if (input.includeAiAssist) {
    blocks.push(aiAssistBlock(input.bodyText, blocks.length));
  }
  if (input.includeMemoryCandidate) {
    blocks.push(memoryCandidateBlock(input.bodyText, blocks.length));
  }

  return {
    note: {
      id: DEMO_NOTE_ID,
      workspaceId: 'workspace_app',
      title: 'プロダクトUIの方向性',
      descriptionUser: '整理済みの入口あり ・ 昨日の更新から',
      descriptionEffective: '整理済みの入口あり ・ 昨日の更新から',
      createdAt: DEMO_NOW,
      updatedAt: DEMO_NOW,
    },
    sections: [],
    blocks,
  };
}

export function createDemoDigestInput(sourceText: string): NextOpenDigestInput {
  const source = sourceText.trim().length > 0
    ? { sourceBlockId: DEMO_USER_BLOCK_ID, sourceNoteId: DEMO_NOTE_ID }
    : {};

  return {
    available: true,
    unresolvedQuestions: [
      { id: 'digest_001', text: '書く面を主役にし、整理結果は戻ってきた時だけ静かに出す', ...source },
      { id: 'digest_002', text: '書いた思考を失わず、次に続けやすい入口として返す', ...source },
      { id: 'digest_003', text: 'ユーザーの本文がSource of Truth、整理結果はprojectionとして扱う', ...source },
    ],
  };
}

export function createDemoProvenanceInput(sourceText: string): ProvenancePopoverInput {
  const excerpt = sourceText.trim().length > 0
    ? sourceText.slice(0, 120)
    : 'UIはその体験を静かに支える器である。';

  return {
    open: true,
    sourceBlockId: DEMO_USER_BLOCK_ID,
    sourceNoteId: DEMO_NOTE_ID,
    sourceTitle: 'このノートの本文',
    startOffset: 0,
    endOffset: Math.min(Math.max(excerpt.length, 1), 120),
    excerpt,
    reason: '整理結果が参照した本文の範囲。',
  };
}

export function createDemoRecentThoughts(): readonly RecentThoughtInput[] {
  return [
    { id: DEMO_NOTE_ID, title: 'プロダクトUIの方向性', updatedLabel: '昨日・更新', active: true },
    { id: 'note_organization', title: '整理のあり方', updatedLabel: '2日前・更新' },
    { id: 'note_memory', title: 'メモリの扱い方', updatedLabel: '3日前・更新' },
    { id: 'note_boundary', title: '構造化の境界', updatedLabel: '4日前・更新' },
    { id: 'note_design', title: '設計メモ', updatedLabel: '5日前・更新' },
  ];
}

export function resolveDemoRenderedBodyText(bodyText: string): string {
  return bodyText.trim().length > 0 ? bodyText : DEMO_PLACEHOLDER_TEXT;
}

function paragraphBlock(
  id: string,
  text: string,
  position: number,
): NoteDocumentContract['blocks'][number] {
  return {
    id,
    noteId: DEMO_NOTE_ID,
    type: 'paragraph',
    contentJson: { text },
    plainText: text,
    position,
    origin: 'user',
    contentHash: `hash_${id}_${position}`,
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
  };
}

function aiAssistBlock(sourceText: string, position: number): NoteDocumentContract['blocks'][number] {
  const boundedSourceText = sourceText.trim().length > 0
    ? sourceText
    : 'UIはその体験を静かに支える器である。';
  const endOffset = Math.min(Math.max(boundedSourceText.length, 1), 36);
  const suggestion = [
    'UIはその体験を静かに支える器である。',
    '書くことを妨げず、整理された思考が自然に混ざり込む面。',
    '特に「再入力の速さ」を最優先順位とする。',
  ].join('\n');

  return {
    id: DEMO_AI_BLOCK_ID,
    noteId: DEMO_NOTE_ID,
    type: 'ai_summary',
    contentJson: {
      text: suggestion,
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: DEMO_USER_BLOCK_ID,
          startOffset: 0,
          endOffset,
          reason: 'Organized context derived from user-authored paragraph.',
        },
      ],
    },
    plainText: suggestion,
    position,
    origin: 'ai',
    contentHash: 'hash_block_ai_assist',
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
  };
}

function memoryCandidateBlock(sourceText: string, position: number): NoteDocumentContract['blocks'][number] {
  const text = sourceText.trim().length > 0
    ? 'このノートでは、整理結果は別ペインではなく同じ書く面に静かに戻るべきだと扱う。'
    : '書く面を主役にする。';

  return {
    id: DEMO_MEMORY_BLOCK_ID,
    noteId: DEMO_NOTE_ID,
    type: 'ai_memory_candidate',
    contentJson: {
      text,
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: DEMO_USER_BLOCK_ID,
          startOffset: 0,
          endOffset: Math.min(Math.max(sourceText.length, 1), 36),
          reason: 'Memory candidate derived from the current note.',
        },
      ],
    },
    plainText: text,
    position,
    origin: 'ai',
    contentHash: 'hash_block_memory_candidate',
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
  };
}
