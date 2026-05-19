import type {
  NoteSurfaceWorkerRequestDescriptor,
  NoteSurfaceWorkerRequestMethod,
} from './noteSurfaceApiIntents.ts';

export interface NoteSurfaceApiFetchRequestInit {
  method: NoteSurfaceWorkerRequestMethod;
  headers: Record<string, string>;
  body?: string;
}

export interface NoteSurfaceApiFetchLikeResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

export type NoteSurfaceApiFetchLike = (
  url: string,
  init: NoteSurfaceApiFetchRequestInit,
) => Promise<NoteSurfaceApiFetchLikeResponse>;

export interface NoteSurfaceApiTransportOptions {
  baseUrl: string | URL;
  fetchLike: NoteSurfaceApiFetchLike;
}

export interface NoteSurfaceApiTransport {
  send(request: NoteSurfaceWorkerRequestDescriptor): Promise<NoteSurfaceApiTransportResult>;
}

export interface NoteSurfaceApiTransportResult {
  ok: boolean;
  status: number;
  body?: unknown;
  errors: readonly string[];
}

const supportedMethods = new Set<NoteSurfaceWorkerRequestMethod>(['GET', 'POST', 'PATCH']);

export function createNoteSurfaceApiTransport(options: NoteSurfaceApiTransportOptions): NoteSurfaceApiTransport {
  return {
    send(request: NoteSurfaceWorkerRequestDescriptor): Promise<NoteSurfaceApiTransportResult> {
      return sendNoteSurfaceApiRequest(request, options);
    },
  };
}

export async function sendNoteSurfaceApiRequest(
  request: NoteSurfaceWorkerRequestDescriptor,
  options: NoteSurfaceApiTransportOptions,
): Promise<NoteSurfaceApiTransportResult> {
  const validation = validateTransportInput(request, options);
  if (!validation.ok) {
    return {
      ok: false,
      status: 0,
      errors: validation.errors,
    };
  }

  const init = createFetchInit(request);

  try {
    const response = await options.fetchLike(validation.url, init);
    const body = await parseResponseBody(response);
    const errors = extractErrors(body);

    return {
      ok: response.ok,
      status: response.status,
      ...(body === undefined ? {} : { body }),
      errors: response.ok || errors.length > 0 ? errors : [`request failed with status ${response.status}`],
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      errors: [`request failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function createFetchInit(request: NoteSurfaceWorkerRequestDescriptor): NoteSurfaceApiFetchRequestInit {
  const init: NoteSurfaceApiFetchRequestInit = {
    method: request.method,
    headers: { ...request.headers },
  };

  if (request.method !== 'GET' && request.body !== undefined) {
    init.body = serializeRequestBody(request.body);
  }

  return init;
}

function serializeRequestBody(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object') {
    return JSON.stringify(body);
  }

  return String(body);
}

async function parseResponseBody(response: NoteSurfaceApiFetchLikeResponse): Promise<unknown> {
  if (typeof response.json === 'function') {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  if (typeof response.text !== 'function') {
    return undefined;
  }

  const text = await response.text();
  if (text.trim() === '') {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrors(body: unknown): string[] {
  if (body === null || typeof body !== 'object') {
    return [];
  }

  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((error): error is string => typeof error === 'string');
}

function validateTransportInput(
  request: NoteSurfaceWorkerRequestDescriptor,
  options: NoteSurfaceApiTransportOptions,
): { ok: true; url: string } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const baseUrl = parseBaseUrl(options.baseUrl, errors);

  if (typeof options.fetchLike !== 'function') {
    errors.push('fetchLike must be a function');
  }

  validateMethod(request.method, errors);
  validateHeaders(request.headers, errors);
  validatePath(request.path, errors);

  if (errors.length > 0 || baseUrl === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, url: joinBaseUrlAndPath(baseUrl, request.path) };
}

function parseBaseUrl(baseUrl: string | URL, errors: string[]): URL | undefined {
  let parsed: URL;
  try {
    parsed = baseUrl instanceof URL ? new URL(baseUrl.toString()) : new URL(baseUrl);
  } catch {
    errors.push('baseUrl must be a valid URL');
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push('baseUrl must use http or https');
  }

  if (parsed.username !== '' || parsed.password !== '') {
    errors.push('baseUrl must not include credentials');
  }

  return parsed;
}

function validateMethod(method: string, errors: string[]): void {
  if (!supportedMethods.has(method as NoteSurfaceWorkerRequestMethod)) {
    errors.push('method must be GET, POST, or PATCH');
  }
}

function validateHeaders(headers: Record<string, string>, errors: string[]): void {
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    errors.push('headers must be a string record');
    return;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (name.trim() === '' || /[\r\n:]/.test(name)) {
      errors.push('header names must be non-empty field names');
    }

    if (typeof value !== 'string' || /[\r\n]/.test(value)) {
      errors.push('header values must be strings without line breaks');
    }
  }
}

function validatePath(path: string, errors: string[]): void {
  if (typeof path !== 'string' || path.trim() === '') {
    errors.push('path is required');
    return;
  }

  if (path !== path.trim()) {
    errors.push('path must not include leading or trailing whitespace');
  }

  if (!path.startsWith('/')) {
    errors.push('path must start with /');
  }

  if (path.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) {
    errors.push('path must be relative to the API origin');
  }

  if (/[?#\\]/.test(path)) {
    errors.push('path must not include query, fragment, or backslash');
  }
}

function joinBaseUrlAndPath(baseUrl: URL, path: string): string {
  const joined = new URL(baseUrl.toString());
  const basePath = joined.pathname === '/' ? '' : joined.pathname.replace(/\/+$/, '');
  joined.pathname = `${basePath}${path}`;
  joined.search = '';
  joined.hash = '';
  return joined.toString();
}
