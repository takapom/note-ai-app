import process from 'node:process';

import { SetupFailure } from './failureClassification.mjs';

const defaultMaxBodyLogChars = 1_200;

export function readMaxBodyLogChars() {
  return readPositiveIntegerEnv('WORKER_LOCAL_SMOKE_BODY_LOG_CHARS', defaultMaxBodyLogChars);
}

export function truncateBody(value, maxChars = readMaxBodyLogChars()) {
  return value.length <= maxChars
    ? value
    : `${value.slice(0, maxChars)}...<truncated>`;
}

export function formatCurl(smokeCase, config) {
  const url = new URL(smokeCase.path, config.baseUrl);
  const parts = [
    'curl',
    '-i',
    '-X',
    shellQuote(smokeCase.method),
    shellQuote(url.toString()),
    '-H',
    shellQuote('x-workspace-id: ${WORKER_SMOKE_WORKSPACE_ID}'),
    '-H',
    shellQuote('x-user-id: ${WORKER_SMOKE_USER_ID}'),
    '-H',
    shellQuote(
      smokeCase.authSecret === undefined
        ? 'x-worker-auth-secret: ${WORKER_SMOKE_AUTH_SECRET}'
        : 'x-worker-auth-secret: ${WORKER_SMOKE_AUTH_SECRET}:invalid',
    ),
  ];
  if (smokeCase.body !== undefined) {
    parts.push('-H', shellQuote('content-type: application/json'));
    parts.push('--data', shellQuote(JSON.stringify(smokeCase.body)));
  }
  return parts.join(' ');
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function writePrefixedOutput(prefix, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.length > 0) {
      process.stdout.write(`[${prefix}] ${line}\n`);
    }
  }
}

export function readRequiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new SetupFailure(`${name} must be supplied by the local operator environment for worker:local:smoke`);
  }
  return value;
}

export function readOptionalPathEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  if (!value.startsWith('/')) {
    throw new SetupFailure(`${name} must be an absolute HTTP path starting with /`);
  }
  return value;
}

export function readPositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SetupFailure(`${name} must be a positive integer`);
  }
  return value;
}

export function normalizeBaseUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SetupFailure(`${name} must be a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SetupFailure(`${name} must use http or https`);
  }
  return url.toString();
}
