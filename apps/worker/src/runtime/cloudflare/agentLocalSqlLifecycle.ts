// Lazy Cloudflare Durable Object Agent-local SQL executor lifecycle.
// Authority: docs/contracts/cloudflare-agents-turso.md

import { CloudflareDurableObjectAgentLocalSqlExecutor } from './cloudflareDurableObjectSqlAdapter.ts';

export type AgentLocalSqlLifecycleReadResult =
  | { ok: true; executor: CloudflareDurableObjectAgentLocalSqlExecutor }
  | { ok: false; errors: string[] };

export function readAgentLocalSqlLifecycle(input: {
  storage: unknown;
  cachedExecutor?: CloudflareDurableObjectAgentLocalSqlExecutor;
}): AgentLocalSqlLifecycleReadResult {
  if (input.cachedExecutor !== undefined) {
    return { ok: true, executor: input.cachedExecutor };
  }

  try {
    const executor = new CloudflareDurableObjectAgentLocalSqlExecutor(input.storage);
    return { ok: true, executor };
  } catch {
    return { ok: false, errors: ['Agent-local SQL storage is not configured'] };
  }
}
