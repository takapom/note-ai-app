import { NextNoteSurfaceClient } from '../src/runtime/next/NextNoteSurfaceClient.tsx';
import {
  getNextNoteSurfaceServerSideProps,
  type NextNoteSurfacePageProps,
} from '../src/runtime/next/nextNoteSurfaceRoute.ts';

export default function NoteAppPage(props: NextNoteSurfacePageProps) {
  if (props.status === 'configuration_error') {
    return (
      <main className="ann-next-runtime-error" role="alert">
        <h1>ノートを開けませんでした。</h1>
        <ul>
          {props.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <NextNoteSurfaceClient
      apiBaseUrl={props.apiBaseUrl}
      workspaceId={props.workspaceId}
      noteId={props.noteId}
      {...(props.userId === undefined ? {} : { userId: props.userId })}
    />
  );
}

export const getServerSideProps = getNextNoteSurfaceServerSideProps;
