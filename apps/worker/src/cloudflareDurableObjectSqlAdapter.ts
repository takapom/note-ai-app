// Cloudflare Durable Object-local SQL executor for Agent-local temporary state.
// Authority: docs/contracts/cloudflare-agents-turso.md

import type {
  SchedulerAgentLocalSqlExecutor,
  SchedulerAgentLocalSqlStatement,
} from './schedulerAgentLocalSqlAdapter.ts';

export interface CloudflareDurableObjectSqlStorage {
  exec(query: string, ...bindings: unknown[]): unknown;
}

export interface CloudflareDurableObjectSqlStorageContainer {
  readonly sql?: unknown;
}

export interface CloudflareDurableObjectStateLike {
  readonly storage?: unknown;
}

export type CloudflareDurableObjectSqlExecutorInput =
  | { readonly state: CloudflareDurableObjectStateLike }
  | { readonly storage: CloudflareDurableObjectSqlStorageContainer }
  | { readonly sql: CloudflareDurableObjectSqlStorage };

export interface CloudflareDurableObjectSqlExecutionResult {
  rows: readonly Record<string, unknown>[];
  rowsRead?: number;
  rowsWritten?: number;
  changes?: number;
}

export interface CloudflareDurableObjectSqlWriteResult {
  rowsAffected?: number;
  changes?: number;
}

export class CloudflareDurableObjectSqlExecutor implements SchedulerAgentLocalSqlExecutor {
  private readonly sql: CloudflareDurableObjectSqlStorage;

  constructor(input: CloudflareDurableObjectSqlExecutorInput) {
    this.sql = readSqlStorageFromInput(input);
  }

  async execute(
    statement: SchedulerAgentLocalSqlStatement,
  ): Promise<CloudflareDurableObjectSqlExecutionResult> {
    const checked = validateStatement(statement);

    try {
      const result = await this.sql.exec(checked.sql, ...checked.args);
      return normalizeSqlExecutionResult(result);
    } catch (error) {
      throw normalizeCloudflareDurableObjectSqlError(error);
    }
  }

  async query(statement: SchedulerAgentLocalSqlStatement): Promise<readonly Record<string, unknown>[]> {
    const result = await this.execute(statement);
    return result.rows;
  }

  async write(statement: SchedulerAgentLocalSqlStatement): Promise<CloudflareDurableObjectSqlWriteResult> {
    const result = await this.execute(statement);
    return readWriteResult(result);
  }
}

export class CloudflareDurableObjectAgentLocalSqlExecutor extends CloudflareDurableObjectSqlExecutor {
  constructor(input: CloudflareDurableObjectSqlExecutorInput | unknown) {
    super(normalizeExecutorInput(input));
  }
}

export function createCloudflareDurableObjectSqlExecutor(
  input: CloudflareDurableObjectSqlExecutorInput,
): CloudflareDurableObjectSqlExecutor {
  return new CloudflareDurableObjectSqlExecutor(input);
}

export function normalizeCloudflareDurableObjectSqlError(error: unknown): Error {
  const message = readErrorMessage(error);
  const missingTable = message === undefined ? undefined : readMissingTableName(message);
  if (missingTable !== undefined) {
    return new Error(`Durable Object Agent-local SQL missing table: ${missingTable}`);
  }

  return new Error('Durable Object Agent-local SQL execution failed');
}

function readSqlStorageFromInput(
  input: CloudflareDurableObjectSqlExecutorInput,
): CloudflareDurableObjectSqlStorage {
  const candidate = readSqlCandidate(input);
  if (!isSqlStorage(candidate)) {
    throw new Error('Durable Object Agent-local SQL storage is not configured');
  }

  return candidate;
}

function normalizeExecutorInput(input: CloudflareDurableObjectSqlExecutorInput | unknown): CloudflareDurableObjectSqlExecutorInput {
  if (isRecord(input)) {
    if ('state' in input || 'storage' in input || 'sql' in input) {
      return input as CloudflareDurableObjectSqlExecutorInput;
    }
    if (isSqlStorage(input)) {
      return { sql: input };
    }
  }

  return { storage: {} };
}

