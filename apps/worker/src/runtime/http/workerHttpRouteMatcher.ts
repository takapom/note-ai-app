// Route matching for the framework-neutral Worker HTTP boundary.
// Authority: docs/contracts/api-events.md

import type { MatchedWorkerRoute } from './workerHttpRouterTypes.ts';

export function matchWorkerRoute(method: string, path: string): MatchedWorkerRoute | undefined {
  const normalizedMethod = method.toUpperCase();
  const segments = splitPath(path);

  if (segments.length === 1 && segments[0] === 'notes') {
    if (normalizedMethod === 'GET') return { name: 'list_notes', params: {} };
    if (normalizedMethod === 'POST') return { name: 'create_note', params: {} };
    return undefined;
  }

  if (segments.length === 2 && segments[0] === 'notes') {
    if (normalizedMethod === 'GET') return { name: 'get_note', params: { noteId: segments[1] } };
    if (normalizedMethod === 'PATCH') return { name: 'update_note', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'notes' && segments[2] === 'blocks') {
    if (normalizedMethod === 'POST') return { name: 'create_block', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 2 && segments[0] === 'blocks') {
    if (normalizedMethod === 'PATCH') return { name: 'update_block', params: { blockId: segments[1] } };
    if (normalizedMethod === 'DELETE') return { name: 'delete_block', params: { blockId: segments[1] } };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'notes' && segments[2] === 'leave') {
    if (normalizedMethod === 'POST') return { name: 'leave_note', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 4 && segments[0] === 'notes' && segments[2] === 'structure' && segments[3] === 'manual') {
    if (normalizedMethod === 'POST') return { name: 'manual_organize_note', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'notes' && segments[2] === 'digest') {
    if (normalizedMethod === 'GET') return { name: 'get_digest', params: { noteId: segments[1] } };
    return undefined;
  }

  if (segments.length === 2 && segments[0] === 'provenance' && segments[1] === 'source') {
    if (normalizedMethod === 'POST') return { name: 'lookup_provenance_source', params: {} };
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'ai-operations') {
    if (normalizedMethod === 'POST' && segments[2] === 'accept') {
      return { name: 'accept_operation', params: { operationId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'dismiss') {
      return { name: 'dismiss_operation', params: { operationId: segments[1] } };
    }
    return undefined;
  }

  if (segments.length === 3 && segments[0] === 'memory') {
    if (normalizedMethod === 'POST' && segments[2] === 'accept') {
      return { name: 'accept_memory', params: { memoryId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'reject') {
      return { name: 'reject_memory', params: { memoryId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'edit') {
      return { name: 'edit_memory', params: { memoryId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'delete') {
      return { name: 'delete_memory', params: { memoryId: segments[1] } };
    }
    if (normalizedMethod === 'POST' && segments[2] === 'hold') {
      return { name: 'hold_memory', params: { memoryId: segments[1] } };
    }
  }

  return undefined;
}

export function splitPath(path: string): string[] {
  return path
    .split('?')[0]
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(decodeURIComponent);
}

export function methodAllowedForKnownPath(method: string, path: string): boolean {
  return matchWorkerRoute(method, path) === undefined &&
    ['GET', 'POST', 'PATCH', 'DELETE'].some((candidate) => matchWorkerRoute(candidate, path) !== undefined);
}
