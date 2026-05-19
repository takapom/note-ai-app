// Durable Object Agent-local SQL schema commands for local verification.
// Authority: docs/contracts/cloudflare-agents-turso.md

import type {
  SchedulerAgentLocalSqlExecutor,
  SchedulerAgentLocalSqlStatement,
} from './schedulerAgentLocalSqlAdapter.ts';

export type DurableObjectAgentLocalSchemaAction = 'initialize' | 'reset';

export interface DurableObjectAgentLocalSchemaCommand {
  action: DurableObjectAgentLocalSchemaAction;
  purpose: 'local_verification';
}

export interface DurableObjectAgentLocalSchemaResult {
  ok: boolean;
  action: DurableObjectAgentLocalSchemaAction;
  initializedTables: readonly string[];
  droppedTables: readonly string[];
  errors: readonly string[];
}

interface AgentLocalTableDefinition {
  readonly name: string;
  readonly columns: readonly string[];
}

const AGENT_LOCAL_TABLES: readonly AgentLocalTableDefinition[] = Object.freeze([
  {
    name: 'agent_local_block_save_intents',
    columns: Object.freeze([
      'block_id text not null',
      'note_id text not null',
      'section_id text not null',
      'content_hash text not null',
      'saved_at real not null',
    ]),
  },
  {
    name: 'agent_local_edit_events',
    columns: Object.freeze([
      'event_type text not null',
      'block_id text not null',
      'note_id text not null',
      'section_id text not null',
      'occurred_at real not null',
      'previous_content_hash text',
      'content_hash text not null',
    ]),
  },
  {
    name: 'agent_local_dirty_scope_marks',
    columns: Object.freeze([
      'target_scope text not null',
      'note_id text not null',
      'section_id text',
      'content_hash text not null',
      'is_dirty integer not null',
      'marked_at real not null',
    ]),
  },
  {
    name: 'agent_local_lightweight_index_updates',
    columns: Object.freeze([
      'block_id text not null',
      'note_id text not null',
      'section_id text not null',
      'content_hash text not null',
      'updated_at real not null',
    ]),
  },
  {
    name: 'agent_local_structure_jobs',
    columns: Object.freeze([
      'id text primary key',
      'workspace_id text not null',
      'note_id text not null',
      'section_id text',
      'target_scope text not null',
      'trigger_reason text not null',
      'context_hash text not null',
      'status text not null',
      'priority text not null',
      'created_at real not null',
      'started_at real',
      'completed_at real',
      'whole_note_reason text',
      'skip_reason text',
      'failed_at real',
      'failure_message text',
    ]),
  },
  {
    name: 'agent_local_next_open_digest_preparation_intents',
    columns: Object.freeze([
      'workspace_id text not null',
      'note_id text not null',
      'trigger_reason text not null',
      'recovered_job_count integer not null',
      'prepared integer not null',
      'payload_json text not null',
    ]),
  },
  {
    name: 'agent_local_operation_audit_recovery_queue',
    columns: Object.freeze([
      'operation_id text not null',
      'workspace_id text not null',
      'note_id text not null',
      'structure_job_id text not null',
      'audit_record_json text not null',
      'failure_message text not null',
      'failed_at real not null',
    ]),
  },
]);

export const durableObjectAgentLocalSchemaTableNames: readonly string[] = Object.freeze(
  AGENT_LOCAL_TABLES.map((table) => table.name),
);

export function createDurableObjectAgentLocalSchemaInitializeStatements(): readonly SchedulerAgentLocalSqlStatement[] {
  return AGENT_LOCAL_TABLES.map((table) => ({
    sql: `create table if not exists ${table.name} (${table.columns.join(', ')})`,
    args: [],
  }));
}

export function createDurableObjectAgentLocalSchemaResetStatements(): readonly SchedulerAgentLocalSqlStatement[] {
  return [
    ...[...AGENT_LOCAL_TABLES].reverse().map((table) => ({
      sql: `drop table if exists ${table.name}`,
      args: [],
    })),
    ...createDurableObjectAgentLocalSchemaInitializeStatements(),
  ];
}

export function validateDurableObjectAgentLocalSchemaCommand(
  command: unknown,
): string[] {
  const errors: string[] = [];
  if (!isRecord(command)) {
    return ['Agent-local schema command must be a serializable object'];
  }

  const allowedKeys = new Set(['action', 'purpose']);
  for (const key of Object.keys(command)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${key} is not an allowed Agent-local schema command field`);
    }
  }
  if (command.action !== 'initialize' && command.action !== 'reset') {
    errors.push('action must be initialize or reset');
  }
  if (command.purpose !== 'local_verification') {
    errors.push('purpose must be local_verification');
  }
  validateSerializableValue(command, 'command', errors);

  return errors;
}

export async function runDurableObjectAgentLocalSchemaCommand(input: {
  executor: SchedulerAgentLocalSqlExecutor;
  command: unknown;
  localVerificationEnabled: boolean;
}): Promise<DurableObjectAgentLocalSchemaResult> {
  const action = readAction(input.command);
  if (!input.localVerificationEnabled) {
    return rejectedResult(action, ['Agent-local schema command is available only for local verification']);
  }

  const commandErrors = validateDurableObjectAgentLocalSchemaCommand(input.command);
  if (commandErrors.length > 0 || !isRecord(input.command)) {
    return rejectedResult(action, commandErrors);
  }

  const checkedAction = input.command.action as DurableObjectAgentLocalSchemaAction;
  const statements = checkedAction === 'reset'
    ? createDurableObjectAgentLocalSchemaResetStatements()
    : createDurableObjectAgentLocalSchemaInitializeStatements();
  const droppedTables: string[] = [];
  const initializedTables: string[] = [];

  try {
    for (const statement of statements) {
      await input.executor.execute(statement);
      const tableName = readStatementTableName(statement.sql);
      if (tableName === undefined) {
        continue;
      }
      if (/^\s*drop\s+table\b/i.test(statement.sql)) {
        droppedTables.push(tableName);
      }
      if (/^\s*create\s+table\b/i.test(statement.sql)) {
        initializedTables.push(tableName);
      }
    }
  } catch (error) {
    void error;
    return rejectedResult(checkedAction, ['Agent-local schema command failed']);
  }

  return {
    ok: true,
    action: checkedAction,
    initializedTables,
    droppedTables,
    errors: [],
  };
}

function rejectedResult(
  action: DurableObjectAgentLocalSchemaAction,
  errors: readonly string[],
): DurableObjectAgentLocalSchemaResult {
  return {
    ok: false,
    action,
    initializedTables: [],
    droppedTables: [],
    errors: [...errors],
  };
}

function readAction(command: unknown): DurableObjectAgentLocalSchemaAction {
  return isRecord(command) && command.action === 'reset' ? 'reset' : 'initialize';
}

function readStatementTableName(sql: string): string | undefined {
  const match = /^\s*(?:create\s+table\s+if\s+not\s+exists|drop\s+table\s+if\s+exists)\s+([a-z_][a-z0-9_]*)\b/i.exec(sql);
  return match?.[1];
}

function validateSerializableValue(value: unknown, path: string, errors: string[]): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(`${path} must not contain non-finite numbers`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSerializableValue(item, `${path}.${index}`, errors));
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      validateSerializableValue(child, `${path}.${key}`, errors);
    }
    return;
  }

  errors.push(`${path} must contain only serializable values`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
