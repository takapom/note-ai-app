// Worker orchestration for ContextEnvelopeBuilt -> AI operation generation provider.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/api-events.md, docs/contracts/vendor-lock-avoidance.md

import {
  defaultContextAssemblyLimits,
  validateContextEnvelope,
  type ContextAssemblyLimits,
  type ContextEnvelopeContract,
  type ContextEnvelopeValidationResult,
} from '../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import type { StructureJobContract } from '../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import type { ContextEnvelopeBuiltEvent } from './contextAssemblyRuntimeFlow.ts';

export interface OperationGenerationProviderRequest {
  structureJob: StructureJobContract;
  contextEnvelope: ContextEnvelopeContract;
  contextEnvelopeBuilt: ContextEnvelopeBuiltEvent;
  now: number;
}

export interface OperationGenerationProviderResult {
  operations: unknown;
  providerMetadata?: Record<string, unknown>;
}

export interface OperationGenerationProviderPort {
  readonly id: string;
  generateOperations(request: OperationGenerationProviderRequest): Promise<OperationGenerationProviderResult>;
}

export interface OperationGenerationProviderRegistry {
  resolveProvider(input: {
    workspaceId: string;
    noteId: string;
    structureJobId: string;
    targetScope: StructureJobContract['targetScope'];
  }): OperationGenerationProviderPort | undefined | Promise<OperationGenerationProviderPort | undefined>;
}

export interface OperationsGeneratedEvent {
  type: 'OperationsGenerated';
  workspaceId: string;
  userId: string;
  noteId: string;
  structureJobId: string;
  providerId: string;
  operationCount: number;
  generatedAt: number;
}

export interface CompletedStructureJobResponse {
  structureJob: StructureJobContract & {
    status: 'completed';
    completedAt: number;
  };
  aiResponse: unknown;
  providerId: string;
  providerMetadata?: Record<string, unknown>;
}

export interface OperationGenerationProviderFlowInput {
  structureJob: StructureJobContract;
  contextEnvelope: ContextEnvelopeContract | Record<string, unknown>;
  contextEnvelopeBuilt: ContextEnvelopeBuiltEvent;
  providerRegistry: OperationGenerationProviderRegistry;
  limits?: ContextAssemblyLimits;
  now: number;
}

export interface OperationGenerationProviderFlowResult {
  attempted: boolean;
  ok: boolean;
  reason: 'invalid_runtime_input' | 'invalid_context_envelope' | 'provider_unavailable' | 'provider_failed' | 'operations_generated';
  validation: ContextEnvelopeValidationResult;
  completedStructureJobResponse?: CompletedStructureJobResponse;
  event?: OperationsGeneratedEvent;
  providerCalls: Array<{ providerId: string; structureJobId: string }>;
  operationRoutingCalls: [];
  auditWrites: [];
  directApplyResults: [];
  noteSotMutations: [];
  errors: string[];
}

export async function runOperationGenerationProviderFlow(
  input: OperationGenerationProviderFlowInput,
): Promise<OperationGenerationProviderFlowResult> {
  const limits = input.limits ?? defaultContextAssemblyLimits;
  const runtimeErrors = validateRuntimeInput(input);

  if (runtimeErrors.length > 0) {
    return flowResult({
      attempted: false,
      ok: false,
      reason: 'invalid_runtime_input',
      validation: { valid: false, errors: runtimeErrors },
      errors: runtimeErrors,
    });
  }

  const validation = validateContextEnvelope(input.contextEnvelope, limits);
  if (!validation.valid) {
    return flowResult({
      attempted: false,
      ok: false,
      reason: 'invalid_context_envelope',
      validation,
      errors: validation.errors,
    });
  }

  const provider = await input.providerRegistry.resolveProvider({
    workspaceId: input.structureJob.workspaceId,
    noteId: input.structureJob.noteId,
    structureJobId: input.structureJob.id,
    targetScope: input.structureJob.targetScope,
  });

  if (!provider) {
    return flowResult({
      attempted: false,
      ok: false,
      reason: 'provider_unavailable',
      validation,
      errors: ['operation generation provider is unavailable'],
    });
  }

  try {
    const generated = await provider.generateOperations({
      structureJob: input.structureJob,
      contextEnvelope: input.contextEnvelope as ContextEnvelopeContract,
      contextEnvelopeBuilt: input.contextEnvelopeBuilt,
      now: input.now,
    });
    const completedStructureJob = completeStructureJob(input.structureJob, input.now);

    return flowResult({
      attempted: true,
      ok: true,
      reason: 'operations_generated',
      validation,
      completedStructureJobResponse: {
        structureJob: completedStructureJob,
        aiResponse: generated.operations,
        providerId: provider.id,
        ...(generated.providerMetadata === undefined ? {} : { providerMetadata: generated.providerMetadata }),
      },
      event: {
        type: 'OperationsGenerated',
        workspaceId: input.structureJob.workspaceId,
        userId: input.contextEnvelopeBuilt.userId,
        noteId: input.structureJob.noteId,
        structureJobId: input.structureJob.id,
        providerId: provider.id,
        operationCount: Array.isArray(generated.operations) ? generated.operations.length : 0,
        generatedAt: input.now,
      },
      providerCalls: [{ providerId: provider.id, structureJobId: input.structureJob.id }],
      errors: [],
    });
  } catch (error) {
    return flowResult({
      attempted: true,
      ok: false,
      reason: 'provider_failed',
      validation,
      providerCalls: [{ providerId: provider.id, structureJobId: input.structureJob.id }],
      errors: [toProviderErrorMessage(error)],
    });
  }
}

