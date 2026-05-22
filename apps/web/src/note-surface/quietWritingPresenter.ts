import type { NoteContract } from '../../../../contexts/note-model/src/contract/noteContract.ts';
import type {
  CarriedContextTrayViewModel,
  NextOpenDigestViewModel,
  NoteBlockViewModel,
  NoteSurfaceAiStatus,
  NoteSurfaceUiActionState,
  QuietWritingSurfaceViewModel,
  ReEntryDirectionViewModel,
  RecentThoughtInput,
  ReturnLayerPointViewModel,
  ReturnLayerViewModel,
  ThinRailViewModel,
  WritingChromeViewModel,
} from './viewModelTypes.ts';

interface CreateQuietWritingSurfaceOptions {
  note: Pick<NoteContract, 'id' | 'title'>;
  nextOpenDigest: NextOpenDigestViewModel;
  returnLayerOpen: boolean;
  blocks: readonly NoteBlockViewModel[];
  aiStatus: NoteSurfaceAiStatus;
  workspaceName?: string | undefined;
  recentThoughts?: readonly RecentThoughtInput[] | undefined;
}

export function createQuietWritingSurfaceViewModel(
  options: CreateQuietWritingSurfaceOptions,
): QuietWritingSurfaceViewModel {
  const returnLayer = createReturnLayerViewModel(options.nextOpenDigest, options.returnLayerOpen);
  const directions = createReEntryDirections(returnLayer);

  return {
    kind: 'QuietWritingSurface',
    thinRail: createThinRailViewModel(options.note, options.workspaceName, options.recentThoughts),
    writingChrome: createWritingChromeViewModel(options.aiStatus, returnLayer, options.nextOpenDigest),
    reEntrySurface: {
      kind: 'ReEntrySurface',
      visible: !options.returnLayerOpen && returnLayer.available,
      heading: '前回から整理された入口',
      directions,
    },
    returnLayer,
    carriedContextTray: createCarriedContextTrayViewModel(options.blocks),
  };
}

function createThinRailViewModel(
  note: Pick<NoteContract, 'id' | 'title'>,
  workspaceName: string | undefined,
  recentThoughts: readonly RecentThoughtInput[] | undefined,
): ThinRailViewModel {
  const thoughts = recentThoughts ?? [{
    id: note.id,
    title: note.title,
    updatedLabel: 'いま編集中',
    active: true,
  }];

  return {
    kind: 'ThinRail',
    workspaceName: workspaceName ?? 'Workspace',
    recentThoughts: thoughts.map((thought) => ({
      id: thought.id,
      title: thought.title,
      updatedLabel: thought.updatedLabel,
      active: thought.active ?? thought.id === note.id,
    })),
  };
}

function createWritingChromeViewModel(
  aiStatus: NoteSurfaceAiStatus,
  returnLayer: ReturnLayerViewModel,
  digest: NextOpenDigestViewModel,
): WritingChromeViewModel {
  const digestStatus = renderDigestStatusLabel(digest);

  return {
    kind: 'WritingChrome',
    ...(returnLayer.available && !returnLayer.open
      ? { returnStatus: '整理済みの入口あり' }
      : {}),
    ...(digestStatus === undefined
      ? {}
      : { digestStatus, digestStatusKind: digest.emptyState }),
    aiStatusLabel: renderAiStatusLabel(aiStatus),
  };
}

function renderDigestStatusLabel(digest: NextOpenDigestViewModel): string | undefined {
  switch (digest.emptyState) {
    case 'load_failed':
      return '整理の取得に失敗しました';
    case 'invalid_body':
      return '整理データを読み取れませんでした';
    case 'unavailable':
      return digest.loadState === 'provided' ? '戻ってきた整理はまだありません' : undefined;
    case 'no_items':
    case 'has_items':
      return undefined;
  }
}

function createReturnLayerViewModel(
  digest: NextOpenDigestViewModel,
  open: boolean,
): ReturnLayerViewModel {
  const points = createReturnLayerPoints(digest);

  return {
    kind: 'ReturnLayer',
    open: open && digest.available,
    available: digest.available,
    label: '前回からの整理',
    ...(points.length === 0
      ? {}
      : { summary: `未整理だった論点を、${points.length}つにまとめました` }),
    points,
    emptyState: digest.emptyState,
    actions: {
      defer: 'idle',
      close: 'idle',
    },
    emitsAiProviderCall: false,
  };
}

function createReturnLayerPoints(
  digest: NextOpenDigestViewModel,
): readonly ReturnLayerPointViewModel[] {
  return digest.sections
    .flatMap((section) => section.items)
    .slice(0, 3)
    .map((item) => {
      const lines = item.text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
      const title = (lines[0] ?? item.text).slice(0, 120);
      const explanation = lines.slice(1).join(' ').slice(0, 160);
      return {
        id: item.id,
        title,
        explanation,
        sourceAvailable: item.source?.blockId !== undefined || item.source?.noteId !== undefined,
        sourceInspectable: item.source?.blockId !== undefined,
        ...(item.source === undefined ? {} : { source: item.source }),
      };
    });
}

function createReEntryDirections(
  returnLayer: ReturnLayerViewModel,
): readonly ReEntryDirectionViewModel[] {
  return returnLayer.points.map((point) => ({
    id: point.id,
    title: point.title,
    summary: point.explanation,
    sourceAvailable: point.source?.blockId !== undefined || point.source?.noteId !== undefined,
    ...(point.source?.blockId === undefined ? {} : { focusBlockId: point.source.blockId }),
  }));
}

function createCarriedContextTrayViewModel(
  blocks: readonly NoteBlockViewModel[],
): CarriedContextTrayViewModel {
  const candidates = blocks
    .filter((block) => block.memoryCandidate !== undefined)
    .map((block) => ({
      id: block.id,
      statement: block.text,
      ...(block.sourcePreview === undefined ? {} : { sourcePreview: block.sourcePreview }),
      sourceAvailable: block.sourcePreview !== undefined,
      actionState: resolveCarriedContextActionState(block),
    }));

  return {
    kind: 'CarriedContextTray',
    label: '持ち越す文脈',
    candidates,
  };
}

function renderAiStatusLabel(aiStatus: NoteSurfaceAiStatus): string {
  switch (aiStatus) {
    case 'saved':
      return '保存済み';
    case 'structuring':
      return '整理中';
    case 'updated':
      return '更新あり';
    case 'failed':
      return '保存に失敗';
  }
}

function resolveCarriedContextActionState(block: NoteBlockViewModel): NoteSurfaceUiActionState {
  const states = block.memoryCandidate?.actionStates;
  if (states === undefined) {
    return 'idle';
  }

  if (Object.values(states).some((state) => state === 'failed')) {
    return 'failed';
  }

  if (Object.values(states).some((state) => state === 'pending')) {
    return 'pending';
  }

  return 'idle';
}
