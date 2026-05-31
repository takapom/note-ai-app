// Local verification-only operation provider for Worker smoke runs.
// Authority: docs/contracts/backend-runtime.md

import type {
  OperationGenerationProviderPort,
  OperationGenerationProviderRegistry,
  OperationGenerationProviderRequest,
  OperationGenerationProviderResult,
} from '../../ai-operations/operationGenerationProviderFlow.ts';
import type { WorkerRuntimePortEnv } from '../composition/workerRuntimePortEnv.ts';
import {
  createLocalModelOperationMessages,
  localModelOperationResponseJsonSchema,
} from './localModelOperationPayload.ts';

export type LocalModelProtocol = 'ollama' | 'openai_compatible';

export interface LocalModelProviderConfig {
  protocol: LocalModelProtocol;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  apiKey?: string;
  fetchLike?: typeof fetch;
}

export type LocalModelProviderConfigResult =
  | { ok: true; config: LocalModelProviderConfig }
  | { ok: false; errors: string[] };

export function readLocalModelProviderConfigFromEnv(
  env: WorkerRuntimePortEnv,
): LocalModelProviderConfigResult | undefined {
  if (env.LOCAL_AGENT_SMOKE_ENABLED !== '1') {
    return undefined;
  }

  const rawProtocol = readFirstOptionalString(
    env.WORKER_LOCAL_MODEL_PROTOCOL,
    env.WORKER_LOCAL_MODEL_PROVIDER,
    env.LOCAL_MODEL_PROTOCOL,
    env.LOCAL_MODEL_PROVIDER,
  ) ?? 'ollama';
  const errors: string[] = [];
  if (!isLocalModelProtocol(rawProtocol)) {
    errors.push('WORKER_LOCAL_MODEL_PROTOCOL must be ollama or openai_compatible');
  }
  const protocol: LocalModelProtocol = isLocalModelProtocol(rawProtocol) ? rawProtocol : 'ollama';

  const model = readFirstOptionalString(
    env.WORKER_LOCAL_MODEL_NAME,
    env.LOCAL_MODEL_NAME,
    env.OLLAMA_MODEL,
  );
  if (model === undefined) {
    errors.push('WORKER_LOCAL_MODEL_NAME is required for local model smoke');
  }

  const timeoutMs = readPositiveInteger(
    readFirstOptionalString(env.WORKER_LOCAL_MODEL_TIMEOUT_MS, env.LOCAL_MODEL_TIMEOUT_MS),
    30_000,
  );
  if (timeoutMs === undefined) {
    errors.push('WORKER_LOCAL_MODEL_TIMEOUT_MS must be a positive integer when provided');
  }
  const apiKey = readFirstOptionalString(env.WORKER_LOCAL_MODEL_API_KEY, env.LOCAL_MODEL_API_KEY);

  if (errors.length > 0 || model === undefined || timeoutMs === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      protocol,
      model,
      baseUrl: normalizeBaseUrl(
        readFirstOptionalString(
          env.WORKER_LOCAL_MODEL_BASE_URL,
          env.WORKER_LOCAL_MODEL_ENDPOINT,
          env.LOCAL_MODEL_BASE_URL,
          env.LOCAL_MODEL_ENDPOINT,
          env.OLLAMA_HOST,
        ) ?? defaultBaseUrl(protocol),
        protocol,
      ),
      timeoutMs,
      ...(apiKey === undefined ? {} : { apiKey }),
    },
  };
}

export function createLocalModelOperationProviderRegistry(
  config: LocalModelProviderConfig,
): OperationGenerationProviderRegistry {
  const provider = new LocalModelOperationProvider(config);
  return {
    resolveProvider() {
      return provider;
    },
  };
}

