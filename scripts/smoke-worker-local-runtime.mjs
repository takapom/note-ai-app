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
    const child = startWrangler({ wrangler, config: baseConfig, stdio: 'inherit' });
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

main().catch((error) => {
  const { prefix, exitCode } = classifySmokeError(error);
  process.stderr.write(`${prefix}: ${error.message}\n`);
  process.exit(exitCode);
});
