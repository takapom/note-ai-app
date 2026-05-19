import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createNoteSurfaceActionInputResolver } from '../../apps/web/src/noteSurfaceActionInputResolver.ts';
import { createNoteSurfaceResolverOptionsFromDocument } from '../../apps/web/src/noteSurfaceResolverOptionsFromDocument.ts';
import { noteDocumentFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

test('resolver options mapper creates action lookup inputs from AI blocks memory blocks and complete source annotations', () => {
  const document = documentWithBlocks([
    {
      id: 'block_ai_summary_001',
      type: 'ai_summary',
      text: 'AI summary',
      annotations: [
        { kind: 'comment' },
        {
          kind: 'source_span',
          sourceBlockId: 'block_paragraph_001',
          startOffset: 4,
          endOffset: 42,
          reason: 'Summary derived from paragraph.',
        },
      ],
    },
    {
      id: 'block_ai_memory_candidate_001',
      type: 'ai_memory_candidate',
      text: 'Remember source-backed editor preference.',
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: 'block_paragraph_001',
          startOffset: 8,
          endOffset: 18,
          reason: 'Memory candidate derived from paragraph.',
        },
      ],
    },
  ]);

  const result = createNoteSurfaceResolverOptionsFromDocument({
    document,
    operationIdByBlockId: {
      block_ai_summary_001: 'operation_summary_001',
      block_ai_memory_candidate_001: 'operation_must_not_attach_to_memory_candidate',
    },
    memoryIdByBlockId: {
      block_ai_memory_candidate_001: 'memory_candidate_001',
    },
    sourceSpanIdByBlockId: {
      block_ai_summary_001: 'source_span_summary_001',
      block_ai_memory_candidate_001: 'source_span_memory_001',
    },
    memoryEditContentByBlockId: {
      block_ai_memory_candidate_001: 'Remember source-backed editor preference.',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.options.activeNoteId, document.note.id);
  assert.deepEqual(result.options.operationIdByBlockId, {
    block_ai_summary_001: 'operation_summary_001',
  });
  assert.deepEqual(result.options.memoryIdByBlockId, {
    block_ai_memory_candidate_001: 'memory_candidate_001',
  });
  assert.deepEqual(result.options.memoryEditContentByBlockId, {
    block_ai_memory_candidate_001: 'Remember source-backed editor preference.',
  });
  assert.deepEqual(result.options.provenanceByBlockId, {
    block_ai_summary_001: {
      sourceSpanId: 'source_span_summary_001',
      sourceBlockId: 'block_paragraph_001',
      startOffset: 4,
      endOffset: 42,
    },
    block_ai_memory_candidate_001: {
      sourceSpanId: 'source_span_memory_001',
      sourceBlockId: 'block_paragraph_001',
      startOffset: 8,
      endOffset: 18,
    },
  });

  const resolveActionInput = createNoteSurfaceActionInputResolver(result.options);
  assert.deepEqual(resolveActionInput({
    action: 'adopt',
    target: 'ai_assist_block',
    blockId: 'block_ai_summary_001',
    apiIntent: 'ai_assist.accept',
  }), { operationId: 'operation_summary_001' });
  assert.deepEqual(resolveActionInput({
    action: 'remember',
    target: 'memory_candidate_block',
    blockId: 'block_ai_memory_candidate_001',
    apiIntent: 'memory.remember',
  }), { memoryId: 'memory_candidate_001' });
  assert.deepEqual(resolveActionInput({
    action: 'inspect_source',
    target: 'ai_assist_block',
    blockId: 'block_ai_summary_001',
    apiIntent: 'provenance.lookup',
  }), {
    provenance: {
      sourceSpanId: 'source_span_summary_001',
      sourceBlockId: 'block_paragraph_001',
      startOffset: 4,
      endOffset: 42,
    },
  });
});

test('resolver options mapper omits provenance when source annotation or caller source span id is incomplete', () => {
  const document = documentWithBlocks([
    {
      id: 'block_ai_missing_source_span_id_001',
      type: 'ai_question',
      text: 'Question without caller source span id.',
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: 'block_paragraph_001',
          startOffset: 1,
          endOffset: 3,
        },
      ],
    },
    {
      id: 'block_ai_incomplete_annotation_001',
      type: 'ai_decision',
      text: 'Decision without complete annotation offsets.',
      annotations: [
        {
          kind: 'source_span',
          sourceBlockId: 'block_paragraph_001',
          startOffset: 2,
        },
      ],
    },
  ]);

  const result = createNoteSurfaceResolverOptionsFromDocument({
    document,
    sourceSpanIdByBlockId: {
      block_ai_incomplete_annotation_001: 'source_span_incomplete_001',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.options.provenanceByBlockId, undefined);
});

test('resolver options mapper uses only caller supplied operation and memory ids', () => {
  const document = documentWithBlocks([
    {
      id: 'block_ai_question_001',
      type: 'ai_question',
      text: 'Question without operation id.',
    },
    {
      id: 'block_ai_memory_candidate_001',
      type: 'ai_memory_candidate',
      text: 'Memory candidate without memory id.',
    },
    {
      id: 'block_paragraph_001',
      type: 'paragraph',
      text: 'User text.',
    },
  ]);

  const result = createNoteSurfaceResolverOptionsFromDocument({
    document,
    operationIdByBlockId: {
      block_paragraph_001: 'operation_must_not_attach_to_user_block',
    },
    memoryIdByBlockId: {
      block_ai_question_001: 'memory_must_not_attach_to_non_memory_block',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.options.operationIdByBlockId, undefined);
  assert.equal(result.options.memoryIdByBlockId, undefined);
  assert.equal(result.options.provenanceByBlockId, undefined);
});

test('resolver options mapper accepts caller supplied active note id before document note id default', () => {
  const result = createNoteSurfaceResolverOptionsFromDocument({
    document: structuredClone(noteDocumentFixture),
    activeNoteId: 'note_active_runtime_001',
  });

  assert.equal(result.ok, true);
  assert.equal(result.options.activeNoteId, 'note_active_runtime_001');
});

test('resolver options mapper returns errors for invalid document input', () => {
  const result = createNoteSurfaceResolverOptionsFromDocument({
    document: {
      note: { id: '' },
      sections: 'not_sections',
      blocks: [{ id: '', type: 123, contentJson: null }],
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /document\.note\.id must be a non-empty string/);
  assert.match(result.errors.join('\n'), /document\.sections must be an array/);
  assert.match(result.errors.join('\n'), /document\.blocks\[0\]\.id must be a non-empty string/);
  assert.match(result.errors.join('\n'), /document\.blocks\[0\]\.type must be a string/);
  assert.match(result.errors.join('\n'), /document\.blocks\[0\]\.contentJson must be an object/);
});

test('resolver options mapper source stays inside the web product mapping boundary', async () => {
  const source = await readFile(
    new URL('../../apps/web/src/noteSurfaceResolverOptionsFromDocument.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /export function createNoteSurfaceResolverOptionsFromDocument/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*apps\/worker/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*generated/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|new Request|globalThis\.fetch/i);
  assert.doesNotMatch(source, /providerAdapter|callProvider|externalAction/i);
  assert.doesNotMatch(source, /user_block\.direct_mutate|directUserBlockMutation|mutateUserAuthoredBlock|direct.*mutat/i);
  assert.doesNotMatch(source, /crypto\.randomUUID|Date\.now|Math\.random/);
  assert.doesNotMatch(source, /operationId\s*=\s*['"`]|memoryId\s*=\s*['"`]|sourceSpanId\s*=\s*['"`]/);
});

function documentWithBlocks(blocks) {
  const document = structuredClone(noteDocumentFixture);
  document.blocks = blocks.map((block, index) => ({
    id: block.id,
    noteId: document.note.id,
    sectionId: 'section_001',
    type: block.type,
    contentJson: {
      text: block.text,
      ...(block.annotations === undefined ? {} : { annotations: block.annotations }),
    },
    plainText: block.text,
    position: index,
    origin: block.type.startsWith('ai_') ? 'ai' : 'user',
    contentHash: `hash_${block.id}`,
    createdAt: document.note.createdAt,
    updatedAt: document.note.updatedAt,
  }));
  return document;
}
