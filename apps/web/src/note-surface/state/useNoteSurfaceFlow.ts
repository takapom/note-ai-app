import { useCallback, useMemo, useRef, useState } from 'react';
import { createNoteSurfaceViewModel } from '../noteSurfacePresenter.ts';
import type { NoteSurfaceAiStatus, NoteSurfaceViewModel } from '../viewModelTypes.ts';
import {
  createDemoDigestInput,
  createDemoDocument,
  createDemoProvenanceInput,
  createDemoRecentThoughts,
  DEMO_PLACEHOLDER_TEXT,
  DEMO_USER_BLOCK_ID,
  resolveDemoRenderedBodyText,
} from '../demo/demoNoteSurfaceData.ts';

type TimerHandle = ReturnType<typeof setTimeout>;

export type NoteSurfaceFlowState = 'write' | 'writing' | 'return' | 'provenance';

export interface EditableBlockInput {
  blockId: string;
  text: string;
}

export interface NoteSurfaceFlowController {
  model: NoteSurfaceViewModel;
  flowState: NoteSurfaceFlowState;
  placeholderText: string;
  onEditableFocus(input: EditableBlockInput): void;
  onEditableInput(input: EditableBlockInput): void;
  onEditableBlur(input: EditableBlockInput): void;
  onOpenRecentThought(noteId: string): void;
  onContinueWriting(): void;
  onExpandDigest(): void;
  onCollapseDigest(): void;
  onCloseReturnLayer(): void;
  onInspectSource(): void;
  onCloseProvenance(): void;
  onRememberMemoryCandidate(blockId: string): void;
  onRejectMemoryCandidate(blockId: string): void;
}

export function useNoteSurfaceFlow(): NoteSurfaceFlowController {
  const [bodyText, setBodyText] = useState('');
  const [editingBlockIds, setEditingBlockIds] = useState<readonly string[]>([]);
  const [aiStatus, setAiStatus] = useState<NoteSurfaceAiStatus>('saved');
  const [organizedResultReady, setOrganizedResultReady] = useState(false);
  const [digestAvailable, setDigestAvailable] = useState(false);
  const [returnLayerOpen, setReturnLayerOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [memoryCandidateVisible, setMemoryCandidateVisible] = useState(false);
  const saveTimerRef = useRef<TimerHandle | undefined>(undefined);

  const model = useMemo(() => createNoteSurfaceViewModel(createDemoDocument({
    bodyText: resolveDemoRenderedBodyText(bodyText),
    includeAiAssist: false,
    includeMemoryCandidate: memoryCandidateVisible && digestAvailable && bodyText.trim().length > 0,
  }), {
    workspaceName: 'ANN',
    recentThoughts: createDemoRecentThoughts(),
    aiStatus,
    editingBlockIds,
    sourceSpanIdByBlockId: {},
    nextOpenDigest: digestAvailable ? createDemoDigestInput(bodyText) : { available: false },
    returnLayerOpen,
    provenancePopover: provenanceOpen ? createDemoProvenanceInput(bodyText) : { open: false },
  }), [aiStatus, bodyText, digestAvailable, editingBlockIds, memoryCandidateVisible, provenanceOpen, returnLayerOpen]);

  const scheduleLocalSave = useCallback((nextText: string) => {
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current);
    }
    const trimmed = nextText.trim();
    setBodyText(trimmed.length === 0 ? '' : nextText);
    setEditingBlockIds([DEMO_USER_BLOCK_ID]);
    setAiStatus('saved');
    setDigestAvailable(false);
    setReturnLayerOpen(false);
    setMemoryCandidateVisible(false);
    setProvenanceOpen(false);

    saveTimerRef.current = setTimeout(() => {
      setEditingBlockIds([]);

      if (trimmed.length === 0) {
        setAiStatus('saved');
        setOrganizedResultReady(false);
        setDigestAvailable(false);
        setReturnLayerOpen(false);
        setMemoryCandidateVisible(false);
        return;
      }

      setOrganizedResultReady(true);
      setAiStatus('saved');
    }, 450);
  }, []);

  const flowState = resolveFlowState({
    bodyText,
    returnLayerOpen,
    provenanceOpen,
  });

  return {
    model,
    flowState,
    placeholderText: DEMO_PLACEHOLDER_TEXT,
    onEditableFocus(input) {
      if (input.blockId === DEMO_USER_BLOCK_ID && input.text === DEMO_PLACEHOLDER_TEXT) {
        setEditingBlockIds([DEMO_USER_BLOCK_ID]);
      }
    },
    onEditableInput(input) {
      if (input.blockId === DEMO_USER_BLOCK_ID) {
        scheduleLocalSave(input.text);
      }
    },
    onEditableBlur(input) {
      if (input.blockId === DEMO_USER_BLOCK_ID && input.text.trim().length > 0) {
        setOrganizedResultReady(true);
        setReturnLayerOpen(false);
      }
    },
    onOpenRecentThought() {
      if (bodyText.trim().length > 0 && organizedResultReady) {
        setDigestAvailable(true);
        setReturnLayerOpen(true);
        setMemoryCandidateVisible(true);
      }
    },
    onContinueWriting() {
      setReturnLayerOpen(false);
      setDigestAvailable(false);
      setMemoryCandidateVisible(false);
    },
    onExpandDigest() {
      if (organizedResultReady) {
        setDigestAvailable(true);
        setReturnLayerOpen(true);
        setMemoryCandidateVisible(true);
      }
    },
    onCollapseDigest() {
      setReturnLayerOpen(false);
    },
    onCloseReturnLayer() {
      setReturnLayerOpen(false);
      setDigestAvailable(false);
      setMemoryCandidateVisible(false);
    },
    onInspectSource() {
      setProvenanceOpen(true);
    },
    onCloseProvenance() {
      setProvenanceOpen(false);
    },
    onRememberMemoryCandidate() {
      window.setTimeout(() => {
        setMemoryCandidateVisible(false);
      }, 350);
    },
    onRejectMemoryCandidate() {
      window.setTimeout(() => {
        setMemoryCandidateVisible(false);
      }, 350);
    },
  };
}

function resolveFlowState(input: {
  bodyText: string;
  returnLayerOpen: boolean;
  provenanceOpen: boolean;
}): NoteSurfaceFlowState {
  if (input.provenanceOpen) {
    return 'provenance';
  }
  if (input.returnLayerOpen) {
    return 'return';
  }
  if (input.bodyText.trim().length > 0) {
    return 'writing';
  }
  return 'write';
}
