// Worker runtime flow for building ContextEnvelope from read-only retrieval ports.
// Authority: docs/contracts/context-assembly.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/api-events.md

import {
  assembleContextEnvelope,
  defaultContextAssemblyLimits,
  hasForbiddenContextDumpField,
  validateContextEnvelope,
  type ContextAssemblyInput,
  type ContextAssemblyLimits,
  type ContextEnvelopeContract,
  type ContextEnvelopeValidationResult,
  type TargetScopeKind,
} from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';

export interface ContextAssemblyRuntimeRequest {
  workspaceId: string;
  userId: string;
  noteId: string;
  structureJobId: string;
  targetScope: TargetScopeKind;
  targetId?: string;
  now: number;
}

export interface ContextAssemblyTargetSnapshotPort {
  loadTargetContext(input: ContextAssemblyRuntimeRequest): Promise<{
    target: ContextAssemblyInput['target'];
    note: ContextAssemblyInput['note'];
    outline: ContextAssemblyInput['outline'];
  }>;
}

export interface ContextAssemblyLocalStructurePort {
  loadLocalStructure(input: ContextAssemblyRuntimeRequest): Promise<ContextAssemblyInput['localStructure']>;
}

export interface ContextAssemblyRelatedContextRetrievalPort {
  loadRelatedContext(input: ContextAssemblyRuntimeRequest): Promise<ContextAssemblyInput['relatedContext']>;
}

export interface ContextAssemblyMemoryRetrievalPort {
  loadMemoryContext(input: ContextAssemblyRuntimeRequest): Promise<ContextAssemblyInput['memoryContext']>;
}

export interface ContextAssemblyRuntimePorts {
  targetSnapshot: ContextAssemblyTargetSnapshotPort;
  localStructure: ContextAssemblyLocalStructurePort;
  relatedContext: ContextAssemblyRelatedContextRetrievalPort;
  memoryContext: ContextAssemblyMemoryRetrievalPort;
}

export interface ContextEnvelopeBuiltEvent {
  type: 'ContextEnvelopeBuilt';
  workspaceId: string;
  userId: string;
  noteId: string;
  structureJobId: string;
  targetScope: TargetScopeKind;
  builtAt: number;
}

export interface ContextEnvelopeAssemblyFlowInput extends ContextAssemblyRuntimeRequest {
  ports: ContextAssemblyRuntimePorts;
  limits?: ContextAssemblyLimits;
}

export interface ContextEnvelopeAssemblyFlowResult {
  envelope?: ContextEnvelopeContract;
  validation: ContextEnvelopeValidationResult;
  event?: ContextEnvelopeBuiltEvent;
  providerCalls: [];
  operationRoutingCalls: [];
  auditWrites: [];
  errors: string[];
}

export async function runContextEnvelopeAssemblyFlow(
  input: ContextEnvelopeAssemblyFlowInput,
): Promise<ContextEnvelopeAssemblyFlowResult> {
  const request = toRuntimeRequest(input);
  const limits = input.limits ?? defaultContextAssemblyLimits;
  const inputErrors = validateRuntimeRequest(request);

  if (inputErrors.length > 0) {
    return invalidResult(inputErrors);
  }

  const targetResult = await readPort(
    () => input.ports.targetSnapshot.loadTargetContext(request),
    'target context snapshot failed',
  );
  if (!targetResult.ok) return invalidResult(targetResult.errors);
  if (hasForbiddenContextDumpField(targetResult.value)) return invalidResult([forbiddenDumpMessage]);
  if (targetResult.value.target.scope !== request.targetScope) {
    return invalidResult([
      `target snapshot scope ${targetResult.value.target.scope} must match requested targetScope ${request.targetScope}`,
    ]);
  }

  const localStructureResult = await readPort(
    () => input.ports.localStructure.loadLocalStructure(request),
    'local structure retrieval failed',
  );
  if (!localStructureResult.ok) return invalidResult(localStructureResult.errors);
  if (hasForbiddenContextDumpField(localStructureResult.value)) return invalidResult([forbiddenDumpMessage]);

  const relatedContextResult = await readPort(
    () => input.ports.relatedContext.loadRelatedContext(request),
    'related context retrieval failed',
  );
  if (!relatedContextResult.ok) return invalidResult(relatedContextResult.errors);
  if (hasForbiddenContextDumpField(relatedContextResult.value)) return invalidResult([forbiddenDumpMessage]);

  const memoryContextResult = await readPort(
    () => input.ports.memoryContext.loadMemoryContext(request),
    'memory context retrieval failed',
  );
  if (!memoryContextResult.ok) return invalidResult(memoryContextResult.errors);
  if (hasForbiddenContextDumpField(memoryContextResult.value)) return invalidResult([forbiddenDumpMessage]);

  const assemblyInput: ContextAssemblyInput = {
    target: targetResult.value.target,
    note: targetResult.value.note,
    outline: targetResult.value.outline,
    ...(localStructureResult.value === undefined ? {} : { localStructure: localStructureResult.value }),
    ...(relatedContextResult.value === undefined ? {} : { relatedContext: relatedContextResult.value }),
    ...(memoryContextResult.value === undefined ? {} : { memoryContext: memoryContextResult.value }),
  };
  const envelope = assembleContextEnvelope(assemblyInput, limits);
  const validation = validateContextEnvelope(envelope, limits);

  if (!validation.valid) {
    return {
      validation,
      providerCalls: [],
      operationRoutingCalls: [],
      auditWrites: [],
      errors: validation.errors,
    };
  }

  return {
    envelope,
    validation,
    event: {
      type: 'ContextEnvelopeBuilt',
      workspaceId: request.workspaceId,
      userId: request.userId,
      noteId: request.noteId,
      structureJobId: request.structureJobId,
      targetScope: request.targetScope,
      builtAt: request.now,
    },
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors: [],
  };
}

function toRuntimeRequest(input: ContextEnvelopeAssemblyFlowInput): ContextAssemblyRuntimeRequest {
  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    noteId: input.noteId,
    structureJobId: input.structureJobId,
    targetScope: input.targetScope,
    ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
    now: input.now,
  };
}

function validateRuntimeRequest(input: ContextAssemblyRuntimeRequest): string[] {
  const errors: string[] = [];

  validateRequiredTrimmedString(input.workspaceId, 'workspaceId', errors);
  validateRequiredTrimmedString(input.userId, 'userId', errors);
  validateRequiredTrimmedString(input.noteId, 'noteId', errors);
  validateRequiredTrimmedString(input.structureJobId, 'structureJobId', errors);

  if (!['section', 'chunk', 'note'].includes(input.targetScope)) {
    errors.push('targetScope must be section, chunk, or note');
  }
  if (input.targetId !== undefined) {
    validateRequiredTrimmedString(input.targetId, 'targetId', errors);
  }
  if (typeof input.now !== 'number' || !Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }

  return errors;
}

async function readPort<T>(
  read: () => Promise<T>,
  errorPrefix: string,
): Promise<{ ok: true; value: T } | { ok: false; errors: string[] }> {
  try {
    return {
      ok: true,
      value: await read(),
    };
  } catch (error) {
    return {
      ok: false,
      errors: [toPortErrorMessage(errorPrefix, error)],
    };
  }
}

function invalidResult(errors: string[]): ContextEnvelopeAssemblyFlowResult {
  return {
    validation: {
      valid: false,
      errors,
    },
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors,
  };
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

function toPortErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `${prefix}: ${error.trim()}`;
  }

  return prefix;
}

const forbiddenDumpMessage = 'retrieval port output must not include full workspace, full notes, or dump fields';