export function createStaticOperationGenerationProviderRegistry(
  provider: OperationGenerationProviderPort,
): OperationGenerationProviderRegistry {
  return {
    resolveProvider() {
      return provider;
    },
  };
}

function completeStructureJob(
  structureJob: StructureJobContract,
  completedAt: number,
): StructureJobContract & { status: 'completed'; completedAt: number } {
  return {
    ...structureJob,
    status: 'completed',
    completedAt,
  };
}

function validateRuntimeInput(input: OperationGenerationProviderFlowInput): string[] {
  const errors: string[] = [];
  validateRequiredTrimmedString(input.structureJob.id, 'structureJob.id', errors);
  validateRequiredTrimmedString(input.structureJob.workspaceId, 'structureJob.workspaceId', errors);
  validateRequiredTrimmedString(input.structureJob.noteId, 'structureJob.noteId', errors);

  if (input.structureJob.status !== 'running') {
    errors.push(`structure job status ${input.structureJob.status} is not running`);
  }

  if (input.contextEnvelopeBuilt.type !== 'ContextEnvelopeBuilt') {
    errors.push('contextEnvelopeBuilt type must be ContextEnvelopeBuilt');
  }

  validateRequiredTrimmedString(input.contextEnvelopeBuilt.userId, 'contextEnvelopeBuilt.userId', errors);

  if (input.contextEnvelopeBuilt.workspaceId !== input.structureJob.workspaceId) {
    errors.push('ContextEnvelopeBuilt workspaceId must match structureJob workspaceId');
  }
  if (input.contextEnvelopeBuilt.noteId !== input.structureJob.noteId) {
    errors.push('ContextEnvelopeBuilt noteId must match structureJob noteId');
  }
  if (input.contextEnvelopeBuilt.structureJobId !== input.structureJob.id) {
    errors.push('ContextEnvelopeBuilt structureJobId must match structureJob id');
  }
  if (input.contextEnvelopeBuilt.targetScope !== input.structureJob.targetScope) {
    errors.push('ContextEnvelopeBuilt targetScope must match structureJob targetScope');
  }

  if (typeof input.now !== 'number' || !Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

function validateRequiredTrimmedString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return;
  }

  if (value !== value.trim()) {
    errors.push(`${field} must be trimmed`);
  }
}

function flowResult(
  partial: Omit<OperationGenerationProviderFlowResult, 'operationRoutingCalls' | 'auditWrites' | 'directApplyResults' | 'noteSotMutations' | 'providerCalls'> &
    Partial<Pick<OperationGenerationProviderFlowResult, 'providerCalls'>>,
): OperationGenerationProviderFlowResult {
  return {
    ...partial,
    providerCalls: partial.providerCalls ?? [],
    operationRoutingCalls: [],
    auditWrites: [],
    directApplyResults: [],
    noteSotMutations: [],
  };
}

function toProviderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `operation generation provider failed: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `operation generation provider failed: ${error.trim()}`;
  }

  return 'operation generation provider failed';
}
