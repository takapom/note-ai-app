import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('note model contract exposes MVP block origins and block types', async () => {
  const source = await read('contexts/note-model/src/contract/noteContract.ts');

  for (const origin of ['user', 'ai', 'user_modified_ai', 'system']) {
    assert.match(source, new RegExp(`'${origin}'`));
  }

  for (const blockType of [
    'paragraph',
    'heading',
    'bullet_list_item',
    'numbered_list_item',
    'todo',
    'quote',
    'code',
    'divider',
    'ai_summary',
    'ai_question',
    'ai_decision',
    'ai_related_context',
    'ai_memory_candidate',
  ]) {
    assert.match(source, new RegExp(`'${blockType}'`));
  }
});

test('operation contract keeps forbidden rewrite operations out of MVP operation union', async () => {
  const source = await read('contexts/ai-operations/src/contract/operationContract.ts');

  for (const operation of [
    'create_semantic_unit',
    'create_relation',
    'create_memory_candidate',
    'insert_assist_block',
    'mark_stale',
    'no_op',
  ]) {
    assert.match(source, new RegExp(`type: '${operation}'`));
  }

  for (const forbidden of [
    'rewrite_user_block',
    'send_external_message',
    'create_external_event',
    'delete_user_block',
    'modify_user_block_without_review',
  ]) {
    assert.doesNotMatch(source, new RegExp(`type: '${forbidden}'`));
  }
});

test('scheduler contract encodes non-keystroke MVP triggers', async () => {
  const source = await read('contexts/scheduler/src/contract/structureSchedulerContract.ts');

  for (const trigger of ['note_closed', 'tab_switched', 'app_left', 'next_open', 'manual_organize']) {
    assert.match(source, new RegExp(`'${trigger}'`));
  }

  for (const helper of [
    'handleBlockChanged',
    'discoverDirtySections',
    'planStructureJobs',
    'shouldEnqueueStructureJob',
    'isWholeNoteScopeAllowed',
    'noteCloseFlowSteps',
  ]) {
    assert.match(source, new RegExp(`\\b${helper}\\b`));
  }

  assert.doesNotMatch(source, /keystroke|block_changed_llm/i);
});

test('memory contract includes pinned status from the current memory contract', async () => {
  const source = await read('contexts/memory/src/contract/memoryContract.ts');

  for (const status of ['candidate', 'pending', 'active', 'pinned', 'rejected', 'archived']) {
    assert.match(source, new RegExp(`'${status}'`));
  }
});

test('memory contract exposes source provenance references', async () => {
  const source = await read('contexts/memory/src/contract/memoryContract.ts');

  assert.match(source, /interface MemorySourceSpanContract/);
  assert.match(source, /sourceBlockId: string/);
  assert.match(source, /startOffset: number/);
  assert.match(source, /endOffset: number/);

  for (const reference of [
    'sourceUnitId?: string',
    'sourceNoteId?: string',
    'sourceSpan?: MemorySourceSpanContract',
  ]) {
    assert.match(source, new RegExp(reference.replace(/[?:]/g, '\\$&')));
  }
});
