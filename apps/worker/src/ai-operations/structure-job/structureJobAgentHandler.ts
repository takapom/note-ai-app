// StructureJob Agent handler: Context Assembly through AI Operations orchestration.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md

import type {
  ContextAssemblyLimits,
} from '../../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { StructureJobContract } from '../../../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import {
  runContextEnvelopeAssemblyFlow,
  type ContextAssemblyRuntimePorts,
  type ContextEnvelopeAssemblyFlowResult,
} from '../../context-assembly/contextAssemblyRuntimeFlow.ts';
import type { OperationGenerationProviderRegistry } from '../operationGenerationProviderFlow.ts';
import {
  runStructureJobOperationOrchestrationFlow,
  type StructureJobOperationOrchestrationFlowInput,
  type StructureJobOperationOrchestrationFlowResult,
} from './structureJobOperationOrchestrationFlow.ts';

export interface StructureJobAgentHandlerInput {
  userId: string;
  structureJob: StructureJobContract;
  now: number;
  contextAssemblyPorts: ContextAssemblyRuntimePorts;
  providerRegistry: OperationGenerationProviderRegistry;
  operationFlow: StructureJobOperationOrchestrationFlowInput['operationFlow'];
  limits?: ContextAssemblyLimits;
}

export interface StructureJobAgentHandlerResult {
  ok: boolean;
  contextAssembly: ContextEnvelopeAssemblyFlowResult;
  orchestration?: StructureJobOperationOrchestrationFlowResult;
  providerCalls: Array<{ providerId: string; structureJobId: string }>;
  operationRoutingCalls: Array<{ structureJobId: string }>;
  auditWrites: Array<{ structureJobId: string; savedCount: number }>;
  directApplyResults: [];
  noteSotMutations: [];
  errors: string[];
}

export async function runStructureJobAgentHandler(
  input: StructureJobAgentHandlerInput,
): Promise<StructureJobAgentHandlerResult> {
  const contextAssembly = await runContextEnvelopeAssemblyFlow({
    workspaceId: input.structureJob.workspaceId,
    userId: input.userId,
    noteId: input.structureJob.noteId,
    structureJobId: input.structureJob.id,
    targetScope: input.structureJob.targetScope,
    ...(input.structureJob.sectionId === undefined ? {} : { targetId: input.structureJob.sectionId }),
    now: input.now,
    ports: input.contextAssemblyPorts,
    ...(input.limits === undefined ? {} : { limits: input.limits }),
  });

  if (!contextAssembly.validation.valid || contextAssembly.envelope === undefined || contextAssembly.event === undefined) {
    return {
      ok: false,
      contextAssembly,
      providerCalls: [],
      operationRoutingCalls: [],
      auditWrites: [],
      directApplyResults: [],
      noteSotMutations: [],
      errors: contextAssembly.errors,
    };
  }

  const orchestration = await runStructureJobOperationOrchestrationFlow({
    structureJob: input.structureJob,
    contextEnvelope: contextAssembly.envelope,
    contextEnvelopeBuilt: contextAssembly.event,
    providerRegistry: input.providerRegistry,
    operationFlow: input.operationFlow,
    now: input.now,
  });
  const routingFlow = orchestration.structureJobOperationFlow?.routingFlow;

  return {
    ok: orchestration.ok,
    contextAssembly,
    orchestration,
    providerCalls: orchestration.generationFlow.providerCalls,
    operationRoutingCalls: orchestration.structureJobOperationFlow === undefined
      ? []
      : [{ structureJobId: input.structureJob.id }],
    auditWrites: routingFlow?.auditPersistence.attempted === true
      ? [{
          structureJobId: input.structureJob.id,
          savedCount: routingFlow.auditPersistence.savedCount,
        }]
      : [],
    directApplyResults: [],
    noteSotMutations: [],
    errors: orchestration.errors,
  };
}
