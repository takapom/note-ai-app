import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryMemoryCandidatePersistencePort } from '../../apps/worker/src/memory/memoryCandidateProposalBoundary.ts';
import { NoteDocumentBlockCommandPort } from '../../apps/worker/src/note-model/noteBlockCommandPort.ts';
import { InMemoryNoteDocumentPersistencePort } from '../../apps/worker/src/note-model/noteDocumentPersistencePort.ts';
import { InMemoryOperationProposalPersistencePort } from '../../apps/worker/src/ai-operations/operationProposalPort.ts';
import { InMemoryProvenanceLookupPort } from '../../apps/worker/src/note-model/provenanceLookupPort.ts';
import { createWorkerFetchHandler } from '../../apps/worker/src/runtime/http/workerEntrypoint.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { noteDocumentFixture, noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import { dirtyFlagSectionFixture } from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const now = 1_764_001_000_000;
const workspaceId = noteFixture.workspaceId;
const userId = 'user_001';
const noteId = noteFixture.id;
const blockId = 'block_paragraph_001';
const sharedSecret = 'secret_001';

test('backend runtime smoke reaches Worker API routes without UI or generated OpenAPI semantics', async () => {
  const fixture = await createBackendRuntimeSmokeFixture();
  const curl = createCurlLikeClient(fixture.fetch, {
    env: fixture.env,
    workspaceId,
    userId,
    sharedSecret,
  });

  const note = await curl({ method: 'GET', path: `/notes/${noteId}` });
  assertResponse(note, 200);
  assert.equal(note.body.document.note.id, noteId);

  const save = await curl({
    method: 'PATCH',
    path: `/blocks/${blockId}`,
    body: {
      noteId,
      content: 'Backend smoke save reached the canonical block boundary.',
    },
  });
  assertResponse(save, 200);
  assert.equal(save.body.result.block.id, blockId);
  assert.equal(save.body.result.block.plainText, 'Backend smoke save reached the canonical block boundary.');

  const leave = await curl({
    method: 'POST',
    path: `/notes/${noteId}/leave`,
    body: { cause: 'tab_switch' },
  });
  assertResponse(leave, 202);
  assert.equal(leave.body.route, 'note_leave');
  assert.equal(leave.body.triggerReason, 'tab_switched');

  const manual = await curl({
    method: 'POST',
    path: `/notes/${noteId}/structure/manual`,
  });
  assertResponse(manual, 202);
  assert.equal(manual.body.route, 'manual_organize');
  assert.equal(manual.body.triggerReason, 'manual_organize');

  const digest = await curl({ method: 'GET', path: `/notes/${noteId}/digest` });
  assertResponse(digest, 200);
  assert.deepEqual(digest.body.result, {
    available: true,
    noteId,
    preparedAt: now - 100,
    triggerReason: 'next_open',
  });

  const provenance = await curl({
    method: 'POST',
    path: '/provenance/source',
    body: {
      sourceSpanId: 'source_span_001',
      sourceBlockId: blockId,
      startOffset: 0,
      endOffset: 16,
    },
  });
  assertResponse(provenance, 200);
  assert.equal(provenance.body.result.available, true);
  assert.equal(provenance.body.result.source.sourceBlockId, blockId);

  const acceptMemory = await curl({ method: 'POST', path: '/memory/memory_accept_001/accept' });
  const rejectMemory = await curl({ method: 'POST', path: '/memory/memory_reject_001/reject' });
  const editMemory = await curl({
    method: 'POST',
    path: '/memory/memory_edit_001/edit',
    body: { content: 'Edited memory candidate from backend smoke.' },
  });
  const deleteMemory = await curl({ method: 'POST', path: '/memory/memory_delete_001/delete' });
  const holdMemory = await curl({ method: 'POST', path: '/memory/memory_hold_001/hold' });
  for (const response of [acceptMemory, rejectMemory, editMemory, deleteMemory, holdMemory]) {
    assertResponse(response, 200);
    assert.equal(response.body.result.workspaceId, workspaceId);
    assert.equal(response.body.result.userId, userId);
  }
  assert.equal(editMemory.body.result.body.content, 'Edited memory candidate from backend smoke.');

  const acceptOperation = await curl({
    method: 'POST',
    path: '/ai-operations/operation_accept_001/accept',
  });
  assertResponse(acceptOperation, 200);
  assert.equal(acceptOperation.body.proposal.state, 'accepted');
  assert.equal(acceptOperation.body.memoryCandidate.ok, true);

  const dismissOperation = await curl({
    method: 'POST',
    path: '/ai-operations/operation_dismiss_001/dismiss',
  });
  assertResponse(dismissOperation, 200);
  assert.equal(dismissOperation.body.proposal.state, 'dismissed');

  assert.deepEqual(
    fixture.identities.map((identity) => ({
      workspaceId: identity.workspaceId,
      userId: identity.userId,
    })),
    Array.from({ length: 13 }, () => ({ workspaceId, userId })),
  );
  assert.deepEqual(fixture.canonicalNoteWrites, [
    { kind: 'note_document_save', noteId },
  ]);
  assert.equal(
    fixture.canonicalNoteReads.some((event) => event.kind === 'note_document_load' && event.noteId === noteId),
    true,
  );
  assert.deepEqual(
    fixture.agentLocalTemporaryWrites.map((event) => event.kind),
    [
      'structure_job_enqueue',
      'structure_job_enqueue',
    ],
  );
  assert.equal(
    fixture.agentLocalTemporaryReads.some((event) => event.kind === 'next_open_digest_read' && event.noteId === noteId),
    true,
  );
  assert.equal(
    fixture.agentLocalTemporaryWrites.every((event) => event.tableRole === 'agent-local-temporary'),
    true,
  );
});

