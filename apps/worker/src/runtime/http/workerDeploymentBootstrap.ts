// Browser deployment bootstrap metadata for the hosted note surface.
// Authority: docs/contracts/backend-runtime.md

import { isStableRuntimeId } from './workerAuthBoundary.ts';
import type { WorkerHttpRequest, WorkerHttpResponse } from './workerHttpRouterTypes.ts';

export const WORKER_DEPLOYMENT_BOOTSTRAP_PATH = '/__ann/bootstrap';

export interface WorkerDeploymentBootstrapEnv {
  NOTE_ID?: unknown;
  [key: string]: unknown;
}

export function handleWorkerDeploymentBootstrapRequest(input: {
  request: WorkerHttpRequest;
  env?: WorkerDeploymentBootstrapEnv;
  requestOrigin: string;
}): WorkerHttpResponse | undefined {
  const requestUrl = new URL(input.request.path, input.requestOrigin);
  if (requestUrl.pathname !== WORKER_DEPLOYMENT_BOOTSTRAP_PATH) {
    return undefined;
  }

  if (input.request.method.toUpperCase() !== 'GET') {
    return {
      status: 405,
      body: { ok: false, errors: ['deployment bootstrap only supports GET'] },
    };
  }

  const noteId = readStableNoteId(requestUrl.searchParams.get('noteId'), input.env?.NOTE_ID);
  if (noteId === undefined) {
    return {
      status: 400,
      body: { ok: false, errors: ['noteId must be supplied by query or deployment env'] },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      apiBaseUrl: `${input.requestOrigin}/`,
      workspaceId: input.request.workspaceId,
      ...(input.request.userId === undefined ? {} : { userId: input.request.userId }),
      noteId,
    },
  };
}

function readStableNoteId(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (isStableRuntimeId(value)) {
      return value;
    }
  }
  return undefined;
}
