// Worker processor flow for StructureJob queue claim -> Agent handler -> terminal queue transition.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md, docs/contracts/ai-structuring-lifecycle.md

import type { ContextAssemblyLimits } from '../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import {
  runStructureJobAgentHandler,
  type StructureJobAgentHandlerInput,
  type StructureJobAgentHandlerResult,
} from './noteStructureRuntimeHandlers.ts';
import type {
  StructureJobClaimResult,
  StructureJobCompletedResult,
  StructureJobFailedResult,
  StructureJobWorkQueuePort,
} from './structureJobWorkQueuePort.ts';
import { validateStructureJobWorkQueueRecord } from './structureJobWorkQueuePort.ts';
import type {
  StructureJobOperationOrchestrationFlowResult,
} from './structureJobOperationOrchestrationFlow.ts';

export type StructureJobProcessorFlowReason =
  | 'claim_failed'
  | 'invalid_claimed_job'
  | 'no_queued_job'
  | 'agent_failed'
  | 'completed'
  | 'completion_failed'
  | 'failure_mark_failed';

export interface StructureJobProcessorFlowInput {
  workspaceId: string;
  userId: string;
  now: number;
  workQueue: StructureJobWorkQueuePort;
  contextAssemblyPorts: StructureJobAgentHandlerInput['contextAssemblyPorts'];
  providerRegistry: StructureJobAgentHandlerInput['providerRegistry'];
  operationFlow: StructureJobAgentHandlerInput['operationFlow'];
  limits?: ContextAssemblyLimits;
}

export interface StructureJobProcessorFlowResult {
  ok: boolean;
  attempted: boolean;
  reason: StructureJobProcessorFlowReason;
  claim: StructureJobClaimResult;
  agent?: StructureJobAgentHandlerResult;
  completion?: StructureJobCompletedResult;
  failure?: StructureJobFailedResult;
  providerCalls: Array<{ providerId: string; structureJobId: string }>;
  operationRoutingCalls: Array<{ structureJobId: string }>;
  auditWrites: Array<{ structureJobId: string; savedCount: number }>;
  directApplyResults: [];
  noteSotMutations: [];
  errors: string[];
}

export async function runStructureJobProcessorFlow(
  input: StructureJobProcessorFlowInput,
): Promise<StructureJobProcessorFlowResult> {
  const claim = await input.workQueue.claimNextQueuedJob({
    workspaceId: input.workspaceId,
    claimedAt: input.now,
  });

  if (!claim.ok) {
    return emptyProcessorResult({
      ok: false,
      attempted: false,
      reason: 'claim_failed',
      claim,
      errors: claim.errors,
    });
  }

  if (claim.job === undefined) {
    return emptyProcessorResult({
      ok: true,
      attempted: false,
      reason: 'no_queued_job',
      claim,
      errors: [],
    });
  }

  const claimedJobErrors = validateClaimedRunningJob(claim.job);
  if (claimedJobErrors.length > 0) {
    return emptyProcessorResult({
      ok: false,
      attempted: false,
      reason: 'invalid_claimed_job',
      claim,
      errors: claimedJobErrors,
    });
  }

  const agent = await runStructureJobAgentHandler({
    userId: input.userId,
    structureJob: claim.job,
    now: input.now,
    contextAssemblyPorts: input.contextAssemblyPorts,
    providerRegistry: input.providerRegistry,
    operationFlow: input.operationFlow,
    ...(input.limits === undefined ? {} : { limits: input.limits }),
  });

  if (!isCompletedAgentResult(agent)) {
    const failure = await input.workQueue.markJobFailed({
      structureJobId: claim.job.id,
      failedAt: input.now,
      failureMessage: toFailureMessage(agent.errors),
    });

    return processorResult({
      ok: false,
      attempted: true,
      reason: failure.ok ? 'agent_failed' : 'failure_mark_failed',
      claim,
      agent,
      failure,
      errors: failure.ok ? agent.errors : [...agent.errors, ...failure.errors],
    });
  }

  const completedAt = agent.orchestration.generationFlow.completedStructureJobResponse.structureJob.completedAt;
  const completion = await input.workQueue.markJobCompleted({
    structureJobId: claim.job.id,
    completedAt,
  });

  return processorResult({
    ok: completion.ok,
    attempted: true,
    reason: completion.ok ? 'completed' : 'completion_failed',
    claim,
    agent,
    completion,
    errors: completion.ok ? [] : completion.errors,
  });
}

function validateClaimedRunningJob(job: StructureJobClaimResult['job']): string[] {
  const errors = validateStructureJobWorkQueueRecord(job);
  if (job?.status !== 'running') {
    errors.push('claimed structure job must be running');
  }
  if (typeof job?.startedAt !== 'number' || !Number.isFinite(job.startedAt)) {
    errors.push('claimed structure job must include finite startedAt');
  }

  return errors;
}

function isCompletedAgentResult(
  agent: StructureJobAgentHandlerResult,
): agent is StructureJobAgentHandlerResult & {
  orchestration: CompletedStructureJobOrchestrationResult;
} {
  return (
    agent.ok &&
    agent.orchestration !== undefined &&
    agent.orchestration.generationFlow.completedStructureJobResponse !== undefined
  );
}

function toFailureMessage(errors: readonly string[]): string {
  const message = errors.map((error) => error.trim()).filter(Boolean).join('; ');
  return message.length > 0 ? message : 'structure job processing failed';
}

function emptyProcessorResult(
  partial: Pick<StructureJobProcessorFlowResult, 'ok' | 'attempted' | 'reason' | 'claim' | 'errors'>,
): StructureJobProcessorFlowResult {
  return {
    ...partial,
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    directApplyResults: [],
    noteSotMutations: [],
  };
}

function processorResult(
  partial: Pick<StructureJobProcessorFlowResult, 'ok' | 'attempted' | 'reason' | 'claim' | 'errors'> &
    Pick<Partial<StructureJobProcessorFlowResult>, 'completion' | 'failure'> & {
      agent: StructureJobAgentHandlerResult;
    },
): StructureJobProcessorFlowResult {
  return {
    ...partial,
    providerCalls: partial.agent.providerCalls,
    operationRoutingCalls: partial.agent.operationRoutingCalls,
    auditWrites: partial.agent.auditWrites,
    directApplyResults: [],
    noteSotMutations: [],
  };
}

type CompletedStructureJobOrchestrationResult = StructureJobOperationOrchestrationFlowResult & {
  generationFlow: StructureJobOperationOrchestrationFlowResult['generationFlow'] & {
    completedStructureJobResponse: NonNullable<
      StructureJobOperationOrchestrationFlowResult['generationFlow']['completedStructureJobResponse']
    >;
  };
};
