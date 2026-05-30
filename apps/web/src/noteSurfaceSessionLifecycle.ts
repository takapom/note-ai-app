import {
  type NoteSurfaceApiFetchLike,
} from './noteSurfaceApiTransport.ts';
import type { NoteSurfaceDirtyBlockDraft } from './noteSurfaceBrowserRuntime.ts';
import { createNoteSurfaceApiClient } from './runtime/api-client/noteSurfaceApiClient.ts';

export interface NoteSurfacePageLifecyclePort {
  onPageHide(listener: () => void): () => void;
}

export interface RegisterNoteSurfacePageLeaveOptions {
  apiBaseUrl: string | URL;
  fetchLike: NoteSurfaceApiFetchLike;
  workspaceId: string;
  userId?: string;
  noteId: string;
  lifecycle: NoteSurfacePageLifecyclePort;
  readPageLeaveSnapshot?: () => NoteSurfacePageLeaveSnapshot;
}

export interface NoteSurfacePageLeaveSnapshot {
  noteId: string;
  dirtyBlockDrafts: readonly NoteSurfaceDirtyBlockDraft[];
}

export function registerNoteSurfacePageLeaveOnHide(
  options: RegisterNoteSurfacePageLeaveOptions,
): () => void {
  let sent = false;

  return options.lifecycle.onPageHide(() => {
    if (sent) {
      return;
    }

    const snapshot = readSnapshot(options);
    if (snapshot === undefined || hasComposingDraft(snapshot.dirtyBlockDrafts)) {
      return;
    }

    const apiClient = createNoteSurfaceApiClient({
      apiBaseUrl: options.apiBaseUrl,
      fetchLike: options.fetchLike,
      workspaceId: options.workspaceId,
      ...(options.userId === undefined ? {} : { userId: options.userId }),
      keepalive: true,
    });
    sent = true;
    void apiClient.leaveNote({
      noteId: snapshot.noteId,
      cause: 'app_leave',
      latestBlockUpdates: snapshot.dirtyBlockDrafts.map((draft) => ({
        blockId: draft.blockId,
        content: draft.content,
      })),
    });
  });
}

function readSnapshot(
  options: RegisterNoteSurfacePageLeaveOptions,
): NoteSurfacePageLeaveSnapshot | undefined {
  try {
    return options.readPageLeaveSnapshot?.() ?? {
      noteId: options.noteId,
      dirtyBlockDrafts: [],
    };
  } catch {
    return undefined;
  }
}

function hasComposingDraft(drafts: readonly NoteSurfaceDirtyBlockDraft[]): boolean {
  return drafts.some((draft) => (
    draft.inputCompositionState === 'active'
    || draft.inputCompositionState === 'pending'
  ));
}
