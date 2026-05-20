// Agent-local SQL adapter for StructureJob work queue lifecycle transitions.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/ai-structuring-lifecycle.md, docs/contracts/cloudflare-agents-turso.md

import type { StructureJobContract } from '../../../../contexts/scheduler/src/contract/structureSchedulerContract.ts';
import type {
  SchedulerAgentLocalSqlExecutor,
  SchedulerAgentLocalSqlStatement,
} from './schedulerAgentLocalSqlAdapter.ts';
import {
  type ClaimNextQueuedStructureJobInput,
  type FailedStructureJobContract,
  type MarkStructureJobCompletedInput,
  type MarkStructureJobFailedInput,
  type RunningStructureJobContract,
  type StructureJobClaimResult,
  type StructureJobCompletedResult,
  type StructureJobFailedResult,
  type StructureJobWorkQueuePort,
  validateClaimNextQueuedJobInput,
  validateMarkStructureJobCompletedInput,
  validateMarkStructureJobFailedInput,
  validateStructureJobWorkQueueRecord,
} from './structureJobWorkQueuePort.ts';

type StoredStructureJob =
  | StructureJobContract
  | RunningStructureJobContract
  | CompletedStructureJob
  | FailedStructureJobContract;

type CompletedStructureJob = StructureJobContract & {
  status: 'completed';
  completedAt: number;
};

export class AgentLocalStructureJobWorkQueueAdapter implements StructureJobWorkQueuePort {
  private readonly executor: SchedulerAgentLocalSqlExecutor;

  constructor(executor: SchedulerAgentLocalSqlExecutor) {
    this.executor = executor;
  }

  async claimNextQueuedJob(input: ClaimNextQueuedStructureJobInput): Promise<StructureJobClaimResult> {
    const inputErrors = validateClaimNextQueuedJobInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const lookupResult = await this.querySingleJob(
      mapNextQueuedStructureJobLookupToAgentLocalSql(input),
      'queued structure job lookup',
    );
    if (!lookupResult.ok) {
      return { ok: false, errors: lookupResult.errors };
    }
    if (lookupResult.job === undefined) {
      return { ok: true, errors: [] };
    }
    if (lookupResult.job.status !== 'queued') {
      return { ok: false, errors: [`structure job status ${lookupResult.job.status} is not queued`] };
    }

    const runningJob = markQueuedJobRunning(lookupResult.job, input.claimedAt);
    const writeResult = await this.executeStatement(
      mapClaimedStructureJobToAgentLocalSql(runningJob),
      'structure job claim update failed',
    );
    if (!writeResult.ok) {
      return writeResult;
    }

    return {
      ok: true,
      errors: [],
      job: runningJob,
    };
  }

  async markJobCompleted(input: MarkStructureJobCompletedInput): Promise<StructureJobCompletedResult> {
    const inputErrors = validateMarkStructureJobCompletedInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const lookupResult = await this.querySingleJob(
      mapStructureJobLookupByIdToAgentLocalSql(input.structureJobId),
      'structure job completion lookup',
    );
    if (!lookupResult.ok) {
      return { ok: false, errors: lookupResult.errors };
    }
    if (lookupResult.job === undefined) {
      return { ok: false, errors: ['structureJobId was not found'] };
    }
    if (lookupResult.job.status !== 'running') {
      return { ok: false, errors: [`structure job status ${lookupResult.job.status} is not running`] };
    }
    const runningJob = lookupResult.job as RunningStructureJobContract;
    if (input.completedAt < runningJob.startedAt) {
      return { ok: false, errors: ['completedAt must be greater than or equal to startedAt'] };
    }

    const completedJob = markRunningJobCompleted(runningJob, input.completedAt);
    const writeResult = await this.executeStatement(
      mapCompletedStructureJobToAgentLocalSql(completedJob),
      'structure job completion update failed',
    );
    if (!writeResult.ok) {
      return writeResult;
    }

    return {
      ok: true,
      errors: [],
      job: completedJob,
    };
  }

