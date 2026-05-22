import type { NextOpenDigestInput, ProvenancePopoverInput } from '../../noteSurface.ts';
import { parseNextOpenDigestInput } from '../../noteSurface.ts';
import type { NoteSurfaceEventControllerResult } from '../../noteSurfaceEventController.ts';
import {
  readDescriptorRawString,
  readDescriptorString,
  readString,
} from './browserRuntimeDescriptor.ts';
import {
  readMemoryProjection,
  readProvenanceProjection,
} from './browserRuntimePayload.ts';

export type LocalProjectionAction =
  | { action: 'expand_digest' | 'collapse_digest'; target: 'next_open_digest' }
  | { action: 'close_return_layer' | 'defer_return_layer'; target: 'return_layer' }
  | { action: 'continue_writing'; target: 're_entry_surface'; directionId?: string }
  | { action: 'edit_block' | 'cancel_edit'; target: 'block_editor'; blockId: string }
  | { action: 'save_block'; target: 'block_editor'; blockId: string; content: string }
  | { action: 'edit'; target: 'ai_assist_block'; blockId: string; content?: string }
  | { action: 'close_provenance'; target: 'provenance_popover' };

export type SuccessfulApiProjectionAction =
  | LocalProjectionAction
  | { action: 'read_digest'; target: 'next_open_digest'; digest: NextOpenDigestInput }
  | { action: 'lookup_provenance'; target: 'provenance_popover'; provenance: ProvenancePopoverInput }
  | {
      action: 'remember' | 'reject' | 'delete' | 'snooze';
      target: 'memory_candidate_block';
      blockId: string;
    }
  | { action: 'adopt' | 'delete'; target: 'ai_assist_block'; blockId: string }
  | { action: 'edit'; target: 'memory_candidate_block'; blockId: string; content: string };

export type BlockUpdateProjectionAction = {
  action: 'save_block';
  target: 'block_editor';
  blockId: string;
  content: string;
};

export function resolveLocalProjectionAction(eventDescriptor: unknown): LocalProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent') ?? 'none';

  if (apiIntent !== 'none') {
    return undefined;
  }

  if (
    (action === 'expand_digest' || action === 'collapse_digest')
    && target === 'next_open_digest'
  ) {
    return { action, target };
  }

  if (
    (action === 'close_return_layer' || action === 'defer_return_layer')
    && target === 'return_layer'
  ) {
    return { action, target };
  }

  if (action === 'continue_writing' && target === 're_entry_surface') {
    const directionId = readDescriptorString(source, dataset, 'directionId');
    return directionId === undefined
      ? { action, target }
      : { action, target, directionId };
  }

  if (
    (action === 'edit_block' || action === 'cancel_edit')
    && target === 'block_editor'
  ) {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    return blockId === undefined ? undefined : { action, target, blockId };
  }

  if (action === 'save_block' && target === 'block_editor') {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    const content = readDescriptorRawString(source, dataset, 'content');
    return blockId === undefined || content === undefined ? undefined : { action, target, blockId, content };
  }

  if (action === 'edit' && target === 'ai_assist_block') {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    return blockId === undefined ? undefined : { action, target, blockId };
  }

  if (action === 'close_provenance' && target === 'provenance_popover') {
    return { action, target };
  }

  return undefined;
}

export function resolveInlineApiProjectionAction(eventDescriptor: unknown): {
  action: string;
  target: 'memory_candidate_block' | 'ai_assist_block';
  blockId: string;
} | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent');
  const blockId = readDescriptorString(source, dataset, 'blockId');

  if (apiIntent === undefined || apiIntent === 'none' || blockId === undefined || action === undefined) {
    return undefined;
  }

  if (target === 'memory_candidate_block' || target === 'ai_assist_block') {
    return { action, target, blockId };
  }

  return undefined;
}

