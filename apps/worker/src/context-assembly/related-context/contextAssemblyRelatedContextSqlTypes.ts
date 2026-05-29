// SQL types for context assembly related context projections.
// Authority: docs/contracts/context-assembly.md

export interface ContextAssemblyRelatedContextSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ContextAssemblyRelatedContextSqlExecutor {
  query(statement: ContextAssemblyRelatedContextSqlStatement): Promise<readonly Record<string, unknown>[]>;
}