  async markJobFailed(input: MarkStructureJobFailedInput): Promise<StructureJobFailedResult> {
    const inputErrors = validateMarkStructureJobFailedInput(input);
    if (inputErrors.length > 0) {
      return { ok: false, errors: inputErrors };
    }

    const lookupResult = await this.querySingleJob(
      mapStructureJobLookupByIdToAgentLocalSql(input.structureJobId),
      'structure job failure lookup',
    );
    if (!lookupResult.ok) {
      return { ok: false, errors: lookupResult.errors };
    }
    if (lookupResult.job === undefined) {
      return { ok: false, errors: ['structureJobId was not found'] };
    }
    if (lookupResult.job.status !== 'running') {
      return { ok: false, errors: [`structure job status ${lookupResult.job.status} is not running`] };
    }
    const runningJob = lookupResult.job as RunningStructureJobContract;
    if (input.failedAt < runningJob.startedAt) {
      return { ok: false, errors: ['failedAt must be greater than or equal to startedAt'] };
    }

    const failedJob = markRunningJobFailed(runningJob, input.failedAt, input.failureMessage);
    const writeResult = await this.executeStatement(
      mapFailedStructureJobToAgentLocalSql(failedJob),
      'structure job failure update failed',
    );
    if (!writeResult.ok) {
      return writeResult;
    }

    return {
      ok: true,
      errors: [],
      job: failedJob,
    };
  }

  private async querySingleJob(
    statement: SchedulerAgentLocalSqlStatement,
    label: string,
  ): Promise<{ ok: true; job?: StoredStructureJob } | { ok: false; errors: string[] }> {
    let rows: readonly Record<string, unknown>[];
    try {
      rows = await this.executor.query(statement);
    } catch (error) {
      return { ok: false, errors: [toSqlErrorMessage(`${label} failed`, error)] };
    }

    if (rows.length === 0) {
      return { ok: true };
    }
    if (rows.length > 1) {
      return { ok: false, errors: [`${label} must return at most one row`] };
    }

    const result = mapStructureJobWorkQueueRow(rows[0] as Record<string, unknown>);
    if (!result.ok) {
      return {
        ok: false,
        errors: result.errors.map((error) => `${label} row.${error}`),
      };
    }

    return {
      ok: true,
      job: result.job,
    };
  }

  private async executeStatement(
    statement: SchedulerAgentLocalSqlStatement,
    errorPrefix: string,
  ): Promise<{ ok: true; errors: [] } | { ok: false; errors: string[] }> {
    let result: unknown;
    try {
      result = await this.executor.execute(statement);
    } catch (error) {
      return {
        ok: false,
        errors: [toSqlErrorMessage(errorPrefix, error)],
      };
    }

    const affectedRows = readAffectedRows(result);
    if (affectedRows === 0) {
      return {
        ok: false,
        errors: [`${errorPrefix}: no rows affected`],
      };
    }

    return { ok: true, errors: [] };
  }
}

export function mapNextQueuedStructureJobLookupToAgentLocalSql(
  input: Pick<ClaimNextQueuedStructureJobInput, 'workspaceId'>,
): SchedulerAgentLocalSqlStatement {
  return {
    sql: [
      structureJobWorkQueueSelectColumns(),
      'from agent_local_structure_jobs',
      'where workspace_id = ? and status = ?',
      'order by created_at asc, id asc',
      'limit 1',
    ].join(' '),
    args: [input.workspaceId, 'queued'],
  };
}

export function mapStructureJobLookupByIdToAgentLocalSql(
  structureJobId: string,
): SchedulerAgentLocalSqlStatement {
  return {
    sql: [
      structureJobWorkQueueSelectColumns(),
      'from agent_local_structure_jobs',
      'where id = ?',
      'limit 2',
    ].join(' '),
    args: [structureJobId],
  };
}

export function mapClaimedStructureJobToAgentLocalSql(
  job: RunningStructureJobContract,
): SchedulerAgentLocalSqlStatement {
  return {
    sql: [
      'update agent_local_structure_jobs',
      'set status = ?, started_at = ?, completed_at = null, failed_at = null, failure_message = null',
      'where id = ? and workspace_id = ? and status = ?',
    ].join(' '),
    args: [job.status, job.startedAt, job.id, job.workspaceId, 'queued'],
  };
}

export function mapCompletedStructureJobToAgentLocalSql(
  job: CompletedStructureJob,
): SchedulerAgentLocalSqlStatement {
  return {
    sql: [
      'update agent_local_structure_jobs',
      'set status = ?, completed_at = ?, failed_at = null, failure_message = null',
      'where id = ? and workspace_id = ? and status = ?',
    ].join(' '),
    args: [job.status, job.completedAt, job.id, job.workspaceId, 'running'],
  };
}

