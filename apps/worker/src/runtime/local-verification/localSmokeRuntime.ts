// Local verification-only seed/reset support for Worker smoke runs.
// Authority: docs/contracts/backend-runtime.md

import { NoteDocumentBlockCommandPort } from '../../note-model/noteBlockCommandPort.ts';
import {
  InMemoryNoteDocumentPersistencePort,
  type NoteDocumentPersistencePort,
} from '../../note-model/noteDocumentPersistencePort.ts';
import { InMemoryNoteListPort } from '../../note-model/noteListPort.ts';
import type {
  BlockContract,
  HeadingLevel,
  NoteDocumentContract,
} from '../../../../../contexts/note-model/src/contract/noteContract.ts';
import type {
  ContextAssemblyRuntimePorts,
  ContextAssemblyRuntimeRequest,
} from '../../context-assembly/contextAssemblyRuntimeFlow.ts';
import type { DigestReadPort, NextOpenDigestReadModel } from '../../scheduler/nextOpenDigestReadPort.ts';
import type { WorkerHttpRequest, WorkerHttpResponse, WorkerHttpRouterPorts } from '../http/workerHttpRouter.ts';

export const LOCAL_SMOKE_SEED_PATH = '/__local/smoke/seed';
export const LOCAL_SMOKE_RESET_PATH = '/__local/smoke/reset';

interface LocalSmokeSeed {
  document: NoteDocumentContract;
  nextOpenDigest?: NextOpenDigestReadModel;
}

const documents = new Map<string, NoteDocumentPersistencePort>();
const documentSnapshots = new Map<string, NoteDocumentContract>();
const digests = new Map<string, NextOpenDigestReadModel>();

export function isLocalSmokePath(path: string): boolean {
  const normalized = path.split('?')[0];
  return normalized === LOCAL_SMOKE_SEED_PATH || normalized === LOCAL_SMOKE_RESET_PATH;
}

export async function handleLocalSmokeRuntimeRequest(
  request: WorkerHttpRequest,
): Promise<WorkerHttpResponse | undefined> {
  const path = request.path.split('?')[0];
  if (path === LOCAL_SMOKE_RESET_PATH) {
    if (request.method.toUpperCase() !== 'POST') {
      return {
        status: 405,
        body: { ok: false, errors: ['route not found'] },
      };
    }
    documents.clear();
    documentSnapshots.clear();
    digests.clear();
    return {
      status: 200,
      body: { ok: true, reset: true, errors: [] },
    };
  }

  if (path !== LOCAL_SMOKE_SEED_PATH) {
    return undefined;
  }
  if (request.method.toUpperCase() !== 'POST') {
    return {
      status: 405,
      body: { ok: false, errors: ['route not found'] },
    };
  }
  if (!isRecord(request.body) || !isRecord(request.body.document)) {
    return {
      status: 400,
      body: { ok: false, errors: ['body.document must be provided'] },
    };
  }

  const seed = request.body as unknown as LocalSmokeSeed;
  const key = localSmokeKey(seed.document.note.workspaceId, seed.document.note.id);
  documentSnapshots.set(key, structuredClone(seed.document));
  documents.set(key, new InMemoryNoteDocumentPersistencePort([
    structuredClone(seed.document),
  ]));
  if (isNextOpenDigestReadModel(seed.nextOpenDigest)) {
    digests.set(key, structuredClone(seed.nextOpenDigest));
  }

  return {
    status: 200,
    body: {
      ok: true,
      seeded: {
        workspaceId: seed.document.note.workspaceId,
        noteId: seed.document.note.id,
        sections: seed.document.sections.length,
        blocks: seed.document.blocks.length,
      },
      errors: [],
    },
  };
}

