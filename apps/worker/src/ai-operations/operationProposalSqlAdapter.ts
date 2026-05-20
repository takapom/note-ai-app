// Infrastructure adapter for persisted AI operation proposals.
// Authority: docs/contracts/api-events.md
// Companion: docs/contracts/backend-runtime.md, docs/contracts/operation-return-contract.md

import {
  type OperationProposalLookupInput,
  type OperationProposalPersistencePort,
  type OperationProposalPortResult,
  type OperationProposalRecord,
  type OperationProposalSaveInput,
  type OperationProposalState,
  type OperationProposalStateUpdateInput,
  type RuntimeOperationAuditRecord,
  validateOperationProposalSaveInput,
} from './operationProposalPort.ts';

export interface OperationProposalSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface OperationProposalSqlWriteResult {
  rowsAffected?: number;
  changes?: number;
}

export interface OperationProposalSqlExecutor {
  query(statement: OperationProposalSqlStatement): Promise<readonly Record<string, unknown>[]>;
  write(statement: OperationProposalSqlStatement): Promise<OperationProposalSqlWriteResult | void>;
}

export class TursoOperationProposalSqlAdapter implements OperationProposalPersistencePort {
  private readonly executor: OperationProposalSqlExecutor;

  constructor(input: { executor: OperationProposalSqlExecutor }) {
    this.executor = input.executor;
  }

  async saveProposal(input: OperationProposalSaveInput): Promise<OperationProposalPortResult> {
    const errors = validateOperationProposalSaveInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      const existing = await this.findProposal(input);
      if (existing !== undefined) {
        return {
          ok: false,
          errors: [`operation proposal ${input.operationId} already exists in workspace ${input.workspaceId}`],
        };
      }

      const auditRecord = input.auditRecord as RuntimeOperationAuditRecord;
      const proposal: OperationProposalRecord = {
        operationId: input.operationId,
        workspaceId: input.workspaceId,
        state: 'pending',
        auditRecord: cloneAuditRecord(auditRecord),
        createdAt: input.now,
        updatedAt: input.now,
      };

      await this.executor.write(mapOperationProposalInsertToSql(proposal));
      return { ok: true, errors: [], proposal };
    } catch (error) {
      return {
        ok: false,
        errors: [toPersistenceErrorMessage('operation proposal save failed', error)],
      };
    }
  }

  async findProposal(input: OperationProposalLookupInput): Promise<OperationProposalRecord | undefined> {
    if (!isStableRuntimeId(input.workspaceId) || !isStableRuntimeId(input.operationId)) {
      return undefined;
    }

    const rows = await this.executor.query(mapOperationProposalLookupToSql(input));
    const mapped = mapOperationProposalRows(rows, input);
    return mapped.ok ? mapped.proposal : undefined;
  }

  async updateProposalState(input: OperationProposalStateUpdateInput): Promise<OperationProposalPortResult> {
    const errors = validateOperationProposalStateUpdateInput(input);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      const current = await this.findProposal(input);
      if (current === undefined) {
        return {
          ok: false,
          errors: [`operation proposal ${input.operationId} was not found in workspace ${input.workspaceId}`],
        };
      }
      if (current.state !== 'pending') {
        return {
          ok: false,
          errors: [`operation proposal ${input.operationId} is already ${current.state}`],
        };
      }

      const updated: OperationProposalRecord = {
        ...current,
        state: input.state,
        updatedAt: input.now,
        ...(input.state === 'accepted' ? { acceptedAt: input.now } : { dismissedAt: input.now }),
      };
      const writeResult = await this.executor.write(mapOperationProposalStateUpdateToSql(updated));
      if (readRowsAffected(writeResult) === 0) {
        return {
          ok: false,
          errors: [`operation proposal ${input.operationId} was not updated from pending state`],
        };
      }

      return { ok: true, errors: [], proposal: updated };
    } catch (error) {
      return {
        ok: false,
        errors: [toPersistenceErrorMessage('operation proposal state update failed', error)],
      };
    }
  }
}

