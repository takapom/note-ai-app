// AI Operations runtime event shape for a built ContextEnvelope.
// Authority: docs/contracts/context-assembly.md

import type { TargetScopeKind } from '../../../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';

export interface ContextEnvelopeBuiltEvent {
  type: 'ContextEnvelopeBuilt';
  workspaceId: string;
  userId: string;
  noteId: string;
  structureJobId: string;
  targetScope: TargetScopeKind;
  builtAt: number;
}
