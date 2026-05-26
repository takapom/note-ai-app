import type { GetServerSideProps, GetServerSidePropsContext } from 'next';

import {
  NEXT_WORKER_API_PROXY_BASE_PATH,
  isStableNextRuntimeId,
  resolveNextWorkerBackendConfig,
  type NextWorkerBackendConfigResult,
  type NextWorkerBackendEnv,
} from './workerBackendConfig.ts';

export type NextNoteSurfacePageProps =
  | {
      status: 'ready';
      apiBaseUrl: string;
      workspaceId: string;
      userId?: string;
      noteId: string;
    }
  | {
      status: 'configuration_error';
      errors: readonly string[];
    };

interface RuntimeMetadataCandidate {
  workspaceId?: string;
  userId?: string;
  noteId?: string;
}

interface RuntimeMetadata {
  workspaceId: string;
  userId?: string;
  noteId: string;
}

export const getNextNoteSurfaceServerSideProps: GetServerSideProps<NextNoteSurfacePageProps> = async (context) => {
  const origin = resolveRequestOrigin(context);
  if (origin === undefined) {
    return configurationError(['request host is required to build the Next.js API route']);
  }

  const backendConfig = resolveNextWorkerBackendConfig(process.env);
  if (!backendConfig.ok) {
    return configurationError(backendConfig.errors);
  }

  const runtimeMetadata = await resolveRuntimeMetadata(context, backendConfig, process.env);
  if (!runtimeMetadata.ok) {
    return configurationError(runtimeMetadata.errors);
  }

  return {
    props: {
      status: 'ready',
      apiBaseUrl: new URL(NEXT_WORKER_API_PROXY_BASE_PATH, origin).toString(),
      workspaceId: runtimeMetadata.metadata.workspaceId,
      noteId: runtimeMetadata.metadata.noteId,
      ...(runtimeMetadata.metadata.userId === undefined ? {} : { userId: runtimeMetadata.metadata.userId }),
    },
  };
};

async function resolveRuntimeMetadata(
  context: GetServerSidePropsContext,
  backendConfig: Extract<NextWorkerBackendConfigResult, { ok: true }>,
  env: NextWorkerBackendEnv,
): Promise<
  | { ok: true; metadata: RuntimeMetadata }
  | { ok: false; errors: readonly string[] }
> {
  const candidate = readRuntimeMetadataCandidate(context, env);
  const direct = normalizeRuntimeMetadata(candidate);
  if (direct.ok) {
    return direct;
  }

  const bootstrap = await fetchWorkerBootstrapMetadata(context, backendConfig, candidate);
  if (bootstrap.ok) {
    return bootstrap;
  }

  return {
    ok: false,
    errors: [
      ...direct.errors,
      ...bootstrap.errors,
    ],
  };
}

function readRuntimeMetadataCandidate(
  context: GetServerSidePropsContext,
  env: NextWorkerBackendEnv,
): RuntimeMetadataCandidate {
  const workspaceId = firstQueryOrEnvValue(context.query.workspaceId, env.ANN_WORKSPACE_ID);
  const userId = firstQueryOrEnvValue(context.query.userId, env.ANN_USER_ID);
  const noteId = firstQueryOrEnvValue(context.query.noteId, env.ANN_NOTE_ID);

  return {
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(userId === undefined ? {} : { userId }),
    ...(noteId === undefined ? {} : { noteId }),
  };
}

function normalizeRuntimeMetadata(candidate: RuntimeMetadataCandidate):
  | { ok: true; metadata: RuntimeMetadata }
  | { ok: false; errors: readonly string[] } {
  const workspaceId = candidate.workspaceId;
  const userId = candidate.userId;
  const noteId = candidate.noteId;
  const errors: string[] = [];

  if (!isStableNextRuntimeId(workspaceId)) {
    errors.push('workspaceId must be supplied by query, Next.js env, or Worker bootstrap');
  }

  if (!isStableNextRuntimeId(noteId)) {
    errors.push('noteId must be supplied by query, Next.js env, or Worker bootstrap');
  }

  if (userId !== undefined && !isStableNextRuntimeId(userId)) {
    errors.push('userId must be a stable non-sentinel runtime id when provided');
  }

  if (errors.length > 0 || workspaceId === undefined || noteId === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    metadata: {
      workspaceId,
      noteId,
      ...(userId === undefined ? {} : { userId }),
    },
  };
}

async function fetchWorkerBootstrapMetadata(
  context: GetServerSidePropsContext,
  backendConfig: Extract<NextWorkerBackendConfigResult, { ok: true }>,
  candidate: RuntimeMetadataCandidate,
): Promise<
  | { ok: true; metadata: RuntimeMetadata }
  | { ok: false; errors: readonly string[] }
> {
  const bootstrapUrl = new URL('/__ann/bootstrap', backendConfig.baseUrl);
  const noteId = firstQueryValue(context.query.noteId) ?? candidate.noteId;
  if (noteId !== undefined) {
    bootstrapUrl.searchParams.set('noteId', noteId);
  }

  try {
    const response = await fetch(bootstrapUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...backendConfig.authHeaders,
        ...(candidate.workspaceId === undefined ? {} : { 'X-Workspace-Id': candidate.workspaceId }),
        ...(candidate.userId === undefined ? {} : { 'X-User-Id': candidate.userId }),
      },
    });
    const body = await parseJsonResponseBody(response);
    if (!response.ok) {
      return {
        ok: false,
        errors: readResponseErrors(body, `Worker bootstrap failed with status ${response.status}`),
      };
    }

    return normalizeRuntimeMetadata(readBootstrapMetadataCandidate(body));
  } catch (error) {
    return {
      ok: false,
      errors: [`Worker bootstrap request failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function parseJsonResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function readBootstrapMetadataCandidate(body: unknown): RuntimeMetadataCandidate {
  if (body === null || typeof body !== 'object') {
    return {};
  }

  const record = body as Record<string, unknown>;
  return {
    ...(typeof record.workspaceId === 'string' ? { workspaceId: record.workspaceId } : {}),
    ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
    ...(typeof record.noteId === 'string' ? { noteId: record.noteId } : {}),
  };
}

function readResponseErrors(body: unknown, fallback: string): readonly string[] {
  if (body !== null && typeof body === 'object') {
    const errors = (body as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.every((error) => typeof error === 'string')) {
      return errors;
    }
  }

  return [fallback];
}

function resolveRequestOrigin(context: GetServerSidePropsContext): string | undefined {
  const host = firstHeaderValue(context.req.headers['x-forwarded-host'])
    ?? firstHeaderValue(context.req.headers.host);
  if (host === undefined) {
    return undefined;
  }

  const protocol = firstHeaderValue(context.req.headers['x-forwarded-proto'])
    ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${protocol}://${host}`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') {
    return undefined;
  }

  const first = candidate.split(',')[0].trim();
  return first.length === 0 ? undefined : first;
}

function firstQueryOrEnvValue(
  queryValue: string | string[] | undefined,
  envValue: string | undefined,
): string | undefined {
  return firstQueryValue(queryValue) ?? normalizeString(envValue);
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return normalizeString(candidate);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function configurationError(errors: readonly string[]): { props: NextNoteSurfacePageProps } {
  return {
    props: {
      status: 'configuration_error',
      errors,
    },
  };
}