export function mapOperationProposalLookupToSql(input: OperationProposalLookupInput): OperationProposalSqlStatement {
  const errors = validateOperationProposalLookupInput(input);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    sql: [
      'select operation_id, workspace_id, state, audit_record_json, created_at, updated_at, accepted_at, dismissed_at',
      'from operation_proposals',
      'where workspace_id = ? and operation_id = ?',
      'limit 2',
    ].join(' '),
    args: [input.workspaceId, input.operationId],
  };
}

export function mapOperationProposalInsertToSql(proposal: OperationProposalRecord): OperationProposalSqlStatement {
  const errors = validateOperationProposalRecord(proposal);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return {
    sql: [
      'insert into operation_proposals',
      '(operation_id, workspace_id, state, audit_record_json, created_at, updated_at, accepted_at, dismissed_at)',
      'values (?, ?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      proposal.operationId,
      proposal.workspaceId,
      proposal.state,
      JSON.stringify(proposal.auditRecord),
      proposal.createdAt,
      proposal.updatedAt,
      proposal.acceptedAt ?? null,
      proposal.dismissedAt ?? null,
    ],
  };
}

export function mapOperationProposalStateUpdateToSql(
  proposal: OperationProposalRecord,
): OperationProposalSqlStatement {
  const errors = validateOperationProposalRecord(proposal);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  if (proposal.state !== 'accepted' && proposal.state !== 'dismissed') {
    throw new Error('proposal.state must be accepted or dismissed for state update');
  }

  return {
    sql: [
      'update operation_proposals',
      'set state = ?, updated_at = ?, accepted_at = ?, dismissed_at = ?',
      'where workspace_id = ? and operation_id = ? and state = ?',
    ].join(' '),
    args: [
      proposal.state,
      proposal.updatedAt,
      proposal.acceptedAt ?? null,
      proposal.dismissedAt ?? null,
      proposal.workspaceId,
      proposal.operationId,
      'pending',
    ],
  };
}

export function mapOperationProposalRows(
  rows: readonly Record<string, unknown>[],
  input: OperationProposalLookupInput,
): { ok: true; proposal?: OperationProposalRecord } | { ok: false; errors: string[] } {
  const inputErrors = validateOperationProposalLookupInput(input);
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }
  if (rows.length === 0) {
    return { ok: true };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      errors: [`operation proposal ${input.operationId} returned multiple rows in workspace ${input.workspaceId}`],
    };
  }

  return mapOperationProposalRow(rows[0], input);
}

function mapOperationProposalRow(
  row: Record<string, unknown>,
  input: OperationProposalLookupInput,
): { ok: true; proposal: OperationProposalRecord } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const operationId = readString(row.operation_id);
  const workspaceId = readString(row.workspace_id);
  const state = readProposalState(row.state);
  const auditRecord = readAuditRecord(row.audit_record_json);
  const createdAt = readFiniteNumber(row.created_at);
  const updatedAt = readFiniteNumber(row.updated_at);
  const acceptedAt = readOptionalFiniteNumber(row.accepted_at);
  const dismissedAt = readOptionalFiniteNumber(row.dismissed_at);

  if (operationId !== input.operationId) {
    errors.push('operation proposal row operation_id must match operationId');
  }
  if (workspaceId !== input.workspaceId) {
    errors.push('operation proposal row workspace_id must match workspaceId');
  }
  if (!isProposalState(state)) {
    errors.push('operation proposal row state must be pending, accepted, or dismissed');
  }
  if (!isRecord(auditRecord)) {
    errors.push('operation proposal row audit_record_json must be valid JSON object');
  }
  if (!Number.isFinite(createdAt)) {
    errors.push('operation proposal row created_at must be a finite number');
  }
  if (!Number.isFinite(updatedAt)) {
    errors.push('operation proposal row updated_at must be a finite number');
  }
  if (acceptedAt !== undefined && !Number.isFinite(acceptedAt)) {
    errors.push('operation proposal row accepted_at must be null or a finite number');
  }
  if (dismissedAt !== undefined && !Number.isFinite(dismissedAt)) {
    errors.push('operation proposal row dismissed_at must be null or a finite number');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const proposalState = state;
  if (
    proposalState === undefined ||
    !isRecord(auditRecord) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt)
  ) {
    return {
      ok: false,
      errors: ['operation proposal row could not be mapped'],
    };
  }

  const proposal: OperationProposalRecord = {
    operationId,
    workspaceId,
    state: proposalState,
    auditRecord: auditRecord as RuntimeOperationAuditRecord,
    createdAt,
    updatedAt,
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(dismissedAt === undefined ? {} : { dismissedAt }),
  };
  const recordErrors = validateOperationProposalRecord(proposal);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  return { ok: true, proposal };
}

