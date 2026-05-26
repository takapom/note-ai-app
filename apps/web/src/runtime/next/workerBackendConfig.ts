export const NEXT_WORKER_API_PROXY_BASE_PATH = '/api/ann/';
export const NEXT_WORKER_API_BASE_URL_ENV = 'ANN_WORKER_API_BASE_URL';
export const NEXT_WORKER_AUTH_SHARED_SECRET_ENV = 'ANN_WORKER_AUTH_SHARED_SECRET';
export const NEXT_WORKER_DEV_API_BASE_URL = 'http://127.0.0.1:8787';

export interface NextWorkerBackendEnv {
  ANN_WORKER_API_BASE_URL?: string | undefined;
  ANN_WORKER_AUTH_SHARED_SECRET?: string | undefined;
  NODE_ENV?: string | undefined;
  [key: string]: string | undefined;
}

export type NextWorkerBackendConfigResult =
  | {
      ok: true;
      baseUrl: URL;
      authHeaders: Record<string, string>;
    }
  | {
      ok: false;
      errors: readonly string[];
    };

export function resolveNextWorkerBackendConfig(
  env: NextWorkerBackendEnv = process.env,
): NextWorkerBackendConfigResult {
  const errors: string[] = [];
  const baseUrlValue = readEnvString(env[NEXT_WORKER_API_BASE_URL_ENV])
    ?? (env.NODE_ENV === 'production' ? undefined : NEXT_WORKER_DEV_API_BASE_URL);

  if (baseUrlValue === undefined) {
    return {
      ok: false,
      errors: [`${NEXT_WORKER_API_BASE_URL_ENV} is required for the Next.js Worker proxy`],
    };
  }

  const baseUrl = parseWorkerBaseUrl(baseUrlValue, errors);
  if (baseUrl === undefined || errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    baseUrl,
    authHeaders: createNextWorkerAuthHeaders(env),
  };
}

export function createNextWorkerAuthHeaders(env: NextWorkerBackendEnv = process.env): Record<string, string> {
  const sharedSecret = readEnvString(env[NEXT_WORKER_AUTH_SHARED_SECRET_ENV]);
  return sharedSecret === undefined ? {} : { 'x-worker-auth-secret': sharedSecret };
}

export function isStableNextRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0
    && normalized === value
    && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)
    && !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}

function parseWorkerBaseUrl(value: string, errors: string[]): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${NEXT_WORKER_API_BASE_URL_ENV} must be a valid URL`);
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push(`${NEXT_WORKER_API_BASE_URL_ENV} must use http or https`);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    errors.push(`${NEXT_WORKER_API_BASE_URL_ENV} must not include credentials`);
  }

  parsed.hash = '';
  return parsed;
}

function readEnvString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}