export function hasLocalModelSmokeEnv(env: WorkerRuntimePortEnv): boolean {
  return env.LOCAL_AGENT_SMOKE_ENABLED === '1' &&
    (
      readFirstOptionalString(env.WORKER_LOCAL_MODEL_NAME, env.LOCAL_MODEL_NAME, env.OLLAMA_MODEL) !== undefined ||
      readFirstOptionalString(
        env.WORKER_LOCAL_MODEL_PROTOCOL,
        env.WORKER_LOCAL_MODEL_PROVIDER,
        env.LOCAL_MODEL_PROTOCOL,
        env.LOCAL_MODEL_PROVIDER,
      ) !== undefined ||
      readFirstOptionalString(
        env.WORKER_LOCAL_MODEL_BASE_URL,
        env.WORKER_LOCAL_MODEL_ENDPOINT,
        env.LOCAL_MODEL_BASE_URL,
        env.LOCAL_MODEL_ENDPOINT,
        env.OLLAMA_HOST,
      ) !== undefined
    );
}

export class LocalModelOperationProvider implements OperationGenerationProviderPort {
  readonly id: string;
  private readonly config: LocalModelProviderConfig;

  constructor(config: LocalModelProviderConfig) {
    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl, config.protocol),
    };
    this.id = `local_model_${config.protocol}`;
  }

  async generateOperations(request: OperationGenerationProviderRequest): Promise<OperationGenerationProviderResult> {
    const content = this.config.protocol === 'ollama'
      ? await this.callOllama(request)
      : await this.callOpenAiCompatible(request);
    const parsed = parseJsonObject(content, 'local model response content');
    const operations = parsed.operations;

    if (!Array.isArray(operations)) {
      throw new Error('local model response operations must be an array');
    }

    return {
      operations,
      providerMetadata: {
        provider: 'local_model',
        protocol: this.config.protocol,
        model: this.config.model,
      },
    };
  }

  private async callOllama(request: OperationGenerationProviderRequest): Promise<unknown> {
    const response = await this.postJson(joinUrlPath(this.config.baseUrl, '/api/chat'), {
      model: this.config.model,
      stream: false,
      messages: createLocalModelOperationMessages(request),
      format: localModelOperationResponseJsonSchema,
      options: {
        temperature: 0,
      },
    });
    return readNestedContent(response, ['message', 'content'], 'Ollama');
  }

  private async callOpenAiCompatible(request: OperationGenerationProviderRequest): Promise<unknown> {
    const response = await this.postJson(joinUrlPath(this.config.baseUrl, '/chat/completions'), {
      model: this.config.model,
      temperature: 0,
      messages: createLocalModelOperationMessages(request),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ai_native_note_operations',
          strict: true,
          schema: localModelOperationResponseJsonSchema,
        },
      },
    });
    return readNestedContent(response, ['choices', 0, 'message', 'content'], 'OpenAI-compatible');
  }

  private async postJson(url: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await (this.config.fetchLike ?? fetch)(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey === undefined ? {} : { authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error('local model request timed out');
      }
      throw new Error('local model provider request failed');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error('local model provider request failed');
    }

    try {
      return parseJsonObject(await response.text(), 'local model HTTP response');
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('local model provider response is invalid');
    }
  }
}

function readNestedContent(value: unknown, path: readonly (string | number)[], label: string): unknown {
  let cursor = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      cursor = Array.isArray(cursor) ? cursor[segment] : undefined;
    } else {
      cursor = isRecord(cursor) ? cursor[segment] : undefined;
    }
  }
  if (cursor === undefined || cursor === null) {
    throw new Error(`${label} response content is missing`);
  }
  return cursor;
}

function parseJsonObject(value: unknown, label: string): Record<string, unknown> {
  const parsed = typeof value === 'string' ? parseJson(value, label) : value;
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function joinUrlPath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), normalizedBase).toString();
}

function defaultBaseUrl(protocol: LocalModelProtocol): string {
  return protocol === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:11434/v1';
}

function normalizeBaseUrl(value: string, protocol: LocalModelProtocol): string {
  const withoutTrailingSlash = value.replace(/\/+$/, '');
  if (protocol === 'ollama') {
    return withoutTrailingSlash.replace(/\/api\/chat$/i, '');
  }
  return withoutTrailingSlash.replace(/\/chat\/completions$/i, '');
}

function readFirstOptionalString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    const normalized = readOptionalString(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown, fallback: number): number | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function isLocalModelProtocol(value: unknown): value is LocalModelProtocol {
  return value === 'ollama' || value === 'openai_compatible';
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