test('backend runtime smoke observes deterministic failure responses before UI integration', async () => {
  let createPortsCalls = 0;
  const fetch = createWorkerFetchHandler({
    now: () => now,
    createPorts() {
      createPortsCalls += 1;
      return {
        provenanceLookup: {
          async lookupSource() {
            throw new Error('provenance lookup must not be called for invalid mapping');
          },
        },
      };
    },
  });
  const env = { WORKER_AUTH_SHARED_SECRET: sharedSecret };
  const curl = createCurlLikeClient(fetch, {
    env,
    workspaceId,
    userId,
    sharedSecret,
  });

  const invalidJson = await curl({
    method: 'POST',
    path: `/notes/${noteId}/leave`,
    rawBody: '{',
  });
  assertResponse(invalidJson, 400, false);
  assert.deepEqual(invalidJson.body.errors, ['request body must be valid JSON']);

  const invalidAuth = await curl({
    method: 'GET',
    path: `/notes/${noteId}`,
    sharedSecret: 'wrong_secret',
  });
  assertResponse(invalidAuth, 401, false);
  assert.deepEqual(invalidAuth.body.errors, ['worker auth credentials are invalid']);

  const invalidRoute = await curl({ method: 'GET', path: '/unknown' });
  assertResponse(invalidRoute, 404, false);
  assert.deepEqual(invalidRoute.body.errors, ['route not found']);

  const invalidMethod = await curl({ method: 'GET', path: `/notes/${noteId}/leave` });
  assertResponse(invalidMethod, 405, false);
  assert.deepEqual(invalidMethod.body.errors, ['route not found']);

  const invalidMapping = await curl({
    method: 'POST',
    path: '/provenance/source',
    body: {
      sourceSpanId: 'source_span_001',
      sourceBlockId: blockId,
      startOffset: 12,
      endOffset: 3,
    },
  });
  assertResponse(invalidMapping, 400, false);
  assert.deepEqual(invalidMapping.body.errors, ['endOffset must be greater than or equal to startOffset']);

  assert.equal(createPortsCalls, 1);
});

test('backend runtime smoke reports missing configured ports through default env binding wiring', async () => {
  const fetch = createWorkerFetchHandler({ now: () => now });
  const curl = createCurlLikeClient(fetch, {
    env: { WORKER_AUTH_SHARED_SECRET: sharedSecret },
    workspaceId,
    userId,
    sharedSecret,
  });

  const missingNotePort = await curl({ method: 'GET', path: `/notes/${noteId}` });
  assertResponse(missingNotePort, 501, false);
  assert.deepEqual(missingNotePort.body.errors, ['note document persistence port is not configured']);

  const missingDigestPort = await curl({ method: 'GET', path: `/notes/${noteId}/digest` });
  assertResponse(missingDigestPort, 501, false);
  assert.deepEqual(missingDigestPort.body.errors, ['digest read port is not configured']);
});

