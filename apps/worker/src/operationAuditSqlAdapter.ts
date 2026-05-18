// Infrastructure adapter for persisting AI operation audit records.
// Authority: docs/contracts/cloudflare-agents-turso.md
// Companion: docs/contracts/data-model.md, docs/contracts/operation-return-contract.md

import type { AiOperationAuditRecordContract } from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import {
  type OperationAuditPersistencePort,
  type OperationAuditSaveResult,
  validateOperationAuditRecordForPersistence,
} from './operationAuditPort.ts';

export interface OperationAuditSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface OperationAuditSqlExecutor {
  writeOperationAudit(statements: readonly OperationAuditSqlStatement[]): Promise<void>;
}

export class OperationAuditSqlPersistenceAdapter implements OperationAuditPersistencePort {
  private readonly executor: OperationAuditSqlExecutor;

  constructor(executor: OperationAuditSqlExecutor) {
    this.executor = executor;
  }

  async save(record: AiOperationAuditRecordContract): Promise<OperationAuditSaveResult> {
    const errors = validateOperationAuditRecordForPersistence(record);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const statements = mapOperationAuditRecordToSql(record);

    try {
      await this.executor.writeOperationAudit(statements);
    } catch (error) {
      return {
        ok: false,
        errors: [toSqlErrorMessage(error)],
      };
    }

    return {
      ok: true,
      errors: [],
      record,
    };
  }
}

export function mapOperationAuditRecordToSql(record: AiOperationAuditRecordContract): OperationAuditSqlStatement[] {
  const operationStatement: OperationAuditSqlStatement = {
    sql: [
      'insert into ai_operations',
      '(id, workspace_id, note_id, structure_job_id, operation_type, policy, status, operation_json, errors_json, confidence, target_type, target_id, generated_by, created_at, updated_at)',
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      record.id,
      record.workspaceId,
      record.noteId ?? null,
      record.structureJobId ?? null,
      record.operationType,
      record.policy,
      record.status,
      JSON.stringify(record.operation),
      JSON.stringify(record.errors),
      record.confidence ?? null,
      record.targetType ?? null,
      record.targetId ?? null,
      record.generatedBy,
      record.createdAt,
      record.updatedAt,
    ],
  };

  const sourceSpanStatements = record.sourceSpans.map((span, index): OperationAuditSqlStatement => ({
    sql: [
      'insert into source_spans',
      '(target_type, target_id, source_block_id, start_offset, end_offset, reason, position)',
      'values (?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      span.targetType,
      span.targetId,
      span.sourceBlockId,
      span.startOffset ?? null,
      span.endOffset ?? null,
      span.reason,
      index,
    ],
  }));

  return [operationStatement, ...sourceSpanStatements];
}

function toSqlErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `operation audit SQL write failed: ${error.message.trim()}`;
  }

  return 'operation audit SQL write failed';
}
