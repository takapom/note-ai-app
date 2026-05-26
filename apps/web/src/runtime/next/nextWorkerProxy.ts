import { resolveNextWorkerBackendConfig } from './workerBackendConfig.ts';

const allowedMethods = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const proxyRoutePrefix = '/api/ann';

export async function handleNextWorkerProxyRequest(
  request: Request,
  env = process.env,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!allowedMethods.has(method)) {
    return jsonProxyError(405, ['method is not supported by the Worker proxy'], {
      Allow: 'GET, POST, PATCH, DELETE',
    });
  }

  const backendConfig = resolveNextWorkerBackendConfig(env);
  if (!backendConfig.ok) {
    return jsonProxyError(500, backendConfig.errors);
  }

  const workerUrl = resolveWorkerUrl(request.url, backendConfig.baseUrl);
  if (!workerUrl.ok) {
    return jsonProxyError(400, workerUrl.errors);
  }

  try {
    const init: RequestInit = {
      method,
      headers: createForwardHeaders(request, backendConfig.authHeaders),
    };

    if (method !== 'GET') {
      const body = await readRequestBody(request);
      if (body !== undefined) {
        init.body = body;
      }
    }

    const upstreamResponse = await fetch(workerUrl.url.toString(), init);
    return toProxyResponse(upstreamResponse);
  } catch (error) {
    return jsonProxyError(502, [
      `Worker request failed: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

function resolveWorkerUrl(
  requestUrl: string | undefined,
  workerBaseUrl: URL,
): { ok: true; url: URL } | { ok: false; errors: readonly string[] } {
  if (requestUrl === undefined) {
    return { ok: false, errors: ['request url is required'] };
  }

  const parsedRequestUrl = new URL(requestUrl, 'http://next.local');
  if (
    parsedRequestUrl.pathname !== proxyRoutePrefix
    && !parsedRequestUrl.pathname.startsWith(`${proxyRoutePrefix}/`)
  ) {
    return { ok: false, errors: ['request path is outside the Worker proxy route'] };
  }

  const forwardedPath = parsedRequestUrl.pathname.slice(proxyRoutePrefix.length) || '/';
  const workerUrl = new URL(workerBaseUrl.toString());
  const workerBasePath = workerUrl.pathname === '/' ? '' : workerUrl.pathname.replace(/\/+$/, '');
  workerUrl.pathname = `${workerBasePath}${forwardedPath}`;
  workerUrl.search = parsedRequestUrl.search;
  workerUrl.hash = '';

  return { ok: true, url: workerUrl };
}

function createForwardHeaders(
  request: Request,
  authHeaders: Record<string, string>,
): Headers {
  const headers = new Headers();
  forwardHeader(request, headers, 'accept');
  forwardHeader(request, headers, 'content-type');
  forwardHeader(request, headers, 'x-workspace-id');
  forwardHeader(request, headers, 'x-user-id');

  for (const [name, value] of Object.entries(authHeaders)) {
    headers.set(name, value);
  }

  return headers;
}

function forwardHeader(request: Request, headers: Headers, name: string): void {
  const value = firstHeaderValue(request.headers.get(name));
  if (value !== undefined) {
    headers.set(name, value);
  }
}

async function readRequestBody(request: Request): Promise<string | undefined> {
  const body = await request.text();
  return body.length === 0 ? undefined : body;
}

async function toProxyResponse(
  upstreamResponse: Response,
): Promise<Response> {
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');
  if (contentType !== null) {
    headers.set('content-type', contentType);
  }

  const cacheControl = upstreamResponse.headers.get('cache-control');
  if (cacheControl !== null) {
    headers.set('cache-control', cacheControl);
  }

  const body = await upstreamResponse.text();
  return new Response(body, {
    status: upstreamResponse.status,
    headers,
  });
}

function jsonProxyError(status: number, errors: readonly string[], headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ ok: false, errors }), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(headers ?? {}),
    },
  });
}

function firstHeaderValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (normalized === undefined) {
    return undefined;
  }
  return normalized.length === 0 ? undefined : normalized;
}