async function createBackendRuntimeSmokeFixture() {
  const canonicalNoteReads = [];
  const canonicalNoteWrites = [];
  const agentLocalTemporaryReads = [];
  const agentLocalTemporaryWrites = [];
  const identities = [];

  const notePersistence = new InMemoryNoteDocumentPersistencePort([
    structuredClone(noteDocumentFixture),
  ]);
  const noteDocument = {
    async loadDocument(input) {
      canonicalNoteReads.push({ kind: 'note_document_load', workspaceId: input.workspaceId, noteId: input.noteId });
      return notePersistence.loadDocument(input);
    },
    async saveDocument(document) {
      canonicalNoteWrites.push({ kind: 'note_document_save', noteId: document.note.id });
      return notePersistence.saveDocument(document);
    },
  };
  const noteBlocks = new NoteDocumentBlockCommandPort(noteDocument);
  const operationApproval = new InMemoryOperationProposalPersistencePort();
  await operationApproval.saveProposal({
    workspaceId,
    operationId: 'operation_accept_001',
    auditRecord: operationProposalAuditRecord('operation_accept_001'),
    now: now - 50,
  });
  await operationApproval.saveProposal({
    workspaceId,
    operationId: 'operation_dismiss_001',
    auditRecord: operationProposalAuditRecord('operation_dismiss_001'),
    now: now - 50,
  });

  const provenanceLookup = new InMemoryProvenanceLookupPort([{
    workspaceId,
    noteId,
    sectionId: noteDocumentFixture.sections[0].id,
    blockId,
    plainText: noteDocumentFixture.blocks.find((block) => block.id === blockId).plainText,
    origin: 'user',
  }]);

  const ports = {
    noteDocument,
    noteBlocks,
    noteStructure: {
      noteSnapshot: {
        async loadSections(input) {
          canonicalNoteReads.push({ kind: 'section_snapshot_load', workspaceId: input.workspaceId, noteId: input.noteId });
          return [dirtyFlagSectionFixture];
        },
      },
      structureJobQueue: {
        async listCompletedJobs(input) {
          agentLocalTemporaryReads.push({
            kind: 'completed_structure_jobs_read',
            tableRole: 'agent-local-temporary',
            workspaceId: input.workspaceId,
            noteId: input.noteId,
          });
          return [];
        },
        async enqueueJobs(jobs) {
          agentLocalTemporaryWrites.push({
            kind: 'structure_job_enqueue',
            tableRole: 'agent-local-temporary',
            jobCount: jobs.length,
          });
          return { ok: true, errors: [], enqueuedCount: jobs.length };
        },
      },
      nextOpenDigestPreparation: {
        async prepareDigest(digest) {
          agentLocalTemporaryWrites.push({
            kind: 'next_open_digest_prepare',
            tableRole: 'agent-local-temporary',
            noteId: digest.noteId,
          });
          return { ok: true, errors: [] };
        },
      },
    },
    digestRead: {
      async getDigest(input) {
        agentLocalTemporaryReads.push({
          kind: 'next_open_digest_read',
          tableRole: 'agent-local-temporary',
          workspaceId: input.workspaceId,
          noteId: input.noteId,
        });
        return {
          ok: true,
          errors: [],
          body: {
            available: true,
            noteId: input.noteId,
            preparedAt: now - 100,
            triggerReason: 'next_open',
          },
        };
      },
    },
    provenanceLookup,
    memoryReview: createMemoryReviewSmokePort(),
    operationApproval,
    memoryCandidatePersistence: new InMemoryMemoryCandidatePersistencePort(),
  };
  const fetch = createWorkerFetchHandler({
    now: () => now,
    createPorts({ request }) {
      identities.push({
        path: request.path,
        workspaceId: request.workspaceId,
        userId: request.userId,
      });
      return ports;
    },
  });

  return {
    env: { WORKER_AUTH_SHARED_SECRET: sharedSecret },
    fetch,
    canonicalNoteReads,
    canonicalNoteWrites,
    agentLocalTemporaryReads,
    agentLocalTemporaryWrites,
    identities,
  };
}

function createMemoryReviewSmokePort() {
  const result = (action) => async (input) => ({
    ok: true,
    errors: [],
    body: {
      action,
      workspaceId: input.workspaceId,
      userId: input.userId,
      memoryId: input.memoryId,
      body: input.body ?? null,
    },
  });

  return {
    acceptMemory: result('accept'),
    rejectMemory: result('reject'),
    editMemory: result('edit'),
    deleteMemory: result('delete'),
    holdMemory: result('hold'),
  };
}

function createCurlLikeClient(fetch, defaults) {
  return async function curlLike(input) {
    const headers = new Headers();
    headers.set('x-workspace-id', input.workspaceId ?? defaults.workspaceId);
    headers.set('x-user-id', input.userId ?? defaults.userId);
    headers.set('x-worker-auth-secret', input.sharedSecret ?? defaults.sharedSecret);
    if (input.body !== undefined || input.rawBody !== undefined) {
      headers.set('content-type', 'application/json');
    }

    const response = await fetch(new Request(`https://worker.test${input.path}`, {
      method: input.method,
      headers,
      ...(input.rawBody !== undefined
        ? { body: input.rawBody }
        : input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
    }), defaults.env);

    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: await response.json(),
    };
  };
}

function assertResponse(response, expectedStatus, expectedOk = true) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.contentType, 'application/json; charset=utf-8');
  assert.equal(response.body.ok, expectedOk);
}

function operationProposalAuditRecord(operationId) {
  return {
    id: operationId,
    workspaceId,
    noteId,
    structureJobId: 'structure_job_001',
    operationType: 'insert_assist_block',
    policy: 'inline',
    status: 'proposed',
    operation: validOperationFixtures[3],
    errors: [],
    sourceSpans: [],
    confidence: validOperationFixtures[3].confidence,
    targetType: 'assist_block',
    targetId: `assist_${operationId}`,
    generatedBy: 'worker_runtime_smoke',
    createdAt: now - 50,
    updatedAt: now - 50,
  };
}
