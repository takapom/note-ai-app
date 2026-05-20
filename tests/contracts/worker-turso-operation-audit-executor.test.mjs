import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TursoOperationAuditExecutor,
  validateOperationAuditStatements,
} from '../../apps/worker/src/ai-operations/tursoOperationAuditExecutor.ts';

test('Turso operation audit executor sends statements to client in order', async () => {
  const calls = [];
  const executor = new TursoOperationAuditExecutor({
    async execute(statement) {
      calls.push(statement);
    },
  });

  await executor.writeOperationAudit([
    {
      sql: 'insert into ai_operations values (?)',
      args: ['operation_001'],
    },
    {
      sql: 'insert into source_spans values (?, ?)',
      args: ['operation_001', 'block_001'],
    },
  ]);

  assert.deepEqual(calls, [
    {
      sql: 'insert into ai_operations values (?)',
      args: ['operation_001'],
    },
    {
      sql: 'insert into source_spans values (?, ?)',
      args: ['operation_001', 'block_001'],
    },
  ]);
});

test('Turso operation audit executor rejects empty statement lists before calling client', async () => {
  let callCount = 0;
  const executor = new TursoOperationAuditExecutor({
    async execute() {
      callCount += 1;
    },
  });

  await assert.rejects(
    () => executor.writeOperationAudit([]),
    /operation audit SQL statements must not be empty/,
  );
  assert.equal(callCount, 0);
});

test('Turso operation audit executor validates statement shape before calling client', async () => {
  let callCount = 0;
  const executor = new TursoOperationAuditExecutor({
    async execute() {
      callCount += 1;
    },
  });

  await assert.rejects(
    () =>
      executor.writeOperationAudit([
        {
          sql: ' ',
          args: ['operation_001'],
        },
        {
          sql: 'insert into source_spans values (?)',
          args: 'operation_001',
        },
      ]),
    /operation audit SQL statements\[0\]\.sql must be a non-empty string; operation audit SQL statements\[1\]\.args must be an array/,
  );
  assert.equal(callCount, 0);
});

test('Turso operation audit executor propagates client failure and stops at first failed statement', async () => {
  const calls = [];
  const executor = new TursoOperationAuditExecutor({
    async execute(statement) {
      calls.push(statement.sql);
      if (statement.sql.includes('source_spans')) {
        throw new Error('turso write failed');
      }
    },
  });

  await assert.rejects(
    () =>
      executor.writeOperationAudit([
        {
          sql: 'insert into ai_operations values (?)',
          args: ['operation_001'],
        },
        {
          sql: 'insert into source_spans values (?)',
          args: ['operation_001'],
        },
        {
          sql: 'insert into operation_projection values (?)',
          args: ['operation_001'],
        },
      ]),
    /turso write failed/,
  );

  assert.deepEqual(calls, [
    'insert into ai_operations values (?)',
    'insert into source_spans values (?)',
  ]);
});

test('Turso operation audit executor does not inspect operation policy or schema semantics', async () => {
  const calls = [];
  const executor = new TursoOperationAuditExecutor({
    async execute(statement) {
      calls.push(statement);
    },
  });

  await executor.writeOperationAudit([
    {
      sql: 'insert into opaque_runtime_statement values (?, ?)',
      args: ['runtime_passthrough_policy', 'runtime_passthrough_status'],
    },
  ]);

  assert.deepEqual(calls, [
    {
      sql: 'insert into opaque_runtime_statement values (?, ?)',
      args: ['runtime_passthrough_policy', 'runtime_passthrough_status'],
    },
  ]);
});

test('operation audit statement validation rejects non-array input', () => {
  assert.deepEqual(validateOperationAuditStatements(null), [
    'operation audit SQL statements must be an array',
  ]);
});
