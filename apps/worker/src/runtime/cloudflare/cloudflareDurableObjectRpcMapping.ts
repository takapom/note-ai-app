// Durable Object RPC response mapping helpers.
// Authority: docs/contracts/cloudflare-agents-turso.md

import type {
  NoteStructureRouteHandlerResult,
  StructureJobProcessorFlowResult,
} from '../composition/agentDelegates.ts';
import { rejectedRpcResult, type CloudflareAgentRpcResult } from './agentRpcResults.ts';
import type { WorkspaceBrainStructureJobProcessorCommandFailure } from './cloudflareWorkspaceBrainProcessorCommand.ts';

export function mapNoteStructureRouteHandlerResultToRpc(
  result: NoteStructureRouteHandlerResult,
): CloudflareAgentRpcResult {
  return {
    ok: result.ok,
    accepted: result.errors.length === 0,
    reason: result.triggerReason ?? result.route,
    scheduledJobIds: result.scheduledJobs.map((job) => job.id),
    scheduledJobs: result.scheduledJobs,
    providerCalls: result.providerCalls,
    operationRoutingCalls: result.operationRoutingCalls,
    auditWrites: result.auditWrites,
    noteSotMutations: [],
    errors: result.errors,
  };
}

export function localSmokeWorkspaceBrainRpcObservedResult(): CloudflareAgentRpcResult {
  return {
    ok: true,
    accepted: true,
    reason: 'local_smoke_workspace_brain_rpc_observed',
    scheduledJobIds: [],
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    noteSotMutations: [],
    errors: [],
  };
}

export function mapWorkspaceBrainProcessorResultToRpc(
  result: StructureJobProcessorFlowResult | WorkspaceBrainStructureJobProcessorCommandFailure,
): CloudflareAgentRpcResult {
  if (!('claim' in result)) {
    return rejectedRpcResult('invalid_workspace_brain_process_command', result.errors);
  }

  return {
    ok: result.ok,
    accepted: result.errors.length === 0,
    reason: result.reason,
    scheduledJobIds: result.claim.job === undefined ? [] : [result.claim.job.id],
    providerCalls: result.providerCalls,
    operationRoutingCalls: result.operationRoutingCalls,
    auditWrites: result.auditWrites,
    noteSotMutations: [],
    errors: result.errors,
  };
}
