import type {
  AiAssistBlockActionIntent,
  BlockEditorAction,
  MemoryCandidateBlockActionIntent,
  NoteBlockViewModel,
  NoteSurfaceViewModel,
} from '../noteSurface.ts';
import type { NoteSurfaceHtmlRenderEventDescriptor } from './htmlRendererTypes.ts';
import { renderBlockEditorActionLabel, renderReturnLayerActionLabel } from './htmlLabels.ts';

export function createRenderEvents(model: NoteSurfaceViewModel): readonly NoteSurfaceHtmlRenderEventDescriptor[] {
  const events: NoteSurfaceHtmlRenderEventDescriptor[] = [];

  const returnLayer = model.quietWriting.returnLayer;
  if (returnLayer.open) {
    for (const returnAction of ['defer_return_layer', 'close_return_layer'] as const) {
      events.push({
        action: returnAction,
        target: 'return_layer',
        label: renderReturnLayerActionLabel(returnAction),
        dataAction: returnAction,
        noteId: model.noteSurface.noteHeader.noteId,
        apiIntent: 'none',
        emitsAiProviderCall: false,
        mutatesUserAuthoredBlock: false,
        hiddenProfiling: false,
        automaticActiveMemory: false,
      });
    }

    for (const point of returnLayer.points) {
      if (!point.sourceInspectable || point.source?.blockId === undefined) {
        continue;
      }

      events.push({
        action: 'inspect_source',
        target: 'return_layer',
        label: '出典',
        dataAction: 'inspect_source',
        noteId: model.noteSurface.noteHeader.noteId,
        blockId: point.source.blockId,
        userIntent: 'inspect_source_provenance',
        apiIntent: 'provenance.lookup',
        emitsAiProviderCall: false,
        mutatesUserAuthoredBlock: false,
        hiddenProfiling: false,
        automaticActiveMemory: false,
      });
    }
  } else if (returnLayer.available) {
    events.push({
      action: 'expand_digest',
      target: 'next_open_digest',
      label: '整理を見る',
      dataAction: 'expand_digest',
      noteId: model.noteSurface.noteHeader.noteId,
      apiIntent: 'none',
      emitsAiProviderCall: false,
      mutatesUserAuthoredBlock: false,
      hiddenProfiling: false,
      automaticActiveMemory: false,
    });
  }

  if (model.quietWriting.reEntrySurface.visible) {
    events.push({
      action: 'continue_writing',
      target: 're_entry_surface',
      label: 'ここから続ける',
      dataAction: 'continue_writing',
      noteId: model.noteSurface.noteHeader.noteId,
      apiIntent: 'none',
      emitsAiProviderCall: false,
      mutatesUserAuthoredBlock: false,
      hiddenProfiling: false,
      automaticActiveMemory: false,
    });
  }

  events.push({
    action: 'manual_organize',
    target: 'writing_chrome',
    label: '整理',
    dataAction: 'manual_organize',
    noteId: model.noteSurface.noteHeader.noteId,
    apiIntent: 'note.manual_structure',
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  });

  if (model.noteSurface.organizationLayer.historyAffordance.visible) {
    events.push({
      action: 'open_organization_history',
      target: 'organization_history',
      label: model.noteSurface.organizationLayer.historyAffordance.label,
      dataAction: 'open_organization_history',
      noteId: model.noteSurface.noteHeader.noteId,
      apiIntent: 'none',
      emitsAiProviderCall: false,
      mutatesUserAuthoredBlock: false,
      hiddenProfiling: false,
      automaticActiveMemory: false,
    });
  }

  for (const block of model.noteSurface.blocks) {
    if (block.memoryCandidate !== undefined) {
      for (const action of block.memoryCandidate.actions) {
        events.push(createMemoryCandidateEvent(block, action));
      }
      continue;
    }

    if (block.aiAssist !== undefined) {
      for (const action of block.aiAssist.actions) {
        events.push(createAiAssistEvent(block, action));
      }
      continue;
    }

    for (const action of block.editor.actions) {
      events.push({
        action,
        target: 'block_editor',
        label: renderBlockEditorActionLabel(action),
        dataAction: action,
        noteId: model.noteSurface.noteHeader.noteId,
        blockId: block.id,
        blockType: block.type,
        apiIntent: action === 'save_block' && block.origin === 'user'
          ? 'block.update'
          : 'none',
        emitsAiProviderCall: false,
        mutatesUserAuthoredBlock: false,
        hiddenProfiling: false,
        automaticActiveMemory: false,
      });
    }
  }

  if (model.noteSurface.provenancePopover.open) {
    events.push({
      action: 'close_provenance',
      target: 'provenance_popover',
      label: '閉じる',
      dataAction: 'close_provenance',
      noteId: model.noteSurface.noteHeader.noteId,
      apiIntent: 'none',
      emitsAiProviderCall: false,
      mutatesUserAuthoredBlock: false,
      hiddenProfiling: false,
      automaticActiveMemory: false,
    });
  }

  return events;
}

function createAiAssistEvent(
  block: NoteBlockViewModel,
  action: AiAssistBlockActionIntent,
): NoteSurfaceHtmlRenderEventDescriptor {
  return {
    action: action.id,
    target: 'ai_assist_block',
    label: action.label,
    dataAction: action.id,
    blockId: block.id,
    blockType: block.type,
    userIntent: action.userIntent,
    apiIntent: action.apiIntent,
    ...(action.event === undefined ? {} : { event: action.event }),
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  };
}

function createMemoryCandidateEvent(
  block: NoteBlockViewModel,
  action: MemoryCandidateBlockActionIntent,
): NoteSurfaceHtmlRenderEventDescriptor {
  return {
    action: action.id,
    target: 'memory_candidate_block',
    label: action.label,
    dataAction: action.id,
    blockId: block.id,
    blockType: block.type,
    userIntent: action.userIntent,
    apiIntent: action.apiIntent,
    ...(action.event === undefined ? {} : { event: action.event }),
    emitsAiProviderCall: false,
    mutatesUserAuthoredBlock: false,
    hiddenProfiling: false,
    automaticActiveMemory: false,
  };
}
