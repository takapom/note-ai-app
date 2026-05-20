import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createDurableObjectAgentLocalSchemaInitializeStatements,
  createDurableObjectAgentLocalSchemaResetStatements,
  durableObjectAgentLocalSchemaTableNames,
  runDurableObjectAgentLocalSchemaCommand,
  validateDurableObjectAgentLocalSchemaCommand,
} from '../../apps/worker/src/runtime/cloudflare/durableObjectAgentLocalSchema.ts';
import {
  agentLocalTableNames,
  agentLocalTemporarySchema,
} from '../fixtures/worker-agent-local-schema-fixture.mjs';

const root = new URL('../../', import.meta.url);

test('Durable Object Agent-local schema init statements cover only temporary tables', () => {
  const statements = createDurableObjectAgentLocalSchemaInitializeStatements();

  assert.deepEqual([...durableObjectAgentLocalSchemaTableNames].sort(), agentLocalTableNames());
  assert.equal(statements.length, agentLocalTableNames().length);

  for (const statement of statements) {
    assert.deepEqual(statement.args, []);
    assert.doesNotMatch(statement.sql, /\b(?:notes|sections|blocks|memory_items|ai_operations|source_spans|semantic_units|semantic_edges)\b/i);

    const create = parseCreateTable(statement.sql);
    assert.ok(create.table.startsWith('agent_local_'));
    assert.notEqual(agentLocalTemporarySchema.tables[create.table], undefined);
    for (const column of agentLocalTemporarySchema.tables[create.table].columns) {
      assert.ok(create.columns.includes(column), `${create.table}.${column} must be initialized`);
    }
  }
});

test('Durable Object Agent-local schema reset drops only known temporary tables before init', () => {
  const statements = createDurableObjectAgentLocalSchemaResetStatements();
  const expectedTables = agentLocalTableNames();
  const dropStatements = statements.slice(0, expectedTables.length);
  const initStatements = statements.slice(expectedTables.length);

  assert.deepEqual(dropStatements.map((statement) => parseDropTable(statement.sql)).sort(), expectedTables);
  assert.deepEqual(
    initStatements.map((statement) => parseCreateTable(statement.sql).table).sort(),
    expectedTables,
  );
  for (const statement of statements) {
    assert.deepEqual(statement.args, []);
    assert.doesNotMatch(statement.sql, /\b(?:notes|sections|blocks|memory_items|ai_operations|source_spans|semantic_units|semantic_edges)\b/i);
  }
});

test('Durable Object Agent-local schema command is local gated and serializable', async () => {
  const executed = [];
  const executor = {
    async execute(statement) {
      executed.push(statement);
      return {};
    },
  };

  assert.deepEqual(validateDurableObjectAgentLocalSchemaCommand({
    action: 'initialize',
    purpose: 'local_verification',
  }), []);
  assert.deepEqual(validateDurableObjectAgentLocalSchemaCommand({
    action: 'initialize',
    purpose: 'local_verification',
    callback: () => undefined,
  }), [
    'callback is not an allowed Agent-local schema command field',
    'command.callback must contain only serializable values',
  ]);

  const gated = await runDurableObjectAgentLocalSchemaCommand({
    executor,
    command: { action: 'initialize', purpose: 'local_verification' },
    localVerificationEnabled: false,
  });
  assert.deepEqual(gated, {
    ok: false,
    action: 'initialize',
    initializedTables: [],
    droppedTables: [],
    errors: ['Agent-local schema command is available only for local verification'],
  });
  assert.deepEqual(executed, []);

  const initialized = await runDurableObjectAgentLocalSchemaCommand({
    executor,
    command: { action: 'initialize', purpose: 'local_verification' },
    localVerificationEnabled: true,
  });
  assert.equal(initialized.ok, true);
  assert.deepEqual([...initialized.initializedTables].sort(), agentLocalTableNames());
  assert.deepEqual(initialized.droppedTables, []);
  assert.equal(executed.length, agentLocalTableNames().length);
});

test('Durable Object Agent-local schema reset reports stable result and hides SQL errors', async () => {
  const executed = [];
  const reset = await runDurableObjectAgentLocalSchemaCommand({
    executor: {
      async execute(statement) {
        executed.push(statement);
        return {};
      },
    },
    command: { action: 'reset', purpose: 'local_verification' },
    localVerificationEnabled: true,
  });

  assert.equal(reset.ok, true);
  assert.deepEqual([...reset.droppedTables].sort(), agentLocalTableNames());
  assert.deepEqual([...reset.initializedTables].sort(), agentLocalTableNames());
  assert.equal(executed.length, agentLocalTableNames().length * 2);

  const failed = await runDurableObjectAgentLocalSchemaCommand({
    executor: {
      async execute() {
        throw new Error('raw sqlite failure with local path');
      },
    },
    command: { action: 'reset', purpose: 'local_verification' },
    localVerificationEnabled: true,
  });
  assert.deepEqual(failed, {
    ok: false,
    action: 'reset',
    initializedTables: [],
    droppedTables: [],
    errors: ['Agent-local schema command failed'],
  });
});

test('Durable Object classes expose schema command only as local-gated RPC DTO surface', async () => {
  const source = await readFile(new URL('apps/worker/src/runtime/cloudflare/cloudflareDurableObjectAgents.ts', root), 'utf8');

  assert.match(source, /applyAgentLocalSchemaCommand\(\s*input:\s*DurableObjectAgentLocalSchemaCommand/s);
  assert.match(source, /Promise<DurableObjectAgentLocalSchemaResult>/);
  assert.match(source, /LOCAL_AGENT_SMOKE_ENABLED\s*===\s*'1'/);
  assert.doesNotMatch(source, /\b(?:create table|drop table|insert into|update\s+\w+\s+set|delete from)\b/i);
  assert.doesNotMatch(source, /\b(?:notes|sections|blocks)\s+(?:set|values)\b/i);
});

function parseCreateTable(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^create table if not exists ([a-z_][a-z0-9_]*) \((.+)\)$/i);
  assert.notEqual(match, null, `expected create table statement: ${sql}`);

  return {
    table: match[1],
    columns: splitColumnDefinitions(match[2]),
  };
}

function parseDropTable(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^drop table if exists ([a-z_][a-z0-9_]*)$/i);
  assert.notEqual(match, null, `expected drop table statement: ${sql}`);
  return match[1];
}

function splitColumnDefinitions(value) {
  return value
    .split(',')
    .map((column) => column.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function normalizeSql(sql) {
  return sql.trim().replace(/\s+/g, ' ');
}