export function mapFailedStructureJobToAgentLocalSql(
  job: FailedStructureJobContract,
): SchedulerAgentLocalSqlStatement {
  return {
    sql: [
      'update agent_local_structure_jobs',
      'set status = ?, failed_at = ?, failure_message = ?, completed_at = null',
      'where id = ? and workspace_id = ? and status = ?',
    ].join(' '),
    args: [job.status, job.failedAt, job.failureMessage, job.id, job.workspaceId, 'running'],
  };
}

export function mapStructureJobWorkQueueRow(
  row: Record<string, unknown>,
): { ok: true; job: StoredStructureJob } | { ok: false; errors: string[] } {
  const sectionId = readOptionalStringColumn(row, 'section_id', 'sectionId');
  const startedAt = readOptionalFiniteNumberColumn(row, 'started_at', 'startedAt');
  const completedAt = readOptionalFiniteNumberColumn(row, 'completed_at', 'completedAt');
  const wholeNoteReason = readOptionalStringColumn(row, 'whole_note_reason', 'wholeNoteReason');
  const skipReason = readOptionalStringColumn(row, 'skip_reason', 'skipReason');
  const failedAt = readOptionalFiniteNumberColumn(row, 'failed_at', 'failedAt');
  const failureMessage = readOptionalStringColumn(row, 'failure_message', 'failureMessage');

  const job = {
    id: readRequiredStringColumn(row, 'id'),
    workspaceId: readRequiredStringColumn(row, 'workspace_id', 'workspaceId'),
    noteId: readRequiredStringColumn(row, 'note_id', 'noteId'),
    ...(sectionId === undefined ? {} : { sectionId }),
    targetScope: readRequiredStringColumn(row, 'target_scope', 'targetScope'),
    triggerReason: readRequiredStringColumn(row, 'trigger_reason', 'triggerReason'),
    contextHash: readRequiredStringColumn(row, 'context_hash', 'contextHash'),
    status: readRequiredStringColumn(row, 'status'),
    priority: readRequiredStringColumn(row, 'priority'),
    createdAt: readRequiredFiniteNumberColumn(row, 'created_at', 'createdAt'),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(wholeNoteReason === undefined ? {} : { wholeNoteReason }),
    ...(skipReason === undefined ? {} : { skipReason }),
    ...(failedAt === undefined ? {} : { failedAt }),
    ...(failureMessage === undefined ? {} : { failureMessage }),
  } as unknown;

  const errors = validateStructureJobWorkQueueRecord(job);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    job: job as StoredStructureJob,
  };
}

function structureJobWorkQueueSelectColumns(): string {
  return [
    'select id, workspace_id, note_id, section_id, target_scope, trigger_reason, context_hash, status, priority, created_at, started_at, completed_at, whole_note_reason, skip_reason, failed_at, failure_message',
  ].join(' ');
}

function markQueuedJobRunning(
  job: StructureJobContract,
  startedAt: number,
): RunningStructureJobContract {
  const { completedAt: _completedAt, ...base } = job;
  return {
    ...base,
    status: 'running',
    startedAt,
  };
}

function markRunningJobCompleted(
  job: RunningStructureJobContract,
  completedAt: number,
): CompletedStructureJob {
  return {
    ...job,
    status: 'completed',
    completedAt,
  };
}

function markRunningJobFailed(
  job: RunningStructureJobContract,
  failedAt: number,
  failureMessage: string,
): FailedStructureJobContract {
  const { completedAt: _completedAt, ...base } = job as RunningStructureJobContract & { completedAt?: number };
  return {
    ...base,
    status: 'failed',
    failedAt,
    failureMessage,
  };
}

function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim() ? value : undefined;
}

function readOptionalStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredStringColumn(row, primaryColumn, fallbackColumn) ?? null;
}

function readRequiredFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalFiniteNumberColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): number | undefined | null {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredFiniteNumberColumn(row, primaryColumn, fallbackColumn) ?? null;
}

function toSqlErrorMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message.trim()}`;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return `${prefix}: ${error.trim()}`;
  }

  return prefix;
}

function readAffectedRows(result: unknown): number | undefined {
  if (typeof result !== 'object' || result === null) {
    return undefined;
  }

  const record = result as Record<string, unknown>;
  for (const key of ['rowsAffected', 'rowsWritten', 'changes'] as const) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}
