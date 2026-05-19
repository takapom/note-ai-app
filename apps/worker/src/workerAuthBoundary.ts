// Framework-neutral auth/workspace normalization boundary for Worker fetch.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/security-privacy.md, docs/contracts/api-events.md

export interface WorkerAuthBoundaryEnv {
  WORKSPACE_ID?: unknown;
  USER_ID?: unknown;
  WORKER_AUTH_SHARED_SECRET?: unknown;
  AUTH_SHARED_SECRET?: unknown;
  [key: string]: unknown;
}

export interface WorkerAuthBoundaryContext {
  workspaceId?: string;
  userId?: string;
  authSharedSecret?: string;
}

export interface WorkerAuthIdentity {
  workspaceId: string;
  userId?: string;
}

export type WorkerAuthBoundaryResult =
  | { ok: true; identity: WorkerAuthIdentity }
  | { ok: false; status: 400 | 401; errors: string[] };

export interface WorkerAuthVerifierInput<Env extends WorkerAuthBoundaryEnv = WorkerAuthBoundaryEnv> {
  request: Request;
  env: Env;
  context?: WorkerAuthBoundaryContext;
}

export type WorkerAuthVerifier<Env extends WorkerAuthBoundaryEnv = WorkerAuthBoundaryEnv> = (
  input: WorkerAuthVerifierInput<Env>,
) => WorkerAuthBoundaryResult | Promise<WorkerAuthBoundaryResult>;

export function normalizeWorkerAuthBoundary(input: {
  request: Request;
  env?: WorkerAuthBoundaryEnv;
  context?: WorkerAuthBoundaryContext;
  verifiedIdentity?: WorkerAuthIdentity;
}): WorkerAuthBoundaryResult {
  const env = input.env ?? {};
  const context = input.context ?? {};
  const headers = input.request.headers;

  if (input.verifiedIdentity !== undefined) {
    return normalizeWorkerAuthIdentity(input.verifiedIdentity);
  }

  const configuredSharedSecret = readFirstString(
    context.authSharedSecret,
    env.WORKER_AUTH_SHARED_SECRET,
    env.AUTH_SHARED_SECRET,
  );
  if (configuredSharedSecret !== undefined) {
    const providedSharedSecret = readProvidedSharedSecret(headers);
    if (providedSharedSecret !== configuredSharedSecret) {
      return {
        ok: false,
        status: 401,
        errors: ['worker auth credentials are invalid'],
      };
    }
  }

  const workspaceId = readFirstString(
    firstHeaderValue(headers, 'x-workspace-id'),
    env.WORKSPACE_ID,
    context.workspaceId,
  );
  const userId = readFirstString(
    firstHeaderValue(headers, 'x-user-id'),
    env.USER_ID,
    context.userId,
  );

  return normalizeWorkerAuthIdentity({
    workspaceId: workspaceId ?? '',
    ...(userId === undefined ? {} : { userId }),
  });
}

function normalizeWorkerAuthIdentity(identity: WorkerAuthIdentity): WorkerAuthBoundaryResult {
  const errors: string[] = [];
  const workspaceId = readFirstString(identity.workspaceId);
  const normalizedWorkspaceId = isStableRuntimeId(workspaceId) ? workspaceId : undefined;
  if (normalizedWorkspaceId === undefined) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }

  const userId = readFirstString(identity.userId);
  const normalizedUserId = userId !== undefined && isStableRuntimeId(userId) ? userId : undefined;
  if (userId !== undefined && normalizedUserId === undefined) {
    errors.push('userId must be a stable non-sentinel runtime id when provided');
  }

  if (errors.length > 0 || normalizedWorkspaceId === undefined) {
    return { ok: false, status: 400, errors };
  }

  return {
    ok: true,
    identity: {
      workspaceId: normalizedWorkspaceId,
      ...(normalizedUserId === undefined ? {} : { userId: normalizedUserId }),
    },
  };
}

export function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}

function readProvidedSharedSecret(headers: Headers): string | undefined {
  const headerSecret = firstHeaderValue(headers, 'x-worker-auth-secret');
  if (headerSecret !== undefined) {
    return headerSecret;
  }

  const authorization = firstHeaderValue(headers, 'authorization');
  if (authorization === undefined) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match === null ? undefined : normalizeString(match[1]);
}

function firstHeaderValue(headers: Headers, name: string): string | undefined {
  return normalizeString(headers.get(name));
}

function readFirstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }
  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}
