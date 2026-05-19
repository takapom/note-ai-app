export const agentLocalTemporarySchema = Object.freeze({
  tables: Object.freeze({
    agent_local_block_save_intents: temporaryTable([
      'block_id',
      'note_id',
      'section_id',
      'content_hash',
      'saved_at',
    ]),
    agent_local_edit_events: temporaryTable([
      'event_type',
      'block_id',
      'note_id',
      'section_id',
      'occurred_at',
      'previous_content_hash',
      'content_hash',
    ]),
    agent_local_dirty_scope_marks: temporaryTable([
      'target_scope',
      'note_id',
      'section_id',
      'content_hash',
      'is_dirty',
      'marked_at',
    ]),
    agent_local_lightweight_index_updates: temporaryTable([
      'block_id',
      'note_id',
      'section_id',
      'content_hash',
      'updated_at',
    ]),
    agent_local_structure_jobs: temporaryTable([
      'id',
      'workspace_id',
      'note_id',
      'section_id',
      'target_scope',
      'trigger_reason',
      'context_hash',
      'status',
      'priority',
      'created_at',
      'started_at',
      'completed_at',
      'whole_note_reason',
      'skip_reason',
      'failed_at',
      'failure_message',
    ]),
    agent_local_next_open_digest_preparation_intents: temporaryTable([
      'workspace_id',
      'note_id',
      'trigger_reason',
      'recovered_job_count',
      'prepared',
      'payload_json',
    ]),
    agent_local_operation_audit_recovery_queue: temporaryTable([
      'operation_id',
      'workspace_id',
      'note_id',
      'structure_job_id',
      'audit_record_json',
      'failure_message',
      'failed_at',
    ]),
  }),
  forbiddenCanonicalTables: Object.freeze([
    'notes',
    'sections',
    'blocks',
    'memory_items',
    'ai_operations',
    'source_spans',
    'semantic_units',
    'semantic_edges',
    'operation_proposals',
  ]),
});

export function agentLocalTableNames() {
  return Object.keys(agentLocalTemporarySchema.tables).sort();
}

function temporaryTable(columns) {
  return Object.freeze({
    placement: 'agent-local-temporary',
    columns: Object.freeze([...columns]),
  });
}
