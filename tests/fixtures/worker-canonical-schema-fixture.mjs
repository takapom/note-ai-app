const canonicalRole = 'turso-canonical-persistence';

export const forbiddenCanonicalTablePrefixes = Object.freeze(['agent_local_']);

export const canonicalSchemaFixture = Object.freeze({
  role: canonicalRole,
  authority: Object.freeze([
    'docs/contracts/data-model.md',
    'docs/contracts/cloudflare-agents-turso.md',
    'docs/contracts/repository-topology.md',
  ]),
  tables: Object.freeze({
    notes: table(`
      create table notes (
        id text primary key,
        workspace_id text not null,
        title text not null,
        description_user text,
        description_ai text,
        description_ai_approved integer,
        description_effective text,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    sections: table(`
      create table sections (
        id text primary key,
        note_id text not null,
        parent_section_id text,
        heading_block_id text,
        heading_level integer,
        title text,
        description_ai text,
        content_hash text not null,
        last_structured_hash text,
        last_structured_at integer,
        position real not null,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    blocks: table(`
      create table blocks (
        id text primary key,
        note_id text not null,
        section_id text,
        parent_block_id text,
        type text not null,
        content_json text not null,
        plain_text text not null,
        position real not null,
        origin text not null,
        content_hash text not null,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    capture_entries: table(`
      create table capture_entries (
        id text primary key,
        workspace_id text not null,
        note_id text not null,
        kind text not null,
        content text not null,
        content_hash text not null,
        source_block_ids_json text not null,
        captured_at integer not null
      )
    `),
    organized_note_versions: table(`
      create table organized_note_versions (
        id text primary key,
        workspace_id text not null,
        note_id text not null,
        organization_run_id text not null,
        source_capture_entry_ids_json text not null,
        blocks_json text not null,
        related_context_references_json text,
        restored_from_version_id text,
        created_at integer not null
      )
    `),
    organization_runs: table(`
      create table organization_runs (
        id text primary key,
        workspace_id text not null,
        note_id text not null,
        trigger text not null,
        status text not null,
        source_capture_entry_ids_json text not null,
        preferences_snapshot_json text not null,
        auto_applied integer not null,
        organized_version_id text,
        failure_reason text,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    organization_preferences: table(`
      create table organization_preferences (
        workspace_id text primary key,
        user_id text,
        prompt text not null,
        auto_organize_default_enabled integer not null,
        fixed_trust_guards_json text not null,
        updated_at integer not null
      )
    `),
    note_organization_settings: table(`
      create table note_organization_settings (
        note_id text primary key,
        auto_organize_enabled integer not null,
        updated_at integer not null
      )
    `),
    related_context_references: table(`
      create table related_context_references (
        id text primary key,
        workspace_id text not null,
        note_id text not null,
        kind text not null,
        target_id text not null,
        title text not null,
        reason text not null,
        source_inspectable integer not null
      )
    `),
    memory_items: table(`
      create table memory_items (
        id text primary key,
        workspace_id text not null,
        user_id text not null,
        type text not null,
        content text not null,
        status text not null,
        pinned integer not null,
        source_unit_id text,
        source_note_id text,
        source_block_id text,
        source_start_offset integer,
        source_end_offset integer,
        confidence real not null,
        reviewed_at integer,
        reviewed_by_user_id text,
        review_decision text,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    operation_proposals: table(`
      create table operation_proposals (
        operation_id text primary key,
        workspace_id text not null,
        state text not null,
        audit_record_json text not null,
        created_at integer not null,
        updated_at integer not null,
        accepted_at integer,
        dismissed_at integer
      )
    `),
    ai_operations: table(`
      create table ai_operations (
        id text primary key,
        workspace_id text not null,
        note_id text,
        structure_job_id text,
        operation_type text not null,
        policy text not null,
        status text not null,
        operation_json text not null,
        errors_json text not null,
        confidence real,
        target_type text,
        target_id text,
        generated_by text not null,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    source_spans: table(`
      create table source_spans (
        target_type text not null,
        target_id text not null,
        source_block_id text not null,
        start_offset integer,
        end_offset integer,
        reason text not null,
        position integer not null
      )
    `),
    semantic_units: table(`
      create table semantic_units (
        id text primary key,
        note_id text not null,
        section_id text,
        title text,
        summary text not null,
        source_block_ids text not null,
        source_block_id text,
        source_start_offset integer,
        source_end_offset integer,
        confidence real,
        relevance_score real,
        updated_at integer,
        position real
      )
    `),
    semantic_edges: table(`
      create table semantic_edges (
        id text primary key,
        workspace_id text not null,
        source_semantic_unit_id text not null,
        target_semantic_unit_id text not null,
        relationship_type text not null,
        confidence real,
        created_at integer not null,
        updated_at integer not null
      )
    `),
    semantic_unit_section_summaries: table(`
      create table semantic_unit_section_summaries (
        note_id text not null,
        section_id text not null,
        title text,
        summary text not null,
        source_block_ids text not null,
        updated_at integer not null,
        position real not null
      )
    `),
    semantic_unit_structure_snapshots: table(`
      create table semantic_unit_structure_snapshots (
        snapshot_id text primary key,
        note_id text not null,
        section_id text,
        semantic_unit_ids text not null,
        summary text not null,
        generated_at integer not null
      )
    `),
    semantic_unit_related_candidates: table(`
      create table semantic_unit_related_candidates (
        workspace_id text not null,
        source_note_id text not null,
        source_scope text not null,
        source_target_id text,
        related_semantic_unit_id text,
        related_note_id text,
        semantic_unit_ids text,
        source_block_excerpt_ids text,
        source_block_excerpt_id text,
        source_block_id text,
        source_start_offset integer,
        source_end_offset integer,
        retrieval_reason text not null,
        retrieval_rank integer not null,
        relevance_score real
      )
    `),
    memory_context_candidates: table(`
      create table memory_context_candidates (
        workspace_id text not null,
        user_id text not null,
        source_note_id text not null,
        source_scope text not null,
        source_target_id text,
        memory_item_id text not null,
        retrieval_rank integer not null,
        relevance_score real
      )
    `),
  }),
});

export const canonicalRequiredColumnsByTable = Object.freeze({
  notes: Object.freeze([
    'id',
    'workspace_id',
    'title',
    'description_user',
    'description_ai',
    'description_ai_approved',
    'description_effective',
    'created_at',
    'updated_at',
  ]),
  sections: Object.freeze([
    'id',
    'note_id',
    'parent_section_id',
    'heading_block_id',
    'heading_level',
    'title',
    'description_ai',
    'content_hash',
    'last_structured_hash',
    'last_structured_at',
    'position',
    'created_at',
    'updated_at',
  ]),
  blocks: Object.freeze([
    'id',
    'note_id',
    'section_id',
    'parent_block_id',
    'type',
    'content_json',
    'plain_text',
    'position',
    'origin',
    'content_hash',
    'created_at',
    'updated_at',
  ]),
  capture_entries: Object.freeze([
    'id',
    'workspace_id',
    'note_id',
    'kind',
    'content',
    'content_hash',
    'source_block_ids_json',
    'captured_at',
  ]),
  organized_note_versions: Object.freeze([
    'id',
    'workspace_id',
    'note_id',
    'organization_run_id',
    'source_capture_entry_ids_json',
    'blocks_json',
    'related_context_references_json',
    'restored_from_version_id',
    'created_at',
  ]),
  organization_runs: Object.freeze([
    'id',
    'workspace_id',
    'note_id',
    'trigger',
    'status',
    'source_capture_entry_ids_json',
    'preferences_snapshot_json',
    'auto_applied',
    'organized_version_id',
    'failure_reason',
    'created_at',
    'updated_at',
  ]),
  organization_preferences: Object.freeze([
    'workspace_id',
    'user_id',
    'prompt',
    'auto_organize_default_enabled',
    'fixed_trust_guards_json',
    'updated_at',
  ]),
  note_organization_settings: Object.freeze([
    'note_id',
    'auto_organize_enabled',
    'updated_at',
  ]),
  related_context_references: Object.freeze([
    'id',
    'workspace_id',
    'note_id',
    'kind',
    'target_id',
    'title',
    'reason',
    'source_inspectable',
  ]),
  memory_items: Object.freeze([
    'id',
    'workspace_id',
    'user_id',
    'type',
    'content',
    'status',
    'pinned',
    'source_unit_id',
    'source_note_id',
    'source_block_id',
    'source_start_offset',
    'source_end_offset',
    'confidence',
    'reviewed_at',
    'reviewed_by_user_id',
    'review_decision',
    'created_at',
    'updated_at',
  ]),
  operation_proposals: Object.freeze([
    'operation_id',
    'workspace_id',
    'state',
    'audit_record_json',
    'created_at',
    'updated_at',
    'accepted_at',
    'dismissed_at',
  ]),
  ai_operations: Object.freeze([
    'id',
    'workspace_id',
    'note_id',
    'structure_job_id',
    'operation_type',
    'policy',
    'status',
    'operation_json',
    'errors_json',
    'confidence',
    'target_type',
    'target_id',
    'generated_by',
    'created_at',
    'updated_at',
  ]),
  source_spans: Object.freeze([
    'target_type',
    'target_id',
    'source_block_id',
    'start_offset',
    'end_offset',
    'reason',
    'position',
  ]),
  semantic_units: Object.freeze([
    'id',
    'note_id',
    'section_id',
    'title',
    'summary',
    'source_block_ids',
    'source_block_id',
    'source_start_offset',
    'source_end_offset',
    'confidence',
    'relevance_score',
    'updated_at',
    'position',
  ]),
  semantic_edges: Object.freeze([
    'id',
    'workspace_id',
    'source_semantic_unit_id',
    'target_semantic_unit_id',
    'relationship_type',
    'confidence',
    'created_at',
    'updated_at',
  ]),
  semantic_unit_section_summaries: Object.freeze([
    'note_id',
    'section_id',
    'title',
    'summary',
    'source_block_ids',
    'updated_at',
    'position',
  ]),
  semantic_unit_structure_snapshots: Object.freeze([
    'snapshot_id',
    'note_id',
    'section_id',
    'semantic_unit_ids',
    'summary',
    'generated_at',
  ]),
  semantic_unit_related_candidates: Object.freeze([
    'workspace_id',
    'source_note_id',
    'source_scope',
    'source_target_id',
    'related_semantic_unit_id',
    'related_note_id',
    'semantic_unit_ids',
    'source_block_excerpt_ids',
    'source_block_excerpt_id',
    'source_block_id',
    'source_start_offset',
    'source_end_offset',
    'retrieval_reason',
    'retrieval_rank',
    'relevance_score',
  ]),
  memory_context_candidates: Object.freeze([
    'workspace_id',
    'user_id',
    'source_note_id',
    'source_scope',
    'source_target_id',
    'memory_item_id',
    'retrieval_rank',
    'relevance_score',
  ]),
});

export const canonicalRequiredTableNames = Object.freeze(Object.keys(canonicalRequiredColumnsByTable));

export function validateCanonicalSchemaFixture(
  fixture = canonicalSchemaFixture,
  requiredColumnsByTable = canonicalRequiredColumnsByTable,
) {
  const errors = [];
  const tables = fixture?.tables;
  if (!isRecord(tables)) {
    return ['canonical schema fixture must include tables'];
  }

  for (const tableName of Object.keys(tables)) {
    for (const prefix of forbiddenCanonicalTablePrefixes) {
      if (tableName.startsWith(prefix)) {
        errors.push(`canonical schema fixture must not include Agent-local table: ${tableName}`);
      }
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(requiredColumnsByTable)) {
    const table = tables[tableName];
    if (!isRecord(table)) {
      errors.push(`missing canonical table: ${tableName}`);
      continue;
    }

    const columns = new Set(readTableColumns(table));
    for (const column of requiredColumns) {
      if (!columns.has(column)) {
        errors.push(`missing canonical column: ${tableName}.${column}`);
      }
    }
  }

  return errors;
}

export function canonicalSchemaTableColumns(fixture = canonicalSchemaFixture) {
  const result = new Map();
  for (const [tableName, tableDefinition] of Object.entries(fixture.tables)) {
    result.set(tableName, new Set(readTableColumns(tableDefinition)));
  }
  return result;
}

function table(createSql) {
  const normalized = normalizeSql(createSql);
  return Object.freeze({
    role: canonicalRole,
    createSql: normalized,
    columns: Object.freeze(readCreateSqlColumns(normalized)),
  });
}

function readTableColumns(tableDefinition) {
  if (Array.isArray(tableDefinition.columns)) {
    return tableDefinition.columns;
  }
  if (typeof tableDefinition.createSql === 'string') {
    return readCreateSqlColumns(tableDefinition.createSql);
  }
  return [];
}

function readCreateSqlColumns(createSql) {
  const body = createSql.slice(createSql.indexOf('(') + 1, createSql.lastIndexOf(')'));
  return body
    .split(',')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((token) => /^[a-z][a-z0-9_]*$/.test(token))
    .filter((token) => !new Set(['primary', 'foreign', 'unique', 'check', 'constraint']).has(token));
}

function normalizeSql(sql) {
  return sql
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
