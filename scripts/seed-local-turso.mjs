#!/usr/bin/env node

import process from 'node:process';

import { createClient } from '@libsql/client';

import {
  canonicalSchemaFixture,
  validateCanonicalSchemaFixture,
} from '../tests/fixtures/worker-canonical-schema-fixture.mjs';
import {
  localSmokeCanonicalFixtureManifest,
  planLocalSmokeCanonicalSeedReset,
} from '../tests/fixtures/worker-local-smoke-canonical-fixture.mjs';

const defaultDatabaseUrl = 'http://127.0.0.1:8080';

async function main() {
  const config = readConfig();
  const schemaErrors = validateCanonicalSchemaFixture();
  if (schemaErrors.length > 0) {
    throw new Error(`canonical schema fixture is invalid: ${schemaErrors.join('; ')}`);
  }

  const client = createClient(
    config.authToken === undefined
      ? { url: config.databaseUrl }
      : { url: config.databaseUrl, authToken: config.authToken },
  );
  try {
    await ensureCanonicalSchema(client);
    await resetAndSeedCanonicalFixture(client);
  } finally {
    client.close();
  }

  process.stdout.write([
    'local Turso canonical seed complete',
    `url=${config.databaseUrl}`,
    `workspaceId=${localSmokeCanonicalFixtureManifest.workspaceId}`,
    `noteId=${localSmokeCanonicalFixtureManifest.noteId}`,
    `blockId=${localSmokeCanonicalFixtureManifest.blockId}`,
    '',
  ].join('\n'));
}

async function ensureCanonicalSchema(client) {
  for (const tableDefinition of Object.values(canonicalSchemaFixture.tables)) {
    await client.execute(toCreateTableIfNotExistsSql(tableDefinition.createSql));
  }
}

async function resetAndSeedCanonicalFixture(client) {
  const plan = planLocalSmokeCanonicalSeedReset();
  for (const statement of plan.statements) {
    await client.execute({
      sql: statement.sql,
      args: statement.args,
    });
  }
}

function toCreateTableIfNotExistsSql(sql) {
  return sql.replace(/^create table\s+([a-z][a-z0-9_]*)\b/i, 'create table if not exists $1');
}

function readConfig() {
  const databaseUrl = readArgValue('--url')
    ?? readOptionalStringEnv('WORKER_LOCAL_TURSO_DATABASE_URL')
    ?? readOptionalStringEnv('LOCAL_TURSO_DATABASE_URL')
    ?? readOptionalStringEnv('TURSO_DATABASE_URL')
    ?? readOptionalStringEnv('LIBSQL_DATABASE_URL')
    ?? defaultDatabaseUrl;
  const authToken = readArgValue('--auth-token')
    ?? readOptionalStringEnv('WORKER_LOCAL_TURSO_AUTH_TOKEN')
    ?? readOptionalStringEnv('LOCAL_TURSO_AUTH_TOKEN')
    ?? readOptionalStringEnv('TURSO_AUTH_TOKEN')
    ?? readOptionalStringEnv('LIBSQL_AUTH_TOKEN');

  return {
    databaseUrl,
    ...(authToken === undefined ? {} : { authToken }),
  };
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return normalizeString(process.argv[index + 1]);
}

function readOptionalStringEnv(name) {
  return normalizeString(process.env[name]);
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

main().catch((error) => {
  process.stderr.write(`local Turso seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
