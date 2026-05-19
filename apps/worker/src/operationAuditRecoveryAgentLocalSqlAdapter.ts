// Agent-local SQL adapter for operation audit recovery intents.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md, docs/contracts/repository-topology.md

import type { AiOperationAuditRecordContract } from '../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import {
  type OperationAuditRecoveryQueuePayload,
  type OperationAuditRecoveryQueuePort,
  type OperationAuditRecoveryQueueResult,
  validateOperationAuditRecoveryPayload,
} from './operationAuditRecoveryQueue.ts';

export interface OperationAuditRecoveryAgentLocalSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface OperationAuditRecoveryAgentLocalSqlExecutor {
  execute(statement: OperationAuditRecoveryAgentLocalSqlStatement): Promise<unknown>;
}

export class AgentLocalOperationAuditRecoveryQueueAdapter implements OperationAuditRecoveryQueuePort {
  private readonly executor: OperationAuditRecoveryAgentLocalSqlExecutor;

  constructor(executor: OperationAuditRecoveryAgentLocalSqlExecutor) {
    this.executor = executor;
  }

  async enqueue(payload: OperationAuditRecoveryQueuePayload): Promise<OperationAuditRecoveryQueueResult> {
    const errors = validateOperationAuditRecoveryPayload(payload);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const item = cloneRecoveryPayload(payload);

    try {
      await this.executor.execute(mapOperationAuditRecoveryPayloadToAgentLocalSql(item));
    } catch (_error) {
      return {
        ok: false,
        errors: ['audit recovery enqueue unavailable'],
      };
    }

    return {
      ok: true,
      errors: [],
      item,
    };
  }
}

export function mapOperationAuditRecoveryPayloadToAgentLocalSql(
  payload: OperationAuditRecoveryQueuePayload,
): OperationAuditRecoveryAgentLocalSqlStatement {
  return {
    sql: [
      'insert into agent_local_operation_audit_recovery_queue',
      '(operation_id, workspace_id, note_id, structure_job_id, audit_record_json, failure_message, failed_at)',
      'values (?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      payload.operationId,
      payload.workspaceId,
      payload.noteId ?? null,
      payload.structureJobId ?? null,
      JSON.stringify(payload.auditRecord),
      payload.failureMessage,
      payload.failedAt,
    ],
  };
}

function cloneRecoveryPayload(
  payload: OperationAuditRecoveryQueuePayload,
): OperationAuditRecoveryQueuePayload {
  return {
    operationId: payload.operationId,
    workspaceId: payload.workspaceId,
    ...(payload.noteId === undefined ? {} : { noteId: payload.noteId }),
    ...(payload.structureJobId === undefined ? {} : { structureJobId: payload.structureJobId }),
    auditRecord: cloneAuditRecord(payload.auditRecord),
    failureMessage: payload.failureMessage,
    failedAt: payload.failedAt,
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
