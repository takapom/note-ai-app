// Local verification-only seed/reset support for Worker smoke runs.
// Authority: docs/contracts/backend-runtime.md

import { NoteDocumentBlockCommandPort } from './noteBlockCommandPort.ts';
import {
  InMemoryNoteDocumentPersistencePort,
  type NoteDocumentPersistencePort,
} from './noteDocumentPersistencePort.ts';
import type { NoteDocumentContract } from '../../../contexts/note-model/src/contract/noteContract.ts';
import type { DigestReadPort, NextOpenDigestReadModel } from './nextOpenDigestReadPort.ts';
import type { WorkerHttpRequest, WorkerHttpResponse, WorkerHttpRouterPorts } from './workerHttpRouter.ts';

export const LOCAL_SMOKE_SEED_PATH = '/__local/smoke/seed';
export const LOCAL_SMOKE_RESET_PATH = '/__local/smoke/reset';

interface LocalSmokeSeed {
  document: NoteDocumentContract;
  nextOpenDigest?: NextOpenDigestReadModel;
}

const documents = new Map<string, NoteDocumentPersistencePort>();
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
  if (noteId === undefined) {
    return undefined;
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
    noteBlocks,
    digestRead,
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
