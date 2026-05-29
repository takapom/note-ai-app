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
      vars: readServeOnlyTursoVars(),
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

function readServeOnlyTursoVars() {
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

function readServeOnlyAuthSecret() {
  return readOptionalStringEnv('WORKER_LOCAL_AUTH_SECRET')
    ?? readOptionalStringEnv('WORKER_SMOKE_AUTH_SECRET');
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
