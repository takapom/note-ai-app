import {
  isAiBlockType,
  isStructuralHeading,
  resolveDescriptionEffective,
  type BlockContract,
  type HeadingBlockContentContract,
  type NoteContract,
} from '../../../../contexts/note-model/src/contract/noteContract.ts';
import {
  aiAssistActions,
  blockEditorActions,
  memoryCandidateActions,
} from './viewModelConstants.ts';
import type {
  AiAssistBlockViewModel,
  NoteBlockViewModel,
  NoteHeaderViewModel,
  SectionBoundaryViewModel,
} from './viewModelTypes.ts';

export function createNoteHeaderViewModel(
  note: NoteContract,
  sectionBoundaries: readonly SectionBoundaryViewModel[],
): NoteHeaderViewModel {
  const outline = sectionBoundaries.map((boundary) => ({
    sectionId: boundary.sectionId ?? boundary.blockId,
    title: boundary.title,
    level: boundary.level,
  }));
  const effective = note.descriptionEffective ?? resolveDescriptionEffective(note, outline);

  return {
    noteId: note.id,
    title: note.title,
    description: {
      ...(note.descriptionUser === undefined ? {} : { user: note.descriptionUser }),
      ...(note.descriptionAi === undefined ? {} : { ai: note.descriptionAi }),
      aiApproved: note.descriptionAiApproved ?? false,
      effective,
      aiSuggested: note.descriptionUser === undefined && note.descriptionAi !== undefined,
      editable: true,
    },
  };
}

export function createBlockViewModel(
  block: BlockContract,
  editingBlockIds: ReadonlySet<string>,
  allBlocks: readonly BlockContract[],
  sourceSpanIdByBlockId: Readonly<Record<string, string>> | undefined,
): NoteBlockViewModel {
  const sectionBoundary = createSectionBoundary(block)[0];
  const isAiAssistBlock = isAiBlockType(block.type);
  const aiAssist = createAiAssistBlock(
    block,
    sourceSpanIdByBlockId?.[block.id],
    isAiAssistBlock && editingBlockIds.has(block.id),
  );
  const sourcePreview = readBlockSourcePreview(block, allBlocks);
  const memoryCandidate = block.type === 'ai_memory_candidate'
    ? {
        label: '持ち越す文脈' as const,
        actions: memoryCandidateActions,
        actionStates: {},
        hiddenProfiling: false as const,
        automaticActiveMemory: false as const,
        emitsAiProviderCall: false as const,
      }
    : undefined;

  return {
    id: block.id,
    ...(block.sectionId === undefined ? {} : { sectionId: block.sectionId }),
    type: block.type,
    origin: block.origin,
    text: extractBlockText(block),
    position: block.position,
    ...(sourcePreview === undefined ? {} : { sourcePreview }),
    editor: {
      state: !isAiAssistBlock && editingBlockIds.has(block.id) ? 'editing' : 'idle',
      actions: blockEditorActions,
      saveStatus: !isAiAssistBlock && editingBlockIds.has(block.id) ? 'dirty' : 'saved',
      statusMessage: !isAiAssistBlock && editingBlockIds.has(block.id) ? '未保存の変更' : '保存済み',
    },
    ...(sectionBoundary === undefined
      ? {}
      : {
          sectionBoundary: {
            level: sectionBoundary.level,
            title: sectionBoundary.title,
          },
        }),
    ...(aiAssist === undefined ? {} : { aiAssist }),
    ...(memoryCandidate === undefined ? {} : { memoryCandidate }),
  };
}

export function createSectionBoundary(block: BlockContract): readonly SectionBoundaryViewModel[] {
  if (!isStructuralHeading(block)) {
    return [];
  }
  const content = block.contentJson as HeadingBlockContentContract;

  return [{
    blockId: block.id,
    ...(block.sectionId === undefined ? {} : { sectionId: block.sectionId }),
    level: content.level,
    title: content.text,
    position: block.position,
  }];
}

function createAiAssistBlock(
  block: BlockContract,
  sourceSpanId: string | undefined,
  editing = false,
): AiAssistBlockViewModel | undefined {
  if (!isAiBlockType(block.type)) {
    return undefined;
  }

  const sourceInspectable = hasCompleteBlockSourceSpan(block, sourceSpanId);
  const actions = sourceInspectable
    ? aiAssistActions
    : aiAssistActions.filter((action) => action.id !== 'inspect_source');

  return {
    kind: block.type,
    label: 'AI補助',
    collapsible: true,
    editable: true,
    editing,
    dismissible: true,
    sourceInspectable,
    actions,
    actionStates: {},
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
  };
}

function hasCompleteBlockSourceSpan(block: BlockContract, sourceSpanId: string | undefined): boolean {
  if (sourceSpanId === undefined) {
    return false;
  }

  if (!('text' in block.contentJson)) {
    return false;
  }

  const annotations = block.contentJson.annotations;
  if (!Array.isArray(annotations)) {
    return false;
  }

  return annotations.some((annotation) => (
    annotation.kind === 'source_span'
    && typeof annotation.sourceBlockId === 'string'
    && typeof annotation.startOffset === 'number'
    && typeof annotation.endOffset === 'number'
    && annotation.endOffset >= annotation.startOffset
  ));
}

function readBlockSourcePreview(
  block: BlockContract,
  allBlocks: readonly BlockContract[],
): string | undefined {
  if (!('text' in block.contentJson)) {
    return undefined;
  }

  const annotations = block.contentJson.annotations;
  if (!Array.isArray(annotations)) {
    return undefined;
  }

  const sourceSpan = annotations.find((annotation) => (
    annotation.kind === 'source_span' && typeof annotation.sourceBlockId === 'string'
  ));
  if (sourceSpan === undefined || typeof sourceSpan.sourceBlockId !== 'string') {
    return undefined;
  }

  const sourceBlock = allBlocks.find((candidate) => candidate.id === sourceSpan.sourceBlockId);
  if (sourceBlock === undefined) {
    return undefined;
  }

  const sourceText = extractBlockText(sourceBlock);
  const startOffset = typeof sourceSpan.startOffset === 'number' ? sourceSpan.startOffset : 0;
  const endOffset = typeof sourceSpan.endOffset === 'number' ? sourceSpan.endOffset : sourceText.length;
  const excerpt = sourceText.slice(startOffset, endOffset).trim();
  if (excerpt.length > 0) {
    return excerpt;
  }

  return sourceText.trim().length > 0 ? sourceText.trim().slice(0, 120) : `出典ブロック: ${sourceBlock.id}`;
}

function extractBlockText(block: BlockContract): string {
  if (block.type === 'divider') {
    return '';
  }

  if ('text' in block.contentJson) {
    return block.contentJson.text;
  }

  return block.plainText;
}
