// Shared primitives for Context Envelope contracts.
// Authority: docs/contracts/context-assembly.md

import type { ContextContentOrigin, EnvelopeMemoryStatus } from './contextEnvelopeTypes.ts';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function isContextContentOrigin(value: unknown): value is ContextContentOrigin {
  return value === 'user' ||
    value === 'external' ||
    value === 'ai_projection' ||
    value === 'memory_projection';
}

export function isEnvelopeMemoryStatus(status: unknown): status is EnvelopeMemoryStatus {
  return status === 'active' || status === 'pinned';
}