function readSqlCandidate(input: CloudflareDurableObjectSqlExecutorInput): unknown {
  if ('sql' in input) {
    return input.sql;
  }
  if ('storage' in input) {
    return input.storage.sql;
  }
  return isRecord(input.state.storage) ? input.state.storage.sql : undefined;
}

function validateStatement(statement: SchedulerAgentLocalSqlStatement): SchedulerAgentLocalSqlStatement {
  if (typeof statement.sql !== 'string' || statement.sql.trim().length === 0) {
    throw new Error('Durable Object Agent-local SQL statement.sql must be a non-empty string');
  }
  if (!Array.isArray(statement.args)) {
    throw new Error('Durable Object Agent-local SQL statement.args must be an array');
  }

  return statement;
}

function normalizeSqlExecutionResult(result: unknown): CloudflareDurableObjectSqlExecutionResult {
  const rows = readRows(result);
  return {
    rows,
    ...numberProperty(result, 'rowsRead', 'rowsRead'),
    ...numberProperty(result, 'rowsWritten', 'rowsWritten'),
    ...numberProperty(result, 'changes', 'changes'),
  };
}

function readRows(result: unknown): readonly Record<string, unknown>[] {
  if (hasToArray(result)) {
    return normalizeRows(result.toArray(), readColumnNames(result));
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return normalizeRows(result.rows, readColumnNames(result));
  }
  if (isRecord(result) && Array.isArray(result.results)) {
    return normalizeRows(result.results, readColumnNames(result));
  }
  if (isIterable(result)) {
    return normalizeRows(Array.from(result), readColumnNames(result));
  }
  if (Array.isArray(result)) {
    return normalizeRows(result, undefined);
  }

  return [];
}

function normalizeRows(
  rows: readonly unknown[],
  columnNames: readonly string[] | undefined,
): readonly Record<string, unknown>[] {
  return rows.flatMap((row): Record<string, unknown>[] => {
    if (isRecord(row)) {
      return [row];
    }
    if (Array.isArray(row) && columnNames !== undefined) {
      return [row.reduce<Record<string, unknown>>((mapped, value, index) => {
        const columnName = columnNames[index];
        if (columnName !== undefined) {
          mapped[columnName] = value;
        }
        return mapped;
      }, {})];
    }

    return [];
  });
}

function readColumnNames(value: unknown): readonly string[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { columnNames } = value;
  if (Array.isArray(columnNames) && columnNames.every((columnName) => typeof columnName === 'string')) {
    return columnNames;
  }
  if (hasToArray(columnNames)) {
    const names = columnNames.toArray();
    return Array.isArray(names) && names.every((columnName) => typeof columnName === 'string')
      ? names
      : undefined;
  }

  return undefined;
}

function readWriteResult(
  result: CloudflareDurableObjectSqlExecutionResult,
): CloudflareDurableObjectSqlWriteResult {
  if (result.rowsWritten === undefined && result.changes === undefined) {
    return {};
  }

  const writeResult: CloudflareDurableObjectSqlWriteResult = {};
  if (result.rowsWritten !== undefined) {
    writeResult.rowsAffected = result.rowsWritten;
  }
  const changes = result.changes ?? result.rowsWritten;
  if (changes !== undefined) {
    writeResult.changes = changes;
  }
  return writeResult;
}

function readMissingTableName(message: string): string | undefined {
  const match = /\bno such table:\s*["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/i.exec(message)
    ?? /\btable\s+["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\s+does not exist\b/i.exec(message);
  return match?.[1];
}

function readErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return undefined;
}

function numberProperty<T extends string>(
  value: unknown,
  sourceKey: string,
  targetKey: T,
): { [key in T]?: number } {
  if (!isRecord(value)) {
    return {};
  }

  const candidate = value[sourceKey];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? { [targetKey]: candidate } as { [key in T]?: number }
    : {};
}

function isSqlStorage(value: unknown): value is CloudflareDurableObjectSqlStorage {
  return isRecord(value) && typeof value.exec === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasToArray(value: unknown): value is { toArray: () => unknown[] } {
  return isRecord(value) && typeof value.toArray === 'function';
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object'
    && value !== null
    && Symbol.iterator in value
    && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}
