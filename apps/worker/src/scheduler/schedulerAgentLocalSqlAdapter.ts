// Agent-local SQL adapters for scheduler runtime ports.
// Authority: docs/contracts/ai-structuring-lifecycle.md

import type {
  BlockChangedPersistencePort,
  NextOpenDigestPreparationPort,
  StructureJobEnqueueResult,
  StructureJobQueuePort,
  WorkerSchedulerPortResult,
} from './structureSchedulerRuntimeFlow.ts';

export interface SchedulerAgentLocalSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface SchedulerAgentLocalSqlExecutor {
  execute(statement: SchedulerAgentLocalSqlStatement): Promise<unknown>;
  query(statement: SchedulerAgentLocalSqlStatement): Promise<readonly Record<string, unknown>[]>;
}

type BlockChangedOutput = Parameters<BlockChangedPersistencePort['persistBlockChanged']>[0];
type StructureJobs = Parameters<StructureJobQueuePort['enqueueJobs']>[0];
type StructureJob = StructureJobs[number];
type CompletedStructureJob = Awaited<ReturnType<StructureJobQueuePort['listCompletedJobs']>>[number];
type NextOpenDigestPreparation = Parameters<NextOpenDigestPreparationPort['prepareDigest']>[0];

export class AgentLocalBlockChangedPersistenceAdapter implements BlockChangedPersistencePort {
  private readonly executor: SchedulerAgentLocalSqlExecutor;

  constructor(executor: SchedulerAgentLocalSqlExecutor) {
    this.executor = executor;
  }

  async persistBlockChanged(output: BlockChangedOutput): Promise<WorkerSchedulerPortResult> {
    const statements = mapBlockChangedOutputToAgentLocalSql(output);
    if (statements.length === 0) {
      return {
        ok: false,
        errors: ['BlockChanged agent-local SQL persistence produced no statements'],
      };
    }

    const { executedCount: _executedCount, ...result } = await executeStatements(
      this.executor,
      statements,
      'BlockChanged agent-local SQL persistence failed',
    );
    return result;
  }
}

export class AgentLocalStructureJobQueueAdapter implements StructureJobQueuePort {
  private readonly executor: SchedulerAgentLocalSqlExecutor;

  constructor(executor: SchedulerAgentLocalSqlExecutor) {
    this.executor = executor;
  }

  async listCompletedJobs(input: {
    workspaceId: string;
    noteId: string;
  }): Promise<CompletedStructureJob[]> {
    const statements = mapCompletedJobsLookupToAgentLocalSql(input);
    if (statements.length === 0) {
      throw new Error('completed structure job lookup produced no statements');
    }

    const rows = await this.executor.query(statements[0]);
    const result = mapCompletedJobRows(rows);
    if (!result.ok) {
      throw new Error(result.errors.join('; '));
    }

    return result.completedJobs;
  }

  async enqueueJobs(jobs: StructureJobs): Promise<StructureJobEnqueueResult> {
    const statements = mapStructureJobsToAgentLocalSql(jobs);
    if (jobs.length > 0 && statements.length === 0) {
      return {
        ok: false,
        enqueuedCount: 0,
        errors: ['structure job enqueue produced no statements'],
      };
    }

    const result = await executeStatements(
      this.executor,
      statements,
      'structure job enqueue failed',
    );

    const { executedCount, ...portResult } = result;

    return {
      ...portResult,
      enqueuedCount: executedCount,
    };
  }
}

export class AgentLocalNextOpenDigestPreparationAdapter implements NextOpenDigestPreparationPort {
  private readonly executor: SchedulerAgentLocalSqlExecutor;

  constructor(executor: SchedulerAgentLocalSqlExecutor) {
    this.executor = executor;
  }

  async prepareDigest(digestPreparation: NextOpenDigestPreparation): Promise<WorkerSchedulerPortResult> {
    const statements = mapNextOpenDigestPreparationToAgentLocalSql(digestPreparation);
    if (statements.length === 0) {
      return {
        ok: false,
        errors: ['next_open digest agent-local SQL preparation produced no statements'],
      };
    }

    const { executedCount: _executedCount, ...result } = await executeStatements(
      this.executor,
      statements,
      'next_open digest agent-local SQL preparation failed',
    );
    return result;
  }
}

