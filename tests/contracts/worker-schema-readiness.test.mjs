import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapLocalPreviousStructureSnapshotLookupToSql,
  mapLocalSectionSummariesLookupToSql,
  mapLocalSemanticUnitsLookupToSql,
} from '../../apps/worker/src/context-assembly/contextAssemblyLocalStructureSqlAdapter.ts';
import {
  mapMemoryContextCandidatesLookupToSql,
} from '../../apps/worker/src/context-assembly/contextAssemblyMemoryContextSqlAdapter.ts';
import {
  mapRelatedNotesLookupToSql,
  mapRelatedSemanticUnitsLookupToSql,
  mapRelatedSourceBlockExcerptsLookupToSql,
} from '../../apps/worker/src/context-assembly/contextAssemblyRelatedContextSqlAdapter.ts';
import {
  mapTargetBlocksLookupToSql,
  mapTargetNoteLookupToSql,
  mapTargetOutlineLookupToSql,
} from '../../apps/worker/src/context-assembly/contextAssemblyTargetSnapshotSqlAdapter.ts';
import {
  mapMemoryCandidateWriteIntentToSql,
} from '../../apps/worker/src/memory/memoryCandidateProposalBoundary.ts';
import {
  mapMemoryReviewContentUpdateToSql,
  mapMemoryReviewLookupToSql,
  mapMemoryReviewStatusUpdateToSql,
} from '../../apps/worker/src/memory/memoryReviewPort.ts';
import {
  mapBlocksLookupToSql,
  mapNoteDocumentToSql,
  mapNoteLookupToSql,
  mapSectionsLookupToSql,
} from '../../apps/worker/src/note-model/noteDocumentSqlAdapter.ts';
import {
  mapOperationAuditRecordToSql,
} from '../../apps/worker/src/ai-operations/operationAuditSqlAdapter.ts';
import {
  mapOperationProposalInsertToSql,
  mapOperationProposalLookupToSql,
  mapOperationProposalStateUpdateToSql,
} from '../../apps/worker/src/ai-operations/operationProposalSqlAdapter.ts';
import {
  mapProvenanceSourceLookupToSql,
} from '../../apps/worker/src/note-model/provenanceLookupPort.ts';
import {
  mapSectionSnapshotLookupToSql,
} from '../../apps/worker/src/scheduler/schedulerNoteSnapshotSqlAdapter.ts';
import {
  blockFixtures,
  noteDocumentFixture,
  noteFixture,
  sectionFixture,
} from '../../contexts/note-model/src/contract/noteFixtures.ts';
import {
  canonicalRequiredColumnsByTable,
  canonicalRequiredTableNames,
  canonicalSchemaFixture,
  canonicalSchemaTableColumns,
  forbiddenCanonicalTablePrefixes,
  validateCanonicalSchemaFixture,
} from '../fixtures/worker-canonical-schema-fixture.mjs';

const now = 1_764_001_000_000;
const workspaceId = noteFixture.workspaceId;
const userId = 'user_001';
const noteId = noteFixture.id;
const sectionId = sectionFixture.id;
const operationId = 'operation_schema_001';

test('canonical schema fixture covers data model required Turso tables and columns', () => {
  assert.deepEqual(validateCanonicalSchemaFixture(), []);

  const tables = canonicalSchemaFixture.tables;
  assert.deepEqual(Object.keys(canonicalRequiredColumnsByTable), canonicalRequiredTableNames);
  for (const tableName of canonicalRequiredTableNames) {
    assert.equal(tables[tableName].role, 'turso-canonical-persistence');
    assert.match(tables[tableName].createSql, new RegExp(`create table ${tableName} \\(`));
  }
});

test('canonical schema readiness detects missing required table and column drift', () => {
  assert.deepEqual(validateCanonicalSchemaFixture(fixtureWithoutTable('notes')), [
    'missing canonical table: notes',
  ]);
  assert.deepEqual(validateCanonicalSchemaFixture(fixtureWithoutColumn('notes', 'title')), [
    'missing canonical column: notes.title',
  ]);
});

test('canonical schema fixture keeps Agent-local temporary state out of Turso readiness', () => {
  const tableNames = Object.keys(canonicalSchemaFixture.tables);

  assert.equal(
    tableNames.some((tableName) => forbiddenCanonicalTablePrefixes.some((prefix) => tableName.startsWith(prefix))),
    false,
  );
  assert.deepEqual(validateCanonicalSchemaFixture(fixtureWithAgentLocalTable()), [
    'canonical schema fixture must not include Agent-local table: agent_local_structure_jobs',
  ]);
});

