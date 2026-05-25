// Operation Router route/audit contracts.
// Authority: docs/contracts/operation-return-contract.md

import {
  type OperationPolicy,
  operationPolicies,
  type OperationStatus,
  operationStatuses,
  type StructureOperation,
} from './operationContract.ts';
import type { BlockOrigin } from '../../../note-model/src/contract/noteContract.ts';

export const operationApplyActions = ['apply', 'propose', 'no_apply', 'reject'] as const;
export type OperationApplyAction = (typeof operationApplyActions)[number];

export const operationApplyEffects = [
  'create_semantic_unit',
  'create_relation',
  'create_memory_candidate',
  'insert_assist_block',
  'create_organized_note_version',
  'mark_stale',
  'no_op',
] as const;
export type OperationApplyEffect = (typeof operationApplyEffects)[number];

export const operationTargetTypes = ['note', 'block', 'section', 'semantic_unit', 'memory_candidate', 'assist_block'] as const;
export type OperationTargetType = (typeof operationTargetTypes)[number];

export const operationAuditPolicies = operationPolicies;
export const operationAuditStatuses = operationStatuses;

export interface OperationRouterBlockSnapshot {
  id: string;
  origin: BlockOrigin;
  sectionId?: string;
}

export interface OperationRouterIdSnapshot {
  id: string;
}

export interface OperationRouterSnapshot {
  notes: readonly OperationRouterIdSnapshot[];
  blocks: readonly OperationRouterBlockSnapshot[];
  sections: readonly OperationRouterIdSnapshot[];
  captureEntries: readonly OperationRouterIdSnapshot[];
  semanticUnits: readonly OperationRouterIdSnapshot[];
  memoryCandidates: readonly OperationRouterIdSnapshot[];
  assistBlocks: readonly OperationRouterIdSnapshot[];
}

export interface RouteOperationOptions {
  confidenceThreshold?: number;
  generatedBy?: string;
  operationId?: string;
  operationIds?: readonly string[];
  sequence?: number;
  workspaceId?: string;
  noteId?: string;
  structureJobId?: string;
  now?: number;
}

export interface AiOperationAuditSourceSpanContract {
  targetType: 'operation';
  targetId: string;
  sourceBlockId: string;
  startOffset?: number;
  endOffset?: number;
  reason: string;
}

export interface AiOperationAuditRecordContract {
  id: string;
  workspaceId: string;
  noteId?: string;
  structureJobId?: string;
  operationType: string;
  policy: OperationPolicy;
  status: OperationStatus;
  operation: unknown;
  errors: string[];
  sourceSpans: AiOperationAuditSourceSpanContract[];
  confidence?: number;
  targetType?: OperationTargetType;
  targetId?: string;
  generatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export type OperationApplyResult =
  | {
      action: 'apply';
      effect: Exclude<OperationApplyEffect, 'create_memory_candidate' | 'insert_assist_block' | 'no_op'>;
      reason: string;
    }
  | {
      action: 'propose';
      effect: 'create_memory_candidate' | 'insert_assist_block';
      policy: 'inline' | 'review';
      reason: string;
    }
  | {
      action: 'no_apply';
      effect: OperationApplyEffect;
      reason: string;
    }
  | {
      action: 'reject';
      reason: string;
    };

export interface OperationRouteResult {
  ok: boolean;
  accepted: boolean;
  policy: OperationPolicy;
  status: OperationStatus;
  operation?: StructureOperation;
  errors: string[];
  auditRecord?: AiOperationAuditRecordContract;
  applyResult: OperationApplyResult;
}

export interface OperationListRouteResult {
  ok: boolean;
  policy: OperationPolicy;
  acceptedCount: number;
  rejectedCount: number;
  errors: string[];
  results: OperationRouteResult[];
  auditRecords: AiOperationAuditRecordContract[];
  applyResults: OperationApplyResult[];
}

export interface OperationRevertResult {
  ok: boolean;
  status: Extract<OperationStatus, 'reverted' | 'failed'>;
  errors: string[];
  auditRecord?: AiOperationAuditRecordContract;
}
