import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  LOCAL_WORKSPACE_BRAIN_PROCESS_PATH,
  createWorkerFetchHandler,
  handleWorkerFetch,
  parseWorkerRequest,
} from '../../apps/worker/src/workerEntrypoint.ts';
import { WorkerTursoSqlExecutor } from '../../apps/worker/src/workerRuntimePorts.ts';
import { noteDocumentFixture, noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';

const now = 1_764_001_000_000;

test('worker entrypoint parses Worker Request identity, path, now, and JSON body', async () => {
  const parsed = await parseWorkerRequest(new Request('https://worker.test/notes/note_001?view=full', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
    body: JSON.stringify({ document: noteDocumentFixture }),
  }), {}, { now });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.request, {
    method: 'PATCH',
    path: '/notes/note_001?view=full',
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
    body: { document: noteDocumentFixture },
  });
});

test('worker entrypoint rejects invalid JSON before creating ports', async () => {
  let createPortsCalls = 0;
  const response = await handleWorkerFetch(new Request('https://worker.test/notes', {
    method: 'POST',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
    body: '{',
  }), {}, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['request body must be valid JSON'],
  });
});

test('worker entrypoint rejects missing workspaceId before creating ports', async () => {
  let createPortsCalls = 0;
  const response = await handleWorkerFetch(new Request('https://worker.test/notes/note_001', {
    method: 'GET',
  }), {}, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {
        noteDocument: {
          async loadDocument() {
            throw new Error('must not be called');
          },
          async saveDocument() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['workspaceId must be a stable non-sentinel runtime id'],
  });
});

test('worker entrypoint rejects sentinel userId before creating ports', async () => {
  let createPortsCalls = 0;
  const response = await handleWorkerFetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_sentinel',
    },
  }), {}, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['userId must be a stable non-sentinel runtime id when provided'],
  });
});

