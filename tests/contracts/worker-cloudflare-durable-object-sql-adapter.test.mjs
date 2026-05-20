import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CloudflareDurableObjectAgentLocalSqlExecutor,
} from '../../apps/worker/src/cloudflareDurableObjectSqlAdapter.ts';

test('Durable Object Agent-local SQL executor maps cursor rows and write counts', async () => {
  const calls = [];
  const executor = new CloudflareDurableObjectAgentLocalSqlExecutor({
    sql: {
      exec(sql, ...args) {
        calls.push({ sql, args });
        return {
          toArray() {
            return [{ id: 'structure_job_001' }, null, { id: 'structure_job_002' }];
          },
          rowsWritten: 2,
        };
      },
    },
  });

  const statement = { sql: 'select * from agent_local_structure_jobs where workspace_id = ?', args: ['workspace_001'] };
  const rows = await executor.query(statement);
  const write = await executor.write(statement);

  assert.deepEqual(rows, [{ id: 'structure_job_001' }, { id: 'structure_job_002' }]);
  assert.deepEqual(write, { rowsAffected: 2, changes: 2 });
  assert.deepEqual(calls, [statement, statement]);
});

test('Durable Object Agent-local SQL executor accepts direct sql storage and row result shapes', async () => {
  const executor = new CloudflareDurableObjectAgentLocalSqlExecutor({
    exec() {
      return {
        rows: [{ memory_id: 'memory_001' }],
        changes: 1,
      };
    },
  });

  assert.deepEqual(await executor.query({ sql: 'select * from agent_local_operation_audit_recovery_queue', args: [] }), [
    { memory_id: 'memory_001' },
  ]);
  assert.deepEqual(await executor.write({ sql: 'insert into agent_local_operation_audit_recovery_queue values (?)', args: ['x'] }), {
    changes: 1,
  });
});

test('Durable Object Agent-local SQL executor accepts storage-like objects with proxied sql access', async () => {
  const storage = new Proxy({}, {
    has(_target, key) {
      return key !== 'sql';
    },
    get(_target, key) {
      if (key !== 'sql') return undefined;
      return {
        exec() {
          return {
            rows: [{ id: 'proxied_sql_storage' }],
          };
        },
      };
    },
  });
  const executor = new CloudflareDurableObjectAgentLocalSqlExecutor(storage);

  assert.deepEqual(await executor.query({ sql: 'select * from agent_local_structure_jobs', args: [] }), [
    { id: 'proxied_sql_storage' },
  ]);
});

test('Durable Object Agent-local SQL executor rejects missing SQL storage', () => {
  assert.throws(
    () => new CloudflareDurableObjectAgentLocalSqlExecutor({}),
    /Durable Object Agent-local SQL storage is not configured/,
  );
});