test('canonical schema fixture covers current canonical adapter table and column expectations', () => {
  const references = collectSchemaReferences(canonicalAdapterStatements(), canonicalSchemaTableColumns());

  assert.deepEqual(validateReferencesAgainstFixture(references, canonicalSchemaTableColumns()), []);
  assert.equal(
    [...references.tables].some((tableName) => tableName.startsWith('agent_local_')),
    false,
  );
});

test('canonical schema readiness reports adapter SQL references outside the fixture', () => {
  const references = collectSchemaReferences([
    { sql: 'select notes.missing_column from notes', args: [] },
    { sql: 'select id from missing_table', args: [] },
  ], canonicalSchemaTableColumns());

  assert.deepEqual(validateReferencesAgainstFixture(references, canonicalSchemaTableColumns()), [
    'adapter SQL references missing canonical table: missing_table',
    'adapter SQL references missing canonical column: notes.missing_column',
  ]);
});

function canonicalAdapterStatements() {
  const loadRequest = { workspaceId, noteId };
  const contextNoteRequest = { workspaceId, userId, noteId, targetScope: 'note' };
  const contextSectionRequest = { workspaceId, userId, noteId, targetScope: 'section', targetId: sectionId };
  const reviewBase = { workspaceId, userId, memoryId: 'memory_schema_001', now };
  const reviewedMemory = {
    ...memoryCandidate(),
    status: 'active',
    reviewedAt: now,
    reviewedByUserId: userId,
    reviewDecision: 'accepted',
    updatedAt: now,
  };
  const editedMemory = {
    ...memoryCandidate(),
    content: 'The MVP keeps reviewed memories source-backed.',
    status: 'pending',
    reviewedAt: now,
    reviewedByUserId: userId,
    reviewDecision: 'edited',
    updatedAt: now,
  };
  const auditRecord = operationAuditRecord();
  const proposal = {
    operationId,
    workspaceId,
    state: 'pending',
    auditRecord,
    createdAt: now,
    updatedAt: now,
  };
  const acceptedProposal = {
    ...proposal,
    state: 'accepted',
    acceptedAt: now + 1,
    updatedAt: now + 1,
  };

  return [
    ...mapNoteDocumentToSql(noteDocumentFixture),
    mapNoteLookupToSql(loadRequest),
    mapSectionsLookupToSql(loadRequest),
    mapBlocksLookupToSql(loadRequest),
    mapMemoryReviewLookupToSql(reviewBase),
    mapMemoryReviewStatusUpdateToSql(reviewedMemory),
    mapMemoryReviewContentUpdateToSql(editedMemory),
    mapMemoryCandidateWriteIntentToSql({
      workspaceId,
      userId,
      sourceOperationId: operationId,
      memory: memoryCandidate(),
    }),
    ...mapOperationAuditRecordToSql(auditRecord),
    mapOperationProposalLookupToSql({ workspaceId, operationId }),
    mapOperationProposalInsertToSql(proposal),
    mapOperationProposalStateUpdateToSql(acceptedProposal),
    mapProvenanceSourceLookupToSql({
      workspaceId,
      sourceSpanId: operationId,
      sourceBlockId: 'block_paragraph_001',
      startOffset: 0,
      endOffset: 12,
    }),
    mapTargetNoteLookupToSql(contextSectionRequest),
    mapTargetOutlineLookupToSql(contextSectionRequest),
    mapTargetBlocksLookupToSql(contextNoteRequest),
    mapTargetBlocksLookupToSql(contextSectionRequest),
    mapSectionSnapshotLookupToSql(loadRequest),
    mapLocalSemanticUnitsLookupToSql(contextNoteRequest),
    mapLocalSemanticUnitsLookupToSql(contextSectionRequest),
    mapLocalSectionSummariesLookupToSql(contextNoteRequest),
    mapLocalSectionSummariesLookupToSql(contextSectionRequest),
    mapLocalPreviousStructureSnapshotLookupToSql(contextNoteRequest),
    mapLocalPreviousStructureSnapshotLookupToSql(contextSectionRequest),
    mapRelatedSemanticUnitsLookupToSql(contextNoteRequest),
    mapRelatedSemanticUnitsLookupToSql(contextSectionRequest),
    mapRelatedNotesLookupToSql(contextNoteRequest),
    mapRelatedNotesLookupToSql(contextSectionRequest),
    mapRelatedSourceBlockExcerptsLookupToSql(contextNoteRequest),
    mapRelatedSourceBlockExcerptsLookupToSql(contextSectionRequest),
    mapMemoryContextCandidatesLookupToSql(contextNoteRequest),
    mapMemoryContextCandidatesLookupToSql(contextSectionRequest),
  ];
}