test('worker entrypoint rejects shared secret mismatch before creating ports', async () => {
  let createPortsCalls = 0;
  const response = await handleWorkerFetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-worker-auth-secret': 'wrong_secret',
    },
  }), { WORKER_AUTH_SHARED_SECRET: 'secret_001' }, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker entrypoint uses injected deployment auth verifier as the verified identity source', async () => {
  const verifierCalls = [];
  const portRequests = [];
  const fetch = createWorkerFetchHandler({
    now: () => now,
    authenticateRequest(input) {
      verifierCalls.push({
        url: input.request.url,
        envWorkspace: input.env.WORKSPACE_ID,
      });
      return {
        ok: true,
        identity: {
          workspaceId: noteFixture.workspaceId,
          userId: 'user_verified',
        },
      };
    },
    createPorts({ request }) {
      portRequests.push(request);
      return {
        digestRead: {
          async getDigest(input) {
            return {
              ok: true,
              errors: [],
              body: {
                available: false,
                noteId: input.noteId,
              },
            };
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: {
      'x-workspace-id': 'workspace_spoofed',
      'x-user-id': 'user_spoofed',
    },
  }), { WORKSPACE_ID: 'workspace_from_env' });

  assert.equal(response.status, 200);
  assert.equal(verifierCalls.length, 1);
  assert.equal(portRequests.length, 1);
  assert.equal(portRequests[0].workspaceId, noteFixture.workspaceId);
  assert.equal(portRequests[0].userId, 'user_verified');
  assert.deepEqual(await response.json(), {
    ok: true,
    result: {
      available: false,
      noteId: 'note_001',
    },
  });
});

test('worker entrypoint rejects invalid deployment auth verifier result before creating ports', async () => {
  let createPortsCalls = 0;
  const fetch = createWorkerFetchHandler({
    authenticateRequest() {
      return {
        ok: false,
        status: 401,
        errors: ['worker auth credentials are invalid'],
      };
    },
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), {});

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker entrypoint rejects malformed deployment auth verifier success before creating ports', async () => {
  let createPortsCalls = 0;
  const fetch = createWorkerFetchHandler({
    authenticateRequest() {
      return { ok: true };
    },
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: {
      'x-workspace-id': 'workspace_spoofed',
      'x-user-id': 'user_spoofed',
    },
  }), {});

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker entrypoint rejects missing deployment auth verifier result before creating ports', async () => {
  let createPortsCalls = 0;
  const fetch = createWorkerFetchHandler({
    authenticateRequest() {
      return undefined;
    },
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), {});

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker entrypoint rejects malformed deployment auth verifier identity fields before creating ports', async () => {
  let createPortsCalls = 0;
  const fetch = createWorkerFetchHandler({
    authenticateRequest() {
      return {
        ok: true,
        identity: {
          workspaceId: noteFixture.workspaceId,
          userId: { spoofed: true },
        },
      };
    },
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), {});

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker entrypoint rejects thrown deployment auth verifier failure before creating ports', async () => {
  let createPortsCalls = 0;
  const fetch = createWorkerFetchHandler({
    authenticateRequest() {
      throw new Error('provider verifier unavailable');
    },
    createPorts() {
      createPortsCalls += 1;
      return {
        digestRead: {
          async getDigest() {
            throw new Error('must not be called');
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), {});

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    errors: ['worker auth credentials are invalid'],
  });
});

test('worker entrypoint returns invalid route responses before creating ports', async () => {
  let createPortsCalls = 0;
  const notFound = await handleWorkerFetch(new Request('https://worker.test/unknown', {
    method: 'GET',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), {}, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });
  const methodMismatch = await handleWorkerFetch(new Request('https://worker.test/notes/note_001/leave', {
    method: 'GET',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), {}, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(notFound.status, 404);
  assert.equal(methodMismatch.status, 405);
  assert.deepEqual(await notFound.json(), { ok: false, errors: ['route not found'] });
  assert.deepEqual(await methodMismatch.json(), { ok: false, errors: ['route not found'] });
});

test('worker entrypoint keeps WorkspaceBrain process trigger local-only and gated', async () => {
  let createPortsCalls = 0;
  const disabled = await handleWorkerFetch(new Request(`https://worker.test${LOCAL_WORKSPACE_BRAIN_PROCESS_PATH}`, {
    method: 'POST',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
  }), {}, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(disabled.status, 404);
  assert.deepEqual(await disabled.json(), { ok: false, errors: ['route not found'] });

  const missingUser = await handleWorkerFetch(new Request(`https://worker.test${LOCAL_WORKSPACE_BRAIN_PROCESS_PATH}`, {
    method: 'POST',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), { LOCAL_AGENT_SMOKE_ENABLED: '1' }, { now });

  assert.equal(missingUser.status, 400);
  assert.deepEqual(await missingUser.json(), {
    ok: false,
    errors: ['userId is required for local WorkspaceBrain process trigger'],
  });
});

test('worker entrypoint local WorkspaceBrain process trigger invokes Durable Object RPC without product router ports', async () => {
  const rpcCalls = [];
  let createPortsCalls = 0;
  const namespace = {
    idFromName(name) {
      return { name };
    },
    get(id) {
      assert.equal(id.name, noteFixture.workspaceId);
      return {
        async processNextQueuedStructureJob(command) {
          rpcCalls.push(command);
          return {
            ok: true,
            accepted: true,
            reason: 'no_queued_job',
            scheduledJobIds: [],
            providerCalls: [],
            operationRoutingCalls: [],
            auditWrites: [],
            noteSotMutations: [],
            errors: [],
          };
        },
      };
    },
  };

  const response = await handleWorkerFetch(new Request(`https://worker.test${LOCAL_WORKSPACE_BRAIN_PROCESS_PATH}`, {
    method: 'POST',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
  }), {
    LOCAL_AGENT_SMOKE_ENABLED: '1',
    WORKSPACE_BRAIN_AGENT: namespace,
  }, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });

  assert.equal(createPortsCalls, 0);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    ok: true,
    reason: 'no_queued_job',
    scheduledJobIds: [],
    errors: [],
  });
  assert.deepEqual(rpcCalls, [{
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    now,
  }]);
});

test('worker entrypoint local smoke seed/reset initializes Agent-local DO state and canonical fixture port', async () => {
  const noteAgentCalls = [];
  const workspaceBrainCalls = [];
  let createPortsCalls = 0;
  const noteAgent = createNamespace({
    async applyAgentLocalSchemaCommand(command) {
      noteAgentCalls.push({ method: 'applyAgentLocalSchemaCommand', command });
      return {
        ok: true,
        action: command.action,
        initializedTables: ['agent_local_structure_jobs'],
        droppedTables: ['agent_local_structure_jobs'],
        errors: [],
      };
    },
    async applyLocalSmokeSchedulerSnapshot(command) {
      noteAgentCalls.push({ method: 'applyLocalSmokeSchedulerSnapshot', command });
      return { ok: true, errors: [] };
    },
  });
  const workspaceBrainAgent = createNamespace({
    async applyAgentLocalSchemaCommand(command) {
      workspaceBrainCalls.push({ method: 'applyAgentLocalSchemaCommand', command });
      return {
        ok: true,
        action: command.action,
        initializedTables: ['agent_local_structure_jobs'],
        droppedTables: ['agent_local_structure_jobs'],
        errors: [],
      };
    },
  });

  const seed = await handleWorkerFetch(new Request('https://worker.test/__local/smoke/seed', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
    body: JSON.stringify({
      document: noteDocumentFixture,
      nextOpenDigest: {
        available: true,
        noteId: noteFixture.id,
        items: [],
      },
    }),
  }), {
    LOCAL_AGENT_SMOKE_ENABLED: '1',
    NOTE_AGENT: noteAgent,
    WORKSPACE_BRAIN_AGENT: workspaceBrainAgent,
  }, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });
  const getNote = await handleWorkerFetch(new Request(`https://worker.test/notes/${noteFixture.id}`, {
    method: 'GET',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
  }), {
    LOCAL_AGENT_SMOKE_ENABLED: '1',
    NOTE_AGENT: noteAgent,
    WORKSPACE_BRAIN_AGENT: workspaceBrainAgent,
  }, {
    now,
    createPorts() {
      createPortsCalls += 1;
      return {};
    },
  });

  assert.equal(seed.status, 200);
  assert.equal(getNote.status, 200);
  assert.equal(createPortsCalls, 1, 'product request still creates ports before local fixture override');
  assert.deepEqual((await seed.json()).seeded, {
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    sections: noteDocumentFixture.sections.length,
    blocks: noteDocumentFixture.blocks.length,
  });
  assert.deepEqual((await getNote.json()).document.note.id, noteFixture.id);
  assert.deepEqual(noteAgentCalls.map((call) => call.method), [
    'applyAgentLocalSchemaCommand',
    'applyLocalSmokeSchedulerSnapshot',
  ]);
  assert.deepEqual(workspaceBrainCalls.map((call) => call.method), [
    'applyAgentLocalSchemaCommand',
  ]);
  assert.deepEqual(noteAgentCalls[1].command, {
    purpose: 'local_verification',
    noteId: noteFixture.id,
    sections: noteDocumentFixture.sections,
  });
});

test('worker entrypoint delegates valid requests through injected ports and maps JSON Response', async () => {
  const calls = [];
  const fetch = createWorkerFetchHandler({
    now: () => now,
    createPorts({ request }) {
      calls.push(request);
      return {
        digestRead: {
          async getDigest(input) {
            return {
              ok: true,
              errors: [],
              body: {
                available: false,
                noteId: input.noteId,
              },
            };
          },
        },
      };
    },
  });

  const response = await fetch(new Request('https://worker.test/notes/note_001/digest', {
    method: 'GET',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
  }), {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, noteFixture.workspaceId);
  assert.equal(calls[0].userId, 'user_001');
  assert.deepEqual(await response.json(), {
    ok: true,
    result: {
      available: false,
      noteId: 'note_001',
    },
  });
});

test('worker entrypoint default wiring persists notes through generic Turso executor', async () => {
  const executed = [];
  const response = await handleWorkerFetch(new Request('https://worker.test/notes', {
    method: 'POST',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
    body: JSON.stringify({ document: noteDocumentFixture }),
  }), {
    TURSO: {
      async execute(statement) {
        executed.push(statement);
        return { rows: [], rowsAffected: 1 };
      },
    },
  }, { now });

  assert.equal(response.status, 201);
  assert.equal(executed.length > 0, true);
  assert.deepEqual(await response.json(), {
    ok: true,
    document: noteDocumentFixture,
  });
});

test('worker entrypoint default wiring uses TURSO for operation proposal accept and dismiss routes', async () => {
  const executed = [];
  const auditRecord = makeOperationProposalAuditRecord('operation_proposal_001');
  const proposalRow = {
    operation_id: auditRecord.id,
    workspace_id: noteFixture.workspaceId,
    state: 'pending',
    audit_record_json: JSON.stringify(auditRecord),
    created_at: now - 100,
    updated_at: now - 100,
    accepted_at: null,
    dismissed_at: null,
  };
  const turso = {
    async execute(statement) {
      executed.push(statement);
      if (/^select .* from operation_proposals/i.test(statement.sql)) {
        return { rows: [proposalRow] };
      }
      if (/^update operation_proposals/i.test(statement.sql)) {
        proposalRow.state = statement.args[0];
        proposalRow.updated_at = statement.args[1];
        proposalRow.accepted_at = statement.args[2];
        proposalRow.dismissed_at = statement.args[3];
        return { rowsAffected: 1 };
      }
      throw new Error(`unexpected SQL: ${statement.sql}`);
    },
  };

  const accepted = await handleWorkerFetch(new Request('https://worker.test/ai-operations/operation_proposal_001/accept', {
    method: 'POST',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), { TURSO: turso }, { now });
  proposalRow.state = 'pending';
  proposalRow.accepted_at = null;
  const dismissed = await handleWorkerFetch(new Request('https://worker.test/ai-operations/operation_proposal_001/dismiss', {
    method: 'POST',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
  }), { TURSO: turso }, { now: now + 1 });

  assert.equal(accepted.status, 200);
  assert.equal(dismissed.status, 200);
  assert.equal(executed.some((statement) => /from operation_proposals/i.test(statement.sql)), true);
  assert.equal(executed.some((statement) => /^update operation_proposals/i.test(statement.sql)), true);
  assert.equal(executed.some((statement) => /^insert into memory_items/i.test(statement.sql)), false);
  assert.deepEqual((await accepted.json()).proposal.state, 'accepted');
  assert.deepEqual((await dismissed.json()).proposal.state, 'dismissed');
});

test('worker entrypoint default wiring persists accepted create_memory_candidate proposals to memory_items', async () => {
  const executed = [];
  const auditRecord = makeMemoryCandidateProposalAuditRecord('operation_memory_candidate_001');
  const proposalRow = {
    operation_id: auditRecord.id,
    workspace_id: noteFixture.workspaceId,
    state: 'pending',
    audit_record_json: JSON.stringify(auditRecord),
    created_at: now - 100,
    updated_at: now - 100,
    accepted_at: null,
    dismissed_at: null,
  };
  const response = await handleWorkerFetch(new Request('https://worker.test/ai-operations/operation_memory_candidate_001/accept', {
    method: 'POST',
    headers: {
      'x-workspace-id': noteFixture.workspaceId,
      'x-user-id': 'user_001',
    },
  }), {
    TURSO: {
      async execute(statement) {
        executed.push(statement);
        if (/^select .* from operation_proposals/i.test(statement.sql)) {
          return { rows: [proposalRow] };
        }
        if (/^update operation_proposals/i.test(statement.sql)) {
          proposalRow.state = statement.args[0];
          proposalRow.updated_at = statement.args[1];
          proposalRow.accepted_at = statement.args[2];
          proposalRow.dismissed_at = statement.args[3];
          return { rowsAffected: 1 };
        }
        if (/^insert into memory_items/i.test(statement.sql)) {
          return { rowsAffected: 1 };
        }
        throw new Error(`unexpected SQL: ${statement.sql}`);
      },
    },
  }, { now });

  const body = await response.json();
  const memoryInsert = executed.find((statement) => /^insert into memory_items/i.test(statement.sql));

  assert.equal(response.status, 200);
  assert.equal(executed.some((statement) => /from operation_proposals/i.test(statement.sql)), true);
  assert.equal(executed.some((statement) => /^update operation_proposals/i.test(statement.sql)), true);
  assert.ok(memoryInsert);
  assert.deepEqual(memoryInsert.args.slice(0, 6), [
    'memory_operation_memory_candidate_001',
    noteFixture.workspaceId,
    'user_001',
    'past_decision',
    'The MVP keeps AI assistance inside the unified note surface.',
    'candidate',
  ]);
  assert.equal(body.proposal.state, 'accepted');
  assert.equal(body.memoryCandidate.ok, true);
  assert.equal(body.memoryCandidate.memory.id, 'memory_operation_memory_candidate_001');
});

test('worker entrypoint default wiring uses TURSO for provenance source lookup route', async () => {
  const executed = [];
  const sourceText = 'The quoted source block contains a bounded provenance excerpt for review.';
  const excerptText = sourceText.slice(0, 65);
  const response = await handleWorkerFetch(new Request('https://worker.test/provenance/source', {
    method: 'POST',
    headers: { 'x-workspace-id': noteFixture.workspaceId },
    body: JSON.stringify({
      sourceSpanId: 'source_span_001',
      sourceBlockId: 'block_001',
      startOffset: 4,
      endOffset: 17,
    }),
  }), {
    TURSO: {
      async execute(statement) {
        executed.push(statement);
        if (/from source_spans/i.test(statement.sql)) {
          return {
            rows: [{
              workspace_id: noteFixture.workspaceId,
              source_span_id: 'source_span_001',
              source_block_id: 'block_001',
              start_offset: 4,
              end_offset: 17,
              reason: 'summary_source',
              note_id: noteFixture.id,
              section_id: noteDocumentFixture.sections[0].id,
              block_id: 'block_001',
              plain_text: sourceText,
              origin: 'user',
            }],
          };
        }
        throw new Error(`unexpected SQL: ${statement.sql}`);
      },
    },
  }, { now });

  assert.equal(response.status, 200);
  assert.equal(executed.length, 1);
  assert.match(executed[0].sql, /^select /i);
  assert.doesNotMatch(executed[0].sql, /\b(?:insert\s+into|update|delete\s+from)\b/i);
  assert.deepEqual(await response.json(), {
    ok: true,
    result: {
      available: true,
      sourceSpanId: 'source_span_001',
      sourceBlockId: 'block_001',
      excerpt: excerptText,
      source: {
        sourceSpanId: 'source_span_001',
        sourceBlockId: 'block_001',
        reason: 'summary_source',
        noteId: noteFixture.id,
        sectionId: noteDocumentFixture.sections[0].id,
        startOffset: 4,
        endOffset: 17,
        excerptStartOffset: 0,
        excerptEndOffset: excerptText.length,
        truncatedBefore: false,
        truncatedAfter: true,
      },
    },
  });
});

test('worker Turso SQL executor exposes query rows and ordered writes without SQL interpretation', async () => {
  const executed = [];
  const executor = new WorkerTursoSqlExecutor({
    async execute(statement) {
      executed.push(statement);
      return { rows: [{ id: 'row_001' }], rowsAffected: 1 };
    },
  });

  assert.deepEqual(await executor.query({ sql: 'select id from rows', args: [] }), [{ id: 'row_001' }]);
  await executor.writeNoteDocument([
    { sql: 'insert one', args: ['one'] },
    { sql: 'insert two', args: ['two'] },
  ]);

  assert.deepEqual(executed.map((statement) => statement.sql), [
    'select id from rows',
    'insert one',
    'insert two',
  ]);
  await assert.rejects(
    () => executor.writeNoteDocument([]),
    /note document SQL statements must not be empty/,
  );
});

test('worker entrypoint source stays a thin fetch and port wiring boundary', async () => {
  const source = await readFile(new URL('../../apps/worker/src/workerEntrypoint.ts', import.meta.url), 'utf8');

  assert.match(source, /createWorkerFetchHandler/);
  assert.match(source, /handleWorkerHttpRequest/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*docs\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*workspace-api\/generated\//);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(jsonwebtoken|jose|auth0|clerk|next-auth|passport)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(provider|ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(SqlAdapter|sqlAdapter|Turso|turso|libsql|sqlite)/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouting/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /runOperationRoutingFlow|classifyOperationPolicy|validateStructureOperation/);
  assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from|select\s+\*)\b/i);
});

function makeOperationProposalAuditRecord(operationId) {
  return {
    id: operationId,
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    structureJobId: 'structure_job_001',
    operationType: 'insert_assist_block',
    policy: 'inline',
    status: 'proposed',
    operation: {
      type: 'insert_assist_block',
      target: {
        noteId: noteFixture.id,
        sectionId: noteDocumentFixture.sections[0].id,
      },
      content: 'Suggested assist block',
    },
    errors: [],
    sourceSpans: [],
    confidence: 0.92,
    targetType: 'assist_block',
    targetId: 'assist_block_001',
    generatedBy: 'worker_runtime',
    createdAt: now - 100,
    updatedAt: now - 100,
  };
}

function makeMemoryCandidateProposalAuditRecord(operationId) {
  const operation = {
    type: 'create_memory_candidate',
    targetSectionId: noteDocumentFixture.sections[0].id,
    memoryType: 'past_decision',
    content: 'The MVP keeps AI assistance inside the unified note surface.',
    sourceSpans: [{ blockId: 'block_001', startOffset: 0, endOffset: 42 }],
    confidence: 0.88,
  };

  return {
    id: operationId,
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    structureJobId: 'structure_job_001',
    operationType: 'create_memory_candidate',
    policy: 'review',
    status: 'proposed',
    operation,
    errors: [],
    sourceSpans: [],
    confidence: operation.confidence,
    targetType: 'memory_item',
    targetId: `memory_${operationId}`,
    generatedBy: 'worker_runtime',
    createdAt: now - 100,
    updatedAt: now - 100,
  };
}

function createNamespace(stub) {
  return {
    idFromName(name) {
      return { name };
    },
    get(id) {
      assert.equal(typeof id.name, 'string');
      return stub;
    },
  };
}