export function mapBlockChangedOutputToAgentLocalSql(
  output: BlockChangedOutput,
): SchedulerAgentLocalSqlStatement[] {
  const blockSaveStatements = output.savedBlocks.map((savedBlock): SchedulerAgentLocalSqlStatement => ({
    sql: [
      'insert into agent_local_block_save_intents',
      '(block_id, note_id, section_id, content_hash, saved_at)',
      'values (?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      savedBlock.blockId,
      savedBlock.noteId,
      savedBlock.sectionId,
      savedBlock.contentHash,
      savedBlock.savedAt,
    ],
  }));

  const editEventStatement: SchedulerAgentLocalSqlStatement = {
    sql: [
      'insert into agent_local_edit_events',
      '(event_type, block_id, note_id, section_id, occurred_at, previous_content_hash, content_hash)',
      'values (?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      output.editEvent.type,
      output.editEvent.blockId,
      output.editEvent.noteId,
      output.editEvent.sectionId,
      output.editEvent.occurredAt,
      output.editEvent.previousContentHash ?? null,
      output.editEvent.contentHash,
    ],
  };

  const dirtyScopeStatement: SchedulerAgentLocalSqlStatement = {
    sql: [
      'insert into agent_local_dirty_scope_marks',
      '(target_scope, note_id, section_id, content_hash, is_dirty, marked_at)',
      'values (?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      output.dirtyScopeMark.targetScope,
      output.dirtyScopeMark.noteId,
      output.dirtyScopeMark.sectionId,
      output.dirtyScopeMark.contentHash,
      output.dirtyScopeMark.isDirty ? 1 : 0,
      output.dirtyScopeMark.markedAt,
    ],
  };

  const lightweightIndexStatements = output.lightweightIndexUpdate === undefined
    ? []
    : [{
        sql: [
          'insert into agent_local_lightweight_index_updates',
          '(block_id, note_id, section_id, content_hash, updated_at)',
          'values (?, ?, ?, ?, ?)',
        ].join(' '),
        args: [
          output.lightweightIndexUpdate.blockId,
          output.lightweightIndexUpdate.noteId,
          output.lightweightIndexUpdate.sectionId,
          output.lightweightIndexUpdate.contentHash,
          output.lightweightIndexUpdate.updatedAt,
        ],
      }];

  return [
    ...blockSaveStatements,
    editEventStatement,
    dirtyScopeStatement,
    ...lightweightIndexStatements,
  ];
}

export function mapStructureJobsToAgentLocalSql(
  jobs: StructureJobs,
): SchedulerAgentLocalSqlStatement[] {
  return jobs.map((job): SchedulerAgentLocalSqlStatement => ({
    sql: [
      'insert into agent_local_structure_jobs',
      '(id, workspace_id, note_id, section_id, target_scope, trigger_reason, context_hash, status, priority, created_at, started_at, completed_at, whole_note_reason, skip_reason)',
      'values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      job.id,
      job.workspaceId,
      job.noteId,
      job.sectionId ?? null,
      job.targetScope,
      job.triggerReason,
      job.contextHash,
      job.status,
      job.priority,
      job.createdAt,
      job.startedAt ?? null,
      job.completedAt ?? null,
      job.wholeNoteReason ?? null,
      job.skipReason ?? null,
    ],
  }));
}

export function mapNextOpenDigestPreparationToAgentLocalSql(
  digest: NextOpenDigestPreparation,
): SchedulerAgentLocalSqlStatement[] {
  return [{
    sql: [
      'insert into agent_local_next_open_digest_preparation_intents',
      '(workspace_id, note_id, trigger_reason, recovered_job_count, prepared, payload_json)',
      'values (?, ?, ?, ?, ?, ?)',
    ].join(' '),
    args: [
      digest.workspaceId,
      digest.noteId,
      digest.triggerReason,
      digest.recoveredJobCount,
      digest.prepared ? 1 : 0,
      JSON.stringify(digest),
    ],
  }];
}

export function mapCompletedJobRows(
  rows: readonly Record<string, unknown>[],
): { ok: true; completedJobs: CompletedStructureJob[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const completedJobs: CompletedStructureJob[] = [];

  for (const [index, row] of rows.entries()) {
    const contextHash = readRequiredStringColumn(row, 'context_hash', 'contextHash');
    const status = readRequiredStringColumn(row, 'status');

    if (contextHash === undefined) {
      errors.push(`completed structure job rows[${index}].context_hash must be a non-empty string`);
    }
    if (status !== 'completed') {
      errors.push(`completed structure job rows[${index}].status must be completed`);
    }

    if (contextHash !== undefined && status === 'completed') {
      completedJobs.push({
        contextHash,
        status,
      } as CompletedStructureJob);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    completedJobs,
  };
}

function mapCompletedJobsLookupToAgentLocalSql(input: {
  workspaceId: string;
  noteId: string;
}): SchedulerAgentLocalSqlStatement[] {
  return [{
    sql: [
      'select context_hash, status',
      'from agent_local_structure_jobs',
      'where workspace_id = ? and note_id = ? and status = ?',
      'order by completed_at asc, created_at asc, id asc',
    ].join(' '),
    args: [
      input.workspaceId,
      input.noteId,
      'completed',
    ],
  }];
}

async function executeStatements(
  executor: SchedulerAgentLocalSqlExecutor,
  statements: readonly SchedulerAgentLocalSqlStatement[],
  errorPrefix: string,
): Promise<WorkerSchedulerPortResult & { executedCount: number }> {
  let executedCount = 0;
  try {
    for (const statement of statements) {
      await executor.execute(statement);
      executedCount += 1;
    }
  } catch (error) {
    return {
      ok: false,
      executedCount,
      errors: [toSqlErrorMessage(errorPrefix, error)],
    };
  }

  return {
    ok: true,
    executedCount,
    errors: [],
  };
}

function readRequiredStringColumn(
  row: Record<string, unknown>,
  primaryColumn: string,
  fallbackColumn?: string,
): string | undefined {
  const value = row[primaryColumn] ?? (fallbackColumn === undefined ? undefined : row[fallbackColumn]);
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && value === trimmed ? value : undefined;
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
