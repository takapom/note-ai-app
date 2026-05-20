import {
  mapNoteDocumentToSql,
} from '../../apps/worker/src/note-model/noteDocumentSqlAdapter.ts';
import {
  noteDocumentFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';
import {
  canonicalSchemaFixture,
} from './worker-canonical-schema-fixture.mjs';

const canonicalResetTableOrder = Object.freeze([
  'source_spans',
  'ai_operations',
  'operation_proposals',
  'memory_context_candidates',
  'memory_items',
  'semantic_unit_related_candidates',
  'semantic_unit_structure_snapshots',
  'semantic_unit_section_summaries',
  'semantic_edges',
  'semantic_units',
  'blocks',
  'sections',
  'notes',
]);

export const localSmokeCanonicalFixtureManifest = Object.freeze({
  role: 'local-smoke-canonical-fixture',
  authority: Object.freeze([
    'docs/contracts/backend-runtime.md',
    'docs/contracts/cloudflare-agents-turso.md',
  ]),
  workspaceId: noteDocumentFixture.note.workspaceId,
  noteId: noteDocumentFixture.note.id,
  blockId: noteDocumentFixture.blocks.find((block) => block.origin === 'user' && block.type === 'paragraph')?.id,
});

export function planLocalSmokeCanonicalSeedReset(input = {}) {
  const document = structuredClone(input.document ?? noteDocumentFixture);
  const resetStatements = canonicalResetTableOrder.map((tableName) => ({
    sql: `delete from ${tableName}`,
    args: [],
  }));
  const seedStatements = mapNoteDocumentToSql(document);

  return deepFreeze({
    role: 'local-smoke-canonical-seed-reset-plan',
    resetStatements,
    seedStatements,
    statements: [
      ...resetStatements,
      ...seedStatements,
    ],
    manifest: {
      workspaceId: document.note.workspaceId,
      noteId: document.note.id,
      blockIds: document.blocks.map((block) => block.id),
    },
  });
}

export function createLocalSmokeCanonicalFixtureSqlClient(input = {}) {
  const plan = planLocalSmokeCanonicalSeedReset(input);
  const rowsByTable = new Map(
    Object.keys(canonicalSchemaFixture.tables).map((tableName) => [tableName, []]),
  );
  const executed = [];

  const fixture = {
    client: {
      async execute(statement) {
        executed.push(cloneStatement(statement));
        return executeStatement(rowsByTable, statement);
      },
    },
    executed,
    seedPlan: plan,
    async resetAndSeed(nextPlan = plan) {
      for (const statement of nextPlan.statements) {
        await fixture.client.execute(statement);
      }
    },
    snapshot() {
      return snapshotRows(rowsByTable);
    },
    get document() {
      return documentFromRows(rowsByTable, plan.manifest.noteId);
    },
  };

  return fixture;
}

function executeStatement(rowsByTable, statement) {
  assertStatement(statement);
  const sql = normalizeSql(statement.sql);

  if (/^delete from\b/i.test(sql)) {
    return executeDelete(rowsByTable, sql, statement.args);
  }
  if (/^insert into\b/i.test(sql)) {
    return executeInsert(rowsByTable, sql, statement.args);
  }
  if (/^select\b/i.test(sql)) {
    return { rows: executeSelect(rowsByTable, sql, statement.args) };
  }

  throw new Error(`unexpected local canonical fixture SQL: ${statement.sql}`);
}

function executeDelete(rowsByTable, sql, args) {
  const tableName = readDeleteTableName(sql);
  const rows = readRows(rowsByTable, tableName);

  if (!/\bwhere\b/i.test(sql)) {
    rowsByTable.set(tableName, []);
    return { rowsAffected: rows.length, changes: rows.length };
  }

  if (/\bnote_id\s*=\s*\?/i.test(sql)) {
    const noteId = args[0];
    const kept = rows.filter((row) => row.note_id !== noteId);
    rowsByTable.set(tableName, kept);
    return { rowsAffected: rows.length - kept.length, changes: rows.length - kept.length };
  }

  throw new Error(`unexpected local canonical fixture delete SQL: ${sql}`);
}

function executeInsert(rowsByTable, sql, args) {
  const { tableName, columns } = readInsert(sql);
  const rows = readRows(rowsByTable, tableName);
  const row = Object.fromEntries(columns.map((column, index) => [column, normalizeSqlValue(args[index])]));
  const conflictColumn = readConflictColumn(sql) ?? primaryColumnForTable(tableName);
  const existingIndex = conflictColumn === undefined
    ? -1
    : rows.findIndex((candidate) => candidate[conflictColumn] === row[conflictColumn]);

  if (existingIndex >= 0) {
    rows.splice(existingIndex, 1, { ...rows[existingIndex], ...row });
  } else {
    rows.push(row);
  }

  return { rowsAffected: 1, changes: 1 };
}

function executeSelect(rowsByTable, sql, args) {
  if (/\bfrom notes\b/i.test(sql) && !/\bjoin\b/i.test(sql)) {
    return selectNotes(rowsByTable, sql, args);
  }
  if (/\bfrom sections\b/i.test(sql)) {
    return selectSections(rowsByTable, sql, args);
  }
  if (/\bfrom blocks\b/i.test(sql)) {
    return selectBlocks(rowsByTable, sql, args);
  }
  if (/\bfrom semantic_units\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom semantic_unit_section_summaries\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom semantic_unit_structure_snapshots\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom semantic_unit_related_candidates\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom memory_context_candidates\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom memory_items\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom operation_proposals\b/i.test(sql)) {
    return [];
  }
  if (/\bfrom ai_operations\b/i.test(sql)) {
    return [];
  }

  throw new Error(`unexpected local canonical fixture select SQL: ${sql}`);
}

function selectNotes(rowsByTable, sql, args) {
  let rows = readRows(rowsByTable, 'notes');
  if (/\bworkspace_id\s*=\s*\?\s+and\s+(?:notes\.)?id\s*=\s*\?/i.test(sql)) {
    rows = rows.filter((row) => row.workspace_id === args[0] && row.id === args[1]);
  }
  return rows.map(cloneRow);
}

function selectSections(rowsByTable, sql, args) {
  let rows = readRows(rowsByTable, 'sections');

  if (/\bwhere\s+note_id\s*=\s*\?/i.test(sql)) {
    rows = rows.filter((row) => row.note_id === args[0]);
  } else if (/\bnotes\.workspace_id\s*=\s*\?\s+and\s+sections\.note_id\s*=\s*\?/i.test(sql)) {
    rows = rows.filter((row) => noteBelongsToWorkspace(rowsByTable, row.note_id, args[0]) && row.note_id === args[1]);
  }
  if (/\bsections\.heading_level is not null\b/i.test(sql)) {
    rows = rows.filter((row) => row.heading_level !== null && row.heading_level !== undefined);
  }
  if (/\bsections\.title is not null\b/i.test(sql)) {
    rows = rows.filter((row) => row.title !== null && row.title !== undefined);
  }

  return rows
    .slice()
    .sort(comparePositionThenId)
    .map(cloneRow);
}

function selectBlocks(rowsByTable, sql, args) {
  let rows = readRows(rowsByTable, 'blocks');

  if (/\bwhere\s+note_id\s*=\s*\?/i.test(sql)) {
    rows = rows.filter((row) => row.note_id === args[0]);
  } else if (/\bblocks\.note_id\s*=\s*\?\s+and\s+blocks\.section_id\s*=\s*\?/i.test(sql)) {
    rows = rows.filter((row) => (
      noteBelongsToWorkspace(rowsByTable, row.note_id, args[0]) &&
      row.note_id === args[1] &&
      row.section_id === args[2] &&
      row.origin === args[3]
    ));
  } else if (/\bblocks\.note_id\s*=\s*\?\s+and\s+blocks\.origin\s*=\s*\?/i.test(sql)) {
    rows = rows.filter((row) => (
      noteBelongsToWorkspace(rowsByTable, row.note_id, args[0]) &&
      row.note_id === args[1] &&
      row.origin === args[2]
    ));
  }

  return rows
    .slice()
    .sort(comparePositionThenId)
    .map(cloneRow);
}

function noteBelongsToWorkspace(rowsByTable, noteId, workspaceId) {
  return readRows(rowsByTable, 'notes').some((note) => note.id === noteId && note.workspace_id === workspaceId);
}

function documentFromRows(rowsByTable, noteId) {
  const note = readRows(rowsByTable, 'notes').find((row) => row.id === noteId);
  if (note === undefined) {
    return undefined;
  }

  return {
    note: {
      id: note.id,
      workspaceId: note.workspace_id,
      title: note.title,
      ...(note.description_user === null ? {} : { descriptionUser: note.description_user }),
      ...(note.description_ai === null ? {} : { descriptionAi: note.description_ai }),
      ...(note.description_ai_approved === null ? {} : { descriptionAiApproved: Boolean(note.description_ai_approved) }),
      ...(note.description_effective === null ? {} : { descriptionEffective: note.description_effective }),
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    },
    sections: readRows(rowsByTable, 'sections')
      .filter((row) => row.note_id === noteId)
      .sort(comparePositionThenId)
      .map(sectionFromRow),
    blocks: readRows(rowsByTable, 'blocks')
      .filter((row) => row.note_id === noteId)
      .sort(comparePositionThenId)
      .map(blockFromRow),
  };
}

function sectionFromRow(row) {
  return {
    id: row.id,
    noteId: row.note_id,
    ...(row.parent_section_id === null ? {} : { parentSectionId: row.parent_section_id }),
    ...(row.heading_block_id === null ? {} : { headingBlockId: row.heading_block_id }),
    ...(row.heading_level === null ? {} : { headingLevel: row.heading_level }),
    ...(row.title === null ? {} : { title: row.title }),
    ...(row.description_ai === null ? {} : { descriptionAi: row.description_ai }),
    contentHash: row.content_hash,
    ...(row.last_structured_hash === null ? {} : { lastStructuredHash: row.last_structured_hash }),
    ...(row.last_structured_at === null ? {} : { lastStructuredAt: row.last_structured_at }),
    isDirty: false,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function blockFromRow(row) {
  return {
    id: row.id,
    noteId: row.note_id,
    ...(row.section_id === null ? {} : { sectionId: row.section_id }),
    ...(row.parent_block_id === null ? {} : { parentBlockId: row.parent_block_id }),
    type: row.type,
    contentJson: typeof row.content_json === 'string' ? JSON.parse(row.content_json) : structuredClone(row.content_json),
    plainText: row.plain_text,
    position: row.position,
    origin: row.origin,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readRows(rowsByTable, tableName) {
  const rows = rowsByTable.get(tableName);
  if (rows === undefined) {
    throw new Error(`local canonical fixture table is not configured: ${tableName}`);
  }
  return rows;
}

function readDeleteTableName(sql) {
  const match = sql.match(/^delete from\s+([a-z][a-z0-9_]*)/i);
  if (match === null) {
    throw new Error(`invalid delete SQL: ${sql}`);
  }
  return match[1];
}

function readInsert(sql) {
  const match = sql.match(/^insert into\s+([a-z][a-z0-9_]*)\s*\(([^)]*)\)/i);
  if (match === null) {
    throw new Error(`invalid insert SQL: ${sql}`);
  }
  return {
    tableName: match[1],
    columns: match[2].split(',').map((column) => column.trim()),
  };
}

function readConflictColumn(sql) {
  return sql.match(/\bon conflict\s*\(\s*([a-z][a-z0-9_]*)\s*\)/i)?.[1];
}

function primaryColumnForTable(tableName) {
  if (tableName === 'operation_proposals') {
    return 'operation_id';
  }
  if (tableName === 'source_spans') {
    return undefined;
  }
  return canonicalSchemaFixture.tables[tableName]?.columns.includes('id') ? 'id' : undefined;
}

function snapshotRows(rowsByTable) {
  return Object.fromEntries(
    [...rowsByTable.entries()].map(([tableName, rows]) => [tableName, rows.map(cloneRow)]),
  );
}

function cloneStatement(statement) {
  return {
    sql: statement.sql,
    args: [...statement.args],
  };
}

function cloneRow(row) {
  return structuredClone(row);
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function normalizeSqlValue(value) {
  return value === undefined ? null : value;
}

function assertStatement(statement) {
  if (
    typeof statement !== 'object' ||
    statement === null ||
    typeof statement.sql !== 'string' ||
    !Array.isArray(statement.args)
  ) {
    throw new Error('local canonical fixture SQL statement must include sql and args');
  }
}

function comparePositionThenId(left, right) {
  const leftPosition = typeof left.position === 'number' ? left.position : 0;
  const rightPosition = typeof right.position === 'number' ? right.position : 0;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
