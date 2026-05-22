import { createNoteSurfaceApiRequest } from './noteSurfaceApiIntents.ts';
import {
  sendNoteSurfaceApiRequest,
  type NoteSurfaceApiFetchLike,
} from './noteSurfaceApiTransport.ts';

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

    const mapped = createNoteSurfaceApiRequest({
      intent: 'note.leave',
      workspaceId: options.workspaceId,
      ...(options.userId === undefined ? {} : { userId: options.userId }),
      noteId: options.noteId,
      cause: 'app_leave',
    });
    if (!mapped.ok || mapped.request === undefined) {
      return;
    }

    void sendNoteSurfaceApiRequest(mapped.request, {
      baseUrl: options.apiBaseUrl,
      fetchLike: options.fetchLike,
    });
  });
}