function validateOperationProposalLookupInput(input: OperationProposalLookupInput): string[] {
  const errors: string[] = [];
  if (!isStableRuntimeId(input.workspaceId)) {
    errors.push('workspaceId must be a stable non-sentinel runtime id');
  }
  if (!isStableRuntimeId(input.operationId)) {
    errors.push('operationId must be a stable non-sentinel runtime id');
  }
  return errors;
}

function validateOperationProposalStateUpdateInput(input: OperationProposalStateUpdateInput): string[] {
  const errors = validateOperationProposalLookupInput(input);
  if (input.state !== 'accepted' && input.state !== 'dismissed') {
    errors.push('state must be accepted or dismissed');
  }
  if (!Number.isFinite(input.now)) {
    errors.push('now must be a finite number');
  }
  return errors;
}

function validateOperationProposalRecord(proposal: OperationProposalRecord): string[] {
  const saveErrors = validateOperationProposalSaveInput({
    operationId: proposal.operationId,
    workspaceId: proposal.workspaceId,
    auditRecord: proposal.auditRecord,
    now: proposal.createdAt,
  });
  const errors = [...saveErrors];

  if (!isProposalState(proposal.state)) {
    errors.push('proposal.state must be pending, accepted, or dismissed');
  }
  if (!Number.isFinite(proposal.updatedAt)) {
    errors.push('proposal.updatedAt must be a finite number');
  }
  if (proposal.acceptedAt !== undefined && !Number.isFinite(proposal.acceptedAt)) {
    errors.push('proposal.acceptedAt must be a finite number');
  }
  if (proposal.dismissedAt !== undefined && !Number.isFinite(proposal.dismissedAt)) {
    errors.push('proposal.dismissedAt must be a finite number');
  }
  if (proposal.state === 'pending' && (proposal.acceptedAt !== undefined || proposal.dismissedAt !== undefined)) {
    errors.push('pending proposal must not have acceptedAt or dismissedAt');
  }
  if (proposal.state === 'accepted' && !Number.isFinite(proposal.acceptedAt)) {
    errors.push('accepted proposal must have acceptedAt');
  }
  if (proposal.state === 'dismissed' && !Number.isFinite(proposal.dismissedAt)) {
    errors.push('dismissed proposal must have dismissedAt');
  }

  return errors;
}

function readRowsAffected(result: OperationProposalSqlWriteResult | void): number | undefined {
  if (result === undefined) {
    return undefined;
  }
  if (typeof result.rowsAffected === 'number') {
    return result.rowsAffected;
  }
  if (typeof result.changes === 'number') {
    return result.changes;
  }
  return undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readProposalState(value: unknown): OperationProposalState | undefined {
  return isProposalState(value) ? value : undefined;
}

function readAuditRecord(value: unknown): unknown {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return readFiniteNumber(value);
}

function isProposalState(value: unknown): value is OperationProposalState {
  return value === 'pending' || value === 'accepted' || value === 'dismissed';
}

function cloneAuditRecord(record: RuntimeOperationAuditRecord): RuntimeOperationAuditRecord {
  return JSON.parse(JSON.stringify(record)) as RuntimeOperationAuditRecord;
}

function toPersistenceErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }
  return prefix;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
