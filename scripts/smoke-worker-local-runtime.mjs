#!/usr/bin/env node

import process from 'node:process';

import { classifySmokeError, SetupFailure } from './worker-local-smoke/failureClassification.mjs';
import { fetchWithTimeout, readSmokeHttpConfig, runSmoke } from './worker-local-smoke/httpSmokeRunner.mjs';
import {
  installChildCleanupHandlers,
  readWranglerBaseConfig,
  requireWrangler,
  startWrangler,
  stopChild,
  waitForChildExit,
  waitForWorkerReadiness,
} from './worker-local-smoke/wranglerDev.mjs';

async function main() {
  const serveOnly = process.argv.includes('--serve-only');
  const baseConfig = readWranglerBaseConfig();
  const wranglerVars = readLocalWranglerVars();
  const wrangler = baseConfig.externalUrl === undefined
    ? await requireWrangler()
    : undefined;

  if (serveOnly) {
    if (wrangler === undefined) {
      throw new SetupFailure('worker:local --serve-only cannot use WORKER_LOCAL_URL; unset WORKER_LOCAL_URL so Wrangler can be launched.');
    }
    const child = startWrangler({
      wrangler,
      config: baseConfig,
      stdio: 'inherit',
      authSecret: readServeOnlyAuthSecret(),
      vars: wranglerVars,
    });
    await waitForChildExit(child);
    return;
  }

  const config = readSmokeHttpConfig(baseConfig);
  let child;
  let removeSignalHandlers = () => {};
  if (config.externalUrl === undefined) {
    child = startWrangler({
      wrangler,
      config,
      stdio: 'pipe',
      authSecret: config.authSecret,
      vars: wranglerVars,
    });
    removeSignalHandlers = installChildCleanupHandlers(child);
    await waitForWorkerReadiness(config.baseUrl, child, fetchWithTimeout);
  }

  try {
    await runSmoke(config);
  } finally {
    removeSignalHandlers();
    if (child !== undefined) {
      await stopChild(child);
    }
  }
}

function readLocalWranglerVars() {
  return {
    ...readLocalTursoVars(),
    ...readSmokeIdentityVars(),
    ...readLocalModelVars(),
  };
}

function readSmokeIdentityVars() {
  return readOptionalEnvAliasMap({
    WORKER_SMOKE_NOTE_ID: ['WORKER_SMOKE_NOTE_ID'],
    WORKER_SMOKE_BLOCK_ID: ['WORKER_SMOKE_BLOCK_ID'],
  });
}

function readLocalTursoVars() {
  const databaseUrl = readFirstOptionalStringEnv(
    'WORKER_LOCAL_TURSO_DATABASE_URL',
    'LOCAL_TURSO_DATABASE_URL',
    'TURSO_DATABASE_URL',
    'LIBSQL_DATABASE_URL',
  );
  const authToken = readFirstOptionalStringEnv(
    'WORKER_LOCAL_TURSO_AUTH_TOKEN',
    'LOCAL_TURSO_AUTH_TOKEN',
    'TURSO_AUTH_TOKEN',
    'LIBSQL_AUTH_TOKEN',
  );
  return {
    ...(databaseUrl === undefined ? {} : { TURSO_DATABASE_URL: databaseUrl }),
    ...(authToken === undefined ? {} : { TURSO_AUTH_TOKEN: authToken }),
  };
}

function readLocalModelVars() {
  return readOptionalEnvAliasMap({
    WORKER_LOCAL_MODEL_PROTOCOL: ['WORKER_LOCAL_MODEL_PROTOCOL', 'LOCAL_MODEL_PROTOCOL', 'LOCAL_MODEL_PROVIDER'],
    WORKER_LOCAL_MODEL_BASE_URL: [
      'WORKER_LOCAL_MODEL_BASE_URL',
      'LOCAL_MODEL_BASE_URL',
      'WORKER_LOCAL_MODEL_ENDPOINT',
      'LOCAL_MODEL_ENDPOINT',
      'OLLAMA_HOST',
    ],
    WORKER_LOCAL_MODEL_NAME: ['WORKER_LOCAL_MODEL_NAME', 'LOCAL_MODEL_NAME', 'OLLAMA_MODEL'],
    WORKER_LOCAL_MODEL_API_KEY: ['WORKER_LOCAL_MODEL_API_KEY', 'LOCAL_MODEL_API_KEY'],
    WORKER_LOCAL_MODEL_TIMEOUT_MS: ['WORKER_LOCAL_MODEL_TIMEOUT_MS', 'LOCAL_MODEL_TIMEOUT_MS'],
    LOCAL_MODEL_PROVIDER: ['WORKER_LOCAL_MODEL_PROVIDER', 'LOCAL_MODEL_PROVIDER'],
    LOCAL_MODEL_ENDPOINT: [
      'WORKER_LOCAL_MODEL_ENDPOINT',
      'LOCAL_MODEL_ENDPOINT',
      'WORKER_LOCAL_MODEL_BASE_URL',
      'LOCAL_MODEL_BASE_URL',
    ],
    LOCAL_MODEL_BASE_URL: ['WORKER_LOCAL_MODEL_BASE_URL', 'LOCAL_MODEL_BASE_URL'],
    LOCAL_MODEL_NAME: ['WORKER_LOCAL_MODEL_NAME', 'LOCAL_MODEL_NAME'],
    LOCAL_MODEL_API_KEY: ['WORKER_LOCAL_MODEL_API_KEY', 'LOCAL_MODEL_API_KEY'],
    OLLAMA_HOST: ['WORKER_LOCAL_OLLAMA_HOST', 'OLLAMA_HOST'],
    OLLAMA_MODEL: ['WORKER_LOCAL_OLLAMA_MODEL', 'OLLAMA_MODEL'],
  });
}

function readServeOnlyAuthSecret() {
  return readOptionalStringEnv('WORKER_LOCAL_AUTH_SECRET')
    ?? readOptionalStringEnv('WORKER_SMOKE_AUTH_SECRET');
}

function readOptionalEnvAliasMap(aliasMap) {
  return Object.fromEntries(
    Object.entries(aliasMap)
      .map(([targetName, sourceNames]) => [targetName, readFirstOptionalStringEnv(...sourceNames)])
      .filter(([, value]) => value !== undefined),
  );
}

function readFirstOptionalStringEnv(...names) {
  for (const name of names) {
    const value = readOptionalStringEnv(name);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readOptionalStringEnv(name) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

main().catch((error) => {
  const { prefix, exitCode } = classifySmokeError(error);
  process.stderr.write(`${prefix}: ${error.message}\n`);
  process.exit(exitCode);
});
