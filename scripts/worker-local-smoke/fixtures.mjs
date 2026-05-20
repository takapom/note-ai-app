import {
  blockFixtures,
  noteDocumentFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';

export function createLocalSmokeDocument(config) {
  const document = structuredClone(noteDocumentFixture);
  const paragraphFixtureId = blockFixtures.find((block) => block.origin === 'user' && block.type === 'paragraph')?.id;

  document.note = {
    ...document.note,
    id: config.noteId,
    workspaceId: config.workspaceId,
  };
  document.sections = document.sections.map((section) => ({
    ...section,
    noteId: config.noteId,
  }));
  document.blocks = document.blocks.map((block) => {
    const nextId = block.id === paragraphFixtureId ? config.blockId : block.id;
    return {
      ...block,
      id: nextId,
      noteId: config.noteId,
      contentJson: rewriteAnnotationSourceBlockIds(block.contentJson, paragraphFixtureId, config.blockId),
    };
  });

  return document;
}

export function createLocalSmokeNextOpenDigest(config) {
  return {
    available: true,
    noteId: config.noteId,
    triggerReason: 'next_open',
    preparedAt: Date.now(),
    recoveredJobCount: 0,
    sections: [],
    items: [],
  };
}

function rewriteAnnotationSourceBlockIds(contentJson, previousBlockId, nextBlockId) {
  if (previousBlockId === undefined || previousBlockId === nextBlockId || !isRecord(contentJson)) {
    return contentJson;
  }
  const annotations = Array.isArray(contentJson.annotations)
    ? contentJson.annotations.map((annotation) => (
        isRecord(annotation) && annotation.sourceBlockId === previousBlockId
          ? { ...annotation, sourceBlockId: nextBlockId }
          : annotation
      ))
    : undefined;

  return annotations === undefined
    ? contentJson
    : { ...contentJson, annotations };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