function collectSchemaReferences(statements, schemaColumns) {
  const references = {
    tables: new Set(),
    columnsByTable: new Map(),
  };

  for (const statement of statements) {
    const sql = normalizeSql(statement.sql);
    const tables = extractReferencedTables(sql);
    for (const tableName of tables) {
      references.tables.add(tableName);
    }

    for (const [tableName, columnName] of extractQualifiedColumns(sql)) {
      addColumnReference(references, tableName, columnName);
    }

    if (tables.size === 1) {
      const [tableName] = [...tables];
      const knownColumns = schemaColumns.get(tableName) ?? new Set();
      for (const columnName of knownColumns) {
        if (new RegExp(`\\b${escapeRegExp(columnName)}\\b`).test(sql)) {
          addColumnReference(references, tableName, columnName);
        }
      }
    }
  }

  return references;
}

function validateReferencesAgainstFixture(references, schemaColumns) {
  const errors = [];

  for (const tableName of [...references.tables].sort()) {
    if (!schemaColumns.has(tableName)) {
      errors.push(`adapter SQL references missing canonical table: ${tableName}`);
    }
  }

  for (const [tableName, columnNames] of [...references.columnsByTable.entries()].sort()) {
    const knownColumns = schemaColumns.get(tableName);
    if (knownColumns === undefined) {
      continue;
    }
    for (const columnName of [...columnNames].sort()) {
      if (!knownColumns.has(columnName)) {
        errors.push(`adapter SQL references missing canonical column: ${tableName}.${columnName}`);
      }
    }
  }

  return errors;
}

function extractReferencedTables(sql) {
  const tables = new Set();
  for (const pattern of [
    /\bfrom\s+([a-z][a-z0-9_]*)/gi,
    /\bjoin\s+([a-z][a-z0-9_]*)/gi,
    /\binto\s+([a-z][a-z0-9_]*)/gi,
    /\bupdate\s+([a-z][a-z0-9_]*)/gi,
    /\bdelete\s+from\s+([a-z][a-z0-9_]*)/gi,
  ]) {
    for (const match of sql.matchAll(pattern)) {
      if (match[1] !== 'set') {
        tables.add(match[1]);
      }
    }
  }
  return tables;
}

function extractQualifiedColumns(sql) {
  return [...sql.matchAll(/\b([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\b/gi)]
    .map((match) => [match[1], match[2]])
    .filter(([tableName]) => !new Set(['excluded']).has(tableName));
}

function addColumnReference(references, tableName, columnName) {
  const columns = references.columnsByTable.get(tableName) ?? new Set();
  columns.add(columnName);
  references.columnsByTable.set(tableName, columns);
}

function fixtureWithoutTable(tableName) {
  const tables = { ...canonicalSchemaFixture.tables };
  delete tables[tableName];
  return { ...canonicalSchemaFixture, tables };
}

function fixtureWithoutColumn(tableName, columnName) {
  return {
    ...canonicalSchemaFixture,
    tables: {
      ...canonicalSchemaFixture.tables,
      [tableName]: {
        ...canonicalSchemaFixture.tables[tableName],
        columns: canonicalSchemaFixture.tables[tableName].columns.filter((candidate) => candidate !== columnName),
      },
    },
  };
}

function fixtureWithAgentLocalTable() {
  return {
    ...canonicalSchemaFixture,
    tables: {
      ...canonicalSchemaFixture.tables,
      agent_local_structure_jobs: {
        role: 'agent-local-temporary-state',
        createSql: 'create table agent_local_structure_jobs (id text primary key)',
        columns: ['id'],
      },
    },
  };
}

function memoryCandidate() {
  return {
    id: `memory_${operationId}`,
    workspaceId,
    userId,
    type: 'past_decision',
    content: 'The MVP keeps memory source-backed.',
    sourceNoteId: noteId,
    sourceSpan: {
      sourceBlockId: blockFixtures[1].id,
      startOffset: 0,
      endOffset: 12,
    },
    confidence: 0.91,
    status: 'candidate',
    pinned: false,
    createdAt: now - 1,
    updatedAt: now - 1,
  };
}

function operationAuditRecord() {
  return {
    id: operationId,
    workspaceId,
    noteId,
    structureJobId: 'structure_job_schema_001',
    operationType: 'insert_assist_block',
    policy: 'inline',
    status: 'proposed',
    operation: {
      type: 'insert_assist_block',
      target: {
        noteId,
        sectionId,
      },
      content: 'Suggested assist block',
    },
    errors: [],
    sourceSpans: [{
      targetType: 'operation',
      targetId: operationId,
      sourceBlockId: blockFixtures[1].id,
      startOffset: 0,
      endOffset: 12,
      reason: 'supports operation',
    }],
    confidence: 0.92,
    targetType: 'assist_block',
    targetId: 'assist_block_schema_001',
    generatedBy: 'worker_runtime',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
