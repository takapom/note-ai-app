import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { SetupFailure } from './failureClassification.mjs';
import {
  normalizeBaseUrl,
  readPositiveIntegerEnv,
  truncateBody,
  writePrefixedOutput,
} from './logging.mjs';

export const defaultPort = 8787;
export const defaultPersistTo = '.wrangler/state';
export const defaultWranglerLogPath = '.wrangler/logs';
export const defaultWranglerRegistryPath = '.wrangler/registry';
export const defaultWranglerXdgConfigHome = '.wrangler/xdg-config';
export const defaultWranglerXdgCacheHome = '.wrangler/xdg-cache';
export const defaultWranglerXdgStateHome = '.wrangler/xdg-state';

export function readWranglerBaseConfig() {
  const port = readPositiveIntegerEnv('WORKER_LOCAL_PORT', defaultPort);
  const persistTo = process.env.WORKER_LOCAL_PERSIST_TO ?? defaultPersistTo;
  const externalUrl = process.env.WORKER_LOCAL_URL;
  const baseUrl = externalUrl === undefined
    ? `http://127.0.0.1:${port}`
    : normalizeBaseUrl(externalUrl, 'WORKER_LOCAL_URL');

  return { port, persistTo, baseUrl, externalUrl };
}

export function readStartupTimeoutMs() {
  return readPositiveIntegerEnv('WORKER_LOCAL_STARTUP_TIMEOUT_MS', 30_000);
}

export async function requireWrangler() {
  const command = process.env.WRANGLER_BIN ?? 'wrangler';
  const result = await runCommand(command, ['--version'], 5_000);

  if (result.error?.code === 'ENOENT') {
    throw new SetupFailure(
      'wrangler is required for local Worker smoke. Install the Cloudflare Wrangler CLI or set WRANGLER_BIN to an installed executable.',
    );
  }
  if (result.exitCode !== 0) {
    throw new SetupFailure(
      `wrangler was found but could not run --version. ${formatCommandFailure(result)}`,
    );
  }

  return command;
}

export function startWrangler({ wrangler, config, stdio, authSecret, vars }) {
  const args = [
    'dev',
    '--port',
    String(config.port),
    '--persist-to',
    config.persistTo,
    '--var',
    `LOCAL_AGENT_SMOKE_ENABLED:${process.env.LOCAL_AGENT_SMOKE_ENABLED ?? '1'}`,
  ];
  if (authSecret !== undefined) {
    args.push('--var', `WORKER_AUTH_SHARED_SECRET:${authSecret}`);
  }
  for (const [name, value] of Object.entries(vars ?? {})) {
    args.push('--var', `${name}:${value}`);
  }
  const child = spawn(wrangler, args, {
    cwd: process.cwd(),
    env: createWranglerProcessEnv(),
    stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });

  if (stdio === 'pipe') {
    child.stdout?.on('data', (chunk) => writePrefixedOutput('wrangler', chunk));
    child.stderr?.on('data', (chunk) => writePrefixedOutput('wrangler', chunk));
  }

  child.once('error', (error) => {
    if (error.code === 'ENOENT') {
      process.stderr.write('setup failure: wrangler executable was not found\n');
    } else {
      process.stderr.write(`setup failure: wrangler failed to start: ${error.message}\n`);
    }
  });

  return child;
}

export async function waitForWorkerReadiness(baseUrl, child, fetchWithTimeout) {
  const startupTimeoutMs = readStartupTimeoutMs();
  const deadline = Date.now() + startupTimeoutMs;
  const readyUrl = new URL('/__lcwa_smoke_readiness__', baseUrl);

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new SetupFailure(`wrangler exited before the Worker became ready with status ${child.exitCode}`);
    }

    try {
      await fetchWithTimeout(readyUrl, { method: 'GET' });
      return;
    } catch {
      await delay(250);
    }
  }

  throw new SetupFailure(`local Worker did not respond at ${baseUrl} within ${startupTimeoutMs}ms`);
}

export async function waitForChildExit(child) {
  await new Promise((resolve) => {
    child.once('exit', resolve);
  });
}

export async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(3_000).then(() => false),
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

export function installChildCleanupHandlers(child) {
  const handleSignal = async (signal) => {
    await stopChild(child);
    process.kill(process.pid, signal);
  };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  return () => {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  };
}

async function runCommand(command, args, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: createWranglerProcessEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ exitCode: 124, stdout, stderr });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      resolve({ exitCode: undefined, stdout, stderr, error });
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export function createWranglerProcessEnv() {
  return {
    ...process.env,
    NO_COLOR: process.env.NO_COLOR ?? '1',
    WRANGLER_CI_DISABLE_CONFIG_WATCHING: process.env.WRANGLER_CI_DISABLE_CONFIG_WATCHING ?? 'true',
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? defaultWranglerLogPath,
    WRANGLER_REGISTRY_PATH: process.env.WRANGLER_REGISTRY_PATH ?? defaultWranglerRegistryPath,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? defaultWranglerXdgCacheHome,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? defaultWranglerXdgConfigHome,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? defaultWranglerXdgStateHome,
  };
}

function formatCommandFailure(result) {
  const detail = `${result.stderr}\n${result.stdout}`.trim();
  return detail === '' ? 'No output was produced.' : truncateBody(detail);
}