export function resolveSuccessfulApiProjectionAction(
  eventDescriptor: unknown,
  controllerResult: NoteSurfaceEventControllerResult,
): SuccessfulApiProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent');

  if (action === 'save_block' && target === 'block_editor' && apiIntent === 'block.update') {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    const content = readDescriptorRawString(source, dataset, 'content');
    if (blockId === undefined || content === undefined) {
      return undefined;
    }

    return { action, target, blockId, content };
  }

  const body = controllerResult.transportResult?.body;

  if (
    action === 'read_digest'
    && target === 'next_open_digest'
    && (apiIntent === 'digest.read' || apiIntent === 'GET /notes/:noteId/digest')
  ) {
    const digest = parseNextOpenDigestInput(body);
    return { action, target, digest: digest ?? { available: false, loadState: 'invalid_body' } };
  }

  if (
    action === 'inspect_source'
    && (target === 'ai_assist_block' || target === 'return_layer' || target === 'provenance_popover')
    && (apiIntent === 'provenance.lookup' || apiIntent === 'POST /provenance/source')
  ) {
    const provenance = readProvenanceProjection(body);
    return provenance === undefined
      ? undefined
      : { action: 'lookup_provenance', target: 'provenance_popover', provenance };
  }

  if (
    target === 'memory_candidate_block'
    && (
      apiIntent === 'memory.remember'
      || apiIntent === 'memory.reject'
      || apiIntent === 'memory.edit'
      || apiIntent === 'memory.delete'
      || apiIntent === 'memory.snooze'
      || apiIntent === 'POST /memory/:memoryId/accept'
      || apiIntent === 'POST /memory/:memoryId/reject'
      || apiIntent === 'POST /memory/:memoryId/edit'
      || apiIntent === 'POST /memory/:memoryId/delete'
      || apiIntent === 'POST /memory/:memoryId/hold'
    )
  ) {
    const blockId = readDescriptorString(source, dataset, 'blockId');
    if (blockId === undefined) {
      return undefined;
    }

    const memory = readMemoryProjection(body);
    if (memory === undefined) {
      return undefined;
    }

    if (action === 'edit') {
      const content = readString(memory.content) ?? readDescriptorRawString(source, dataset, 'content');
      return content === undefined ? undefined : { action, target, blockId, content };
    }

    if (
      action === 'remember'
      || action === 'reject'
      || action === 'delete'
      || action === 'snooze'
    ) {
      return { action, target, blockId };
    }
  }

  if (
    target === 'ai_assist_block'
    && (action === 'adopt' || action === 'delete')
    && (
      apiIntent === 'ai.operation.accept'
      || apiIntent === 'ai.operation.dismiss'
      || apiIntent === 'POST /ai-operations/:operationId/accept'
      || apiIntent === 'POST /ai-operations/:operationId/dismiss'
    )
  ) {
    const aiBlockId = readDescriptorString(source, dataset, 'blockId');
    return aiBlockId === undefined ? undefined : { action, target: 'ai_assist_block', blockId: aiBlockId };
  }

  return undefined;
}

export function resolveDigestReadFailureProjectionAction(
  eventDescriptor: unknown,
): SuccessfulApiProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent');

  return action === 'read_digest'
    && target === 'next_open_digest'
    && (apiIntent === 'digest.read' || apiIntent === 'GET /notes/:noteId/digest')
    ? { action, target, digest: { available: false, loadState: 'transport_failed' } }
    : undefined;
}

export function resolveBlockUpdateProjectionAction(eventDescriptor: unknown): BlockUpdateProjectionAction | undefined {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return undefined;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const apiIntent = readDescriptorString(source, dataset, 'apiIntent');

  if (action !== 'save_block' || target !== 'block_editor' || apiIntent !== 'block.update') {
    return undefined;
  }

  const blockId = readDescriptorString(source, dataset, 'blockId');
  const content = readDescriptorRawString(source, dataset, 'content');
  return blockId === undefined || content === undefined
    ? undefined
    : { action, target, blockId, content };
}

export function isInputCompositionSaveBlocked(eventDescriptor: unknown): boolean {
  if (eventDescriptor === null || typeof eventDescriptor !== 'object') {
    return false;
  }

  const source = eventDescriptor as Record<string, unknown>;
  const dataset = source.dataset !== null && typeof source.dataset === 'object'
    ? source.dataset as Record<string, unknown>
    : undefined;
  const action = readDescriptorString(source, dataset, 'action');
  const target = readDescriptorString(source, dataset, 'target');
  const state = readDescriptorString(source, dataset, 'inputCompositionState');

  return action === 'save_block'
    && target === 'block_editor'
    && (state === 'active' || state === 'pending');
}
