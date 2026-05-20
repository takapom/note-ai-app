// Cloudflare Agent-local SQL executor surface (framework-owned, not scheduler-owned).
// Authority: docs/contracts/cloudflare-agents-turso.md

export interface CloudflareAgentLocalSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface CloudflareAgentLocalSqlExecutionResult {
  rows: readonly Record<string, unknown>[];
  rowsRead?: number;
  rowsWritten?: number;
  changes?: number;
}

export interface CloudflareAgentLocalSqlWriteResult {
  rowsAffected?: number;
  changes?: number;
}

export interface CloudflareAgentLocalSqlExecutor {
  execute(statement: CloudflareAgentLocalSqlStatement): Promise<CloudflareAgentLocalSqlExecutionResult>;
  query(statement: CloudflareAgentLocalSqlStatement): Promise<readonly Record<string, unknown>[]>;
  write(statement: CloudflareAgentLocalSqlStatement): Promise<CloudflareAgentLocalSqlWriteResult>;
}
