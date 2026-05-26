import {
  type NoteSurfaceApiFetchLike,
} from './noteSurfaceApiTransport.ts';
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
}

export function registerNoteSurfacePageLeaveOnHide(
  options: RegisterNoteSurfacePageLeaveOptions,
): () => void {
  let sent = false;

  return options.lifecycle.onPageHide(() => {
    if (sent) {
      return;
    }
    sent = true;

    const apiClient = createNoteSurfaceApiClient({
      apiBaseUrl: options.apiBaseUrl,
      fetchLike: options.fetchLike,
      workspaceId: options.workspaceId,
      ...(options.userId === undefined ? {} : { userId: options.userId }),
    });
    void apiClient.leaveNote({ noteId: options.noteId, cause: 'app_leave' });
  });
}
