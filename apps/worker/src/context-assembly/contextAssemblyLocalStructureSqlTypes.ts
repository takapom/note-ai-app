// SQL types for context assembly local structure projections.
// Authority: docs/contracts/context-assembly.md

export interface ContextAssemblyLocalStructureSqlStatement {
  sql: string;
  args: readonly unknown[];
}

export interface ContextAssemblyLocalStructureSqlExecutor {
  query(statement: ContextAssemblyLocalStructureSqlStatement): Promise<readonly Record<string, unknown>[]>;
}
