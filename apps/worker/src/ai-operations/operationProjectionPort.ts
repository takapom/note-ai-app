// Application/runtime persistence port for active AI projection writes.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/operation-return-contract.md, docs/contracts/repository-topology.md

import type {
  AiOperationAuditRecordContract,
} from '../../../../contexts/ai-operations/src/contract/operationRouterContract.ts';

export type ActiveOperationProjectionEffect =
  | 'create_semantic_unit'
  | 'create_relation'
  | 'create_organized_note_version'
  | 'mark_stale';

export interface OperationProjectionWriteIntent {
  operationId: string;
  workspaceId: string;
  effect: ActiveOperationProjectionEffect;
  reason: string;
  auditRecord: AiOperationAuditRecordContract;
  operation: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface OperationProjectionSaveResult {
  ok: boolean;
  errors: string[];
  intent?: OperationProjectionWriteIntent;
}

export interface OperationProjectionPersistencePort {
  saveActiveProjection(intent: OperationProjectionWriteIntent): Promise<OperationProjectionSaveResult>;
}

export class InMemoryOperationProjectionPersistencePort implements OperationProjectionPersistencePort {
  private readonly intents = new Map<string, OperationProjectionWriteIntent>();

  async saveActiveProjection(intent: OperationProjectionWriteIntent): Promise<OperationProjectionSaveResult> {
    const errors = validateOperationProjectionWriteIntent(intent);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const saved = cloneProjectionWriteIntent(intent);
    if (this.intents.has(saved.operationId)) {
      return {
        ok: false,
        errors: [`operation projection ${saved.operationId} already exists`],
      };
    }

    this.intents.set(saved.operationId, saved);
    return { ok: true, errors: [], intent: cloneProjectionWriteIntent(saved) };
  }

  findByOperationId(operationId: string): OperationProjectionWriteIntent | undefined {
    const intent = this.intents.get(operationId);
    return intent === undefined ? undefined : cloneProjectionWriteIntent(intent);
  }

  list(): OperationProjectionWriteIntent[] {
    return Array.from(this.intents.values(), cloneProjectionWriteIntent);
  }
}

export function validateOperationProjectionWriteIntent(intent: OperationProjectionWriteIntent | unknown): string[] {
  if (!isRecord(intent)) {
    return ['projection intent must be an object'];
  }

  const errors: string[] = [];
  const record = intent as Partial<OperationProjectionWriteIntent>;

  if (!isStableRuntimeId(record.operationId)) {
    errors.push('operationId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(record.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isActiveProjectionEffect(record.effect)) {
    errors.push('effect must be create_semantic_unit, create_relation, create_organized_note_version, or mark_stale');
  }
  if (!isNonEmptyString(record.reason)) {
    errors.push('reason must be a non-empty string');
  }
  if (!Number.isFinite(record.createdAt)) {
    errors.push('createdAt must be a finite number');
  }
  if (!Number.isFinite(record.updatedAt)) {
    errors.push('updatedAt must be a finite number');
  }

  const auditRecord = record.auditRecord;
  if (!isRecord(auditRecord)) {
    errors.push('auditRecord must be an object');
    return errors;
  }

  if (auditRecord.id !== record.operationId) {
    errors.push('auditRecord.id must match operationId');
  }
  if (auditRecord.workspaceId !== record.workspaceId) {
    errors.push('auditRecord.workspaceId must match workspaceId');
  }
  if (record.effect !== undefined && auditRecord.operationType !== record.effect) {
    errors.push('auditRecord.operationType must match projection effect');
  }
  if (auditRecord.policy !== 'silent') {
    errors.push('auditRecord.policy must be silent for active projection persistence');
  }
  if (auditRecord.status !== 'proposed') {
    errors.push('auditRecord.status must be proposed');
  }

  return errors;
}

export function isActiveProjectionEffect(value: unknown): value is ActiveOperationProjectionEffect {
  return value === 'create_semantic_unit' ||
    value === 'create_relation' ||
    value === 'create_organized_note_version' ||
    value === 'mark_stale';
}

function cloneProjectionWriteIntent(intent: OperationProjectionWriteIntent): OperationProjectionWriteIntent {
  return {
    operationId: intent.operationId,
    workspaceId: intent.workspaceId,
    effect: intent.effect,
    reason: intent.reason,
    auditRecord: cloneAuditRecord(intent.auditRecord),
    operation: cloneUnknown(intent.operation),
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

function cloneAuditRecord(record: AiOperationAuditRecordContract): AiOperationAuditRecordContract {
  return {
    ...record,
    operation: cloneUnknown(record.operation),
    errors: [...record.errors],
    sourceSpans: record.sourceSpans.map((span) => ({ ...span })),
  };
}

function cloneUnknown<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStableRuntimeId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized === value &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized) &&
    !/(^|_)(unset|unknown|null|undefined|nan|sentinel|placeholder)($|_)/i.test(normalized)
  );
}
