// Worker orchestration for provider generation success -> completed structure job routing.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/api-events.md

import {
  runOperationGenerationProviderFlow,
  type OperationGenerationProviderFlowInput,
  type OperationGenerationProviderFlowResult,
} from '../operationGenerationProviderFlow.ts';
import {
  runStructureJobOperationFlow,
  type StructureJobOperationFlowInput,
  type StructureJobOperationFlowResult,
} from './structureJobOperationFlow.ts';

export interface StructureJobOperationOrchestrationFlowInput extends OperationGenerationProviderFlowInput {
  operationFlow: Omit<StructureJobOperationFlowInput, 'structureJob' | 'aiResponse'>;
}

export interface StructureJobOperationOrchestrationFlowResult {
  attempted: boolean;
  ok: boolean;
  reason: OperationGenerationProviderFlowResult['reason'] | 'routed';
  generationFlow: OperationGenerationProviderFlowResult;
  structureJobOperationFlow?: StructureJobOperationFlowResult;
  errors: string[];
  directApplyResults: [];
  noteSotMutations: [];
}

export async function runStructureJobOperationOrchestrationFlow(
  input: StructureJobOperationOrchestrationFlowInput,
): Promise<StructureJobOperationOrchestrationFlowResult> {
  const generationFlow = await runOperationGenerationProviderFlow(input);

  if (!generationFlow.ok || generationFlow.completedStructureJobResponse === undefined) {
    return {
      attempted: false,
      ok: false,
      reason: generationFlow.reason,
      generationFlow,
      errors: generationFlow.errors,
      directApplyResults: [],
      noteSotMutations: [],
    };
  }

  const completedResponse = generationFlow.completedStructureJobResponse;
  const structureJobOperationFlow = await runStructureJobOperationFlow({
    ...input.operationFlow,
    structureJob: completedResponse.structureJob,
    aiResponse: completedResponse.aiResponse,
  });

  return {
    attempted: structureJobOperationFlow.attempted,
    ok: structureJobOperationFlow.ok,
    reason: 'routed',
    generationFlow,
    structureJobOperationFlow,
    errors: structureJobOperationFlow.errors,
    directApplyResults: [],
    noteSotMutations: [],
  };
}
