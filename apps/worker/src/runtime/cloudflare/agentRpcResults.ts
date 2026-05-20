// Stable Cloudflare Agent RPC / schema failure result helpers.
// Authority: docs/contracts/cloudflare-agents-turso.md

import type { DurableObjectAgentLocalSchemaCommand, DurableObjectAgentLocalSchemaResult } from './durableObjectAgentLocalSchema.ts';

export interface CloudflareAgentRpcResult {
  ok: boolean;
  accepted: boolean;
  reason: string;
  scheduledJobIds: readonly string[];
  scheduledJobs?: readonly { id: string }[];
  providerCalls: readonly { providerId: string; structureJobId: string }[];
  operationRoutingCalls: readonly { structureJobId: string }[];
  auditWrites: readonly { structureJobId: string; savedCount: number }[];
  noteSotMutations: [];
  errors: string[];
}

export function rejectedRpcResult(reason: string, errors: string[]): CloudflareAgentRpcResult {
  return {
    ok: false,
    accepted: false,
    reason,
    scheduledJobIds: [],
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    noteSotMutations: [],
    errors,
  };
}

export function rejectedSchemaCommandResult(
  command: unknown,
  errors: string[],
): DurableObjectAgentLocalSchemaResult {
  return {
    ok: false,
    action: isResetSchemaCommand(command) ? 'reset' : 'initialize',
    initializedTables: [],
    droppedTables: [],
    errors,
  };
}

function isResetSchemaCommand(command: unknown): boolean {
  return typeof command === 'object'
    && command !== null
    && !Array.isArray(command)
    && (command as { action?: unknown }).action === 'reset';
}
