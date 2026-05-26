import { useEffect, useMemo, useRef, useState } from 'react';

import {
  mountBrowserNoteSurface,
  type BrowserNoteSurfaceMountResult,
} from '../../browserNoteSurfaceMount.ts';

export interface NextNoteSurfaceClientProps {
  apiBaseUrl: string;
  workspaceId: string;
  userId?: string;
  noteId: string;
}

const nextNoteSurfaceRootSelector = '[data-next-note-surface-root]';

export function NextNoteSurfaceClient(props: NextNoteSurfaceClientProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [mountErrors, setMountErrors] = useState<readonly string[]>([]);
  const {
    apiBaseUrl,
    workspaceId,
    userId,
    noteId,
  } = props;
  const mountKey = useMemo(
    () => [
      apiBaseUrl,
      workspaceId,
      userId ?? '',
      noteId,
    ].join('\u0000'),
    [apiBaseUrl, workspaceId, userId, noteId],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }

    let cancelled = false;
    setMountErrors([]);
    root.replaceChildren();

    void mountForNextRoute({
      apiBaseUrl,
      workspaceId,
      noteId,
      ...(userId === undefined ? {} : { userId }),
    }).then((result) => {
      if (cancelled || result.ok) {
        return;
      }

      setMountErrors(result.errors);
    });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, workspaceId, userId, noteId]);

  return (
    <>
      {mountErrors.length > 0 ? (
        <div role="alert" className="ann-next-runtime-error">
          <p>ノートを読み込めませんでした。</p>
          <ul>
            {mountErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <main
        key={mountKey}
        ref={rootRef}
        data-next-note-surface-root
      />
    </>
  );
}

async function mountForNextRoute(
  props: NextNoteSurfaceClientProps,
): Promise<BrowserNoteSurfaceMountResult> {
  const apiBaseUrl = new URL(props.apiBaseUrl, globalThis.location.origin).toString();

  return mountBrowserNoteSurface({
    rootSelector: nextNoteSurfaceRootSelector,
    apiBaseUrl,
    workspaceId: props.workspaceId,
    noteId: props.noteId,
    ...(props.userId === undefined ? {} : { userId: props.userId }),
    fetchLike: (url, init) => fetch(url, init),
  });
}
