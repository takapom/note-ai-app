// Application/runtime persistence port for AI operation audit records.
// Authority: docs/contracts/operation-return-contract.md
// Companion: docs/contracts/data-model.md, docs/contracts/repository-topology.md

import {
  type AiOperationAuditRecordContract,
  validateOperationAuditRecordContract,
} from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';

export interface OperationAuditSaveResult {
  ok: boolean;
  errors: string[];
  record?: AiOperationAuditRecordContract;
}

export interface OperationAuditPersistencePort {
  save(record: AiOperationAuditRecordContract): Promise<OperationAuditSaveResult>;
}

export class InMemoryOperationAuditPersistencePort implements OperationAuditPersistencePort {
  private readonly records = new Map<string, AiOperationAuditRecordContract>();

  async save(record: AiOperationAuditRecordContract): Promise<OperationAuditSaveResult> {
    const errors = validateOperationAuditRecordForPersistence(record);

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const saved = cloneAuditRecord(record);
    if (this.records.has(saved.id)) {
      return {
        ok: false,
        errors: [`auditRecord.id ${saved.id} already exists`],
      };
    }

    this.records.set(saved.id, saved);

    return {
      ok: true,
      errors: [],
      record: cloneAuditRecord(saved),
    };
  }

  findById(id: string): AiOperationAuditRecordContract | undefined {
    const record = this.records.get(id);
    return record === undefined ? undefined : cloneAuditRecord(record);
  }

  list(): AiOperationAuditRecordContract[] {
    return Array.from(this.records.values(), cloneAuditRecord);
  }
}

export function validateOperationAuditRecordForPersistence(
  record: AiOperationAuditRecordContract | unknown,
): string[] {
  return validateOperationAuditRecordContract(record);
}

function cloneAuditRecord(record: AiOperationAuditRecordContract): AiOperationAuditRecordContract {
  return {
    ...record,
    errors: [...record.errors],
    sourceSpans: record.sourceSpans.map((span) => ({ ...span })),
  };
}