export function createLocalSmokeRuntimePorts(
  request: WorkerHttpRequest,
): WorkerHttpRouterPorts | undefined {
  const noteId = readNoteIdFromPath(request.path);
  const noteList = createLocalSmokeNoteListPort(request.workspaceId);
  if (noteId === undefined) {
    return isNoteListPath(request.path) && noteList !== undefined
      ? { noteList }
      : undefined;
  }

  const noteDocument = documents.get(localSmokeKey(request.workspaceId, noteId));
  if (noteDocument === undefined) {
    return undefined;
  }

  const noteBlocks = new NoteDocumentBlockCommandPort(noteDocument);
  const digestRead: DigestReadPort = {
    async getDigest(input) {
      if (input.noteId === undefined) {
        return {
          ok: false,
          errors: ['noteId must be provided for local smoke digest read'],
        };
      }

      const digest = digests.get(localSmokeKey(input.workspaceId, input.noteId));
      if (digest === undefined) {
        return {
          ok: true,
          errors: [],
          body: {
            available: false,
            noteId: input.noteId,
          },
        };
      }

      return {
        ok: true,
        errors: [],
        body: structuredClone(digest),
      };
    },
  };

  return {
    noteDocument,
    ...(noteList === undefined ? {} : { noteList }),
    noteBlocks,
    digestRead,
  };
}

export function createLocalSmokeContextAssemblyPorts(input: {
  workspaceId: string | undefined;
  noteId: string | undefined;
}): ContextAssemblyRuntimePorts | undefined {
  if (input.workspaceId === undefined || input.noteId === undefined) {
    return undefined;
  }

  const document = documentSnapshots.get(localSmokeKey(input.workspaceId, input.noteId));
  if (document === undefined) {
    return undefined;
  }

  return {
    targetSnapshot: {
      async loadTargetContext(request) {
        const blocks = selectTargetBlocks(document, request);
        if (blocks.length === 0) {
          throw new Error('local smoke target context has no user-authored source blocks');
        }

        return {
          target: {
            scope: request.targetScope,
            text: blocks.map((block) => block.plainText).join('\n'),
            sourceBlockIds: blocks.map((block) => block.id),
          },
          note: document.note,
          outline: document.sections
            .filter((section) => typeof section.title === 'string' && isHeadingLevel(section.headingLevel))
            .map((section) => ({
              sectionId: section.id,
              title: section.title as string,
              level: section.headingLevel as HeadingLevel,
            })),
        };
      },
    },
    localStructure: {
      async loadLocalStructure() {
        return {
          existingSemanticUnits: [],
          sectionSummaries: [],
        };
      },
    },
    relatedContext: {
      async loadRelatedContext() {
        return {
          semanticUnits: [],
          notes: [],
          sourceBlockExcerpts: [],
        };
      },
    },
    memoryContext: {
      async loadMemoryContext() {
        return {
          items: [],
        };
      },
    },
  };
}

function readNoteIdFromPath(path: string): string | undefined {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  if (segments[0] === 'notes' && typeof segments[1] === 'string') {
    return decodeURIComponent(segments[1]);
  }
  if (segments[0] === 'blocks') {
    for (const [key, port] of documents.entries()) {
      void port;
      const [, noteId] = key.split('::');
      if (noteId !== undefined) return noteId;
    }
  }
  return undefined;
}

function isNoteListPath(path: string): boolean {
  return path.split('?')[0] === '/notes';
}

function createLocalSmokeNoteListPort(workspaceId: string): InMemoryNoteListPort | undefined {
  const scopedDocuments = [...documentSnapshots.values()]
    .filter((document) => document.note.workspaceId === workspaceId)
    .map((document) => structuredClone(document));
  return scopedDocuments.length === 0 ? undefined : new InMemoryNoteListPort(scopedDocuments);
}

function selectTargetBlocks(
  document: NoteDocumentContract,
  request: ContextAssemblyRuntimeRequest,
): BlockContract[] {
  const userBlocks = document.blocks.filter((block) => block.origin === 'user');
  if (request.targetScope === 'note') {
    return userBlocks;
  }
  if (request.targetScope === 'chunk') {
    const chunk = document.implicitChunks?.find((candidate) => candidate.id === request.targetId);
    if (chunk !== undefined) {
      return userBlocks.filter((block) => chunk.sourceBlockIds.includes(block.id));
    }
    return userBlocks;
  }

  const targetSectionId = request.targetId ?? document.sections[0]?.id;
  return userBlocks.filter((block) => block.sectionId === targetSectionId);
}

function isHeadingLevel(value: unknown): value is HeadingLevel {
  return value === 1 || value === 2 || value === 3;
}

function localSmokeKey(workspaceId: string, noteId: string): string {
  return `${workspaceId}::${noteId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNextOpenDigestReadModel(value: unknown): value is NextOpenDigestReadModel {
  return isRecord(value) &&
    typeof value.available === 'boolean' &&
    typeof value.noteId === 'string';
}
