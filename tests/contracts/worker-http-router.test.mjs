import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  handleWorkerHttpRequest,
  matchWorkerRoute,
} from '../../apps/worker/src/runtime/http/workerHttpRouter.ts';
import { InMemoryMemoryCandidatePersistencePort } from '../../apps/worker/src/memory/memoryCandidateProposalBoundary.ts';
import { InMemoryOperationProposalPersistencePort } from '../../apps/worker/src/ai-operations/operationProposalPort.ts';
import { InMemoryNoteDocumentPersistencePort } from '../../apps/worker/src/note-model/noteDocumentPersistencePort.ts';
import { InMemoryNoteListPort } from '../../apps/worker/src/note-model/noteListPort.ts';
import { validOperationFixtures } from '../../contexts/ai-operations/src/contract/operationFixtures.ts';
import { noteDocumentFixture, noteFixture } from '../../contexts/note-model/src/contract/noteFixtures.ts';
import {
  dirtyFlagSectionFixture,
  schedulerSectionsFixture,
} from '../../contexts/scheduler/src/contract/structureSchedulerFixtures.ts';

const root = new URL('../../', import.meta.url);
const now = 1_764_001_000_000;
const baseRequest = {
  workspaceId: noteFixture.workspaceId,
  now,
};

test('worker HTTP router matches the MVP API surface without reading generated OpenAPI', () => {
  assert.deepEqual(matchWorkerRoute('GET', '/notes'), { name: 'list_notes', params: {} });
  assert.deepEqual(matchWorkerRoute('POST', '/notes'), { name: 'create_note', params: {} });
  assert.deepEqual(matchWorkerRoute('GET', '/notes/note_001'), { name: 'get_note', params: { noteId: 'note_001' } });
  assert.deepEqual(matchWorkerRoute('PATCH', '/notes/note_001'), { name: 'update_note', params: { noteId: 'note_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/notes/note_001/blocks'), { name: 'create_block', params: { noteId: 'note_001' } });
  assert.deepEqual(matchWorkerRoute('PATCH', '/blocks/block_001'), { name: 'update_block', params: { blockId: 'block_001' } });
  assert.deepEqual(matchWorkerRoute('DELETE', '/blocks/block_001'), { name: 'delete_block', params: { blockId: 'block_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/notes/note_001/leave'), { name: 'leave_note', params: { noteId: 'note_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/notes/note_001/structure/manual'), { name: 'manual_organize_note', params: { noteId: 'note_001' } });
  assert.deepEqual(matchWorkerRoute('GET', '/notes/note_001/digest'), { name: 'get_digest', params: { noteId: 'note_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/provenance/source'), { name: 'lookup_provenance_source', params: {} });
  assert.deepEqual(matchWorkerRoute('POST', '/ai-operations/operation_001/accept'), { name: 'accept_operation', params: { operationId: 'operation_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/ai-operations/operation_001/dismiss'), { name: 'dismiss_operation', params: { operationId: 'operation_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/accept'), { name: 'accept_memory', params: { memoryId: 'memory_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/reject'), { name: 'reject_memory', params: { memoryId: 'memory_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/edit'), { name: 'edit_memory', params: { memoryId: 'memory_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/delete'), { name: 'delete_memory', params: { memoryId: 'memory_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/hold'), { name: 'hold_memory', params: { memoryId: 'memory_001' } });
});

test('worker HTTP router returns 404 for unknown routes and 405 for known path method mismatch', async () => {
  assert.deepEqual(await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/unknown',
  }, {}), {
    status: 404,
    body: { ok: false, errors: ['route not found'] },
  });

  assert.deepEqual(await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes/note_001/leave',
  }, {}), {
    status: 405,
    body: { ok: false, errors: ['route not found'] },
  });
});

test('worker HTTP router validates base identity before delegated ports', async () => {
  let called = 0;
  const response = await handleWorkerHttpRequest({
    method: 'GET',
    path: '/notes/note_001',
    workspaceId: 'workspace_unset',
    now: Number.NaN,
  }, {
    noteDocument: {
      async loadDocument() {
        called += 1;
        return { ok: true, errors: [], document: noteDocumentFixture };
      },
      async saveDocument() {
        called += 1;
        return { ok: true, errors: [], document: noteDocumentFixture };
      },
    },
  });

  assert.equal(called, 0);
  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      errors: [
        'workspaceId must be a stable non-sentinel runtime id',
        'now must be a finite number',
      ],
    },
  });
});

test('worker HTTP router delegates note document create get and update to the configured port', async () => {
  const noteDocument = new InMemoryNoteDocumentPersistencePort();

  const create = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/notes',
    body: { document: noteDocumentFixture },
  }, { noteDocument });
  const get = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: `/notes/${noteFixture.id}`,
  }, { noteDocument });
  const update = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'PATCH',
    path: `/notes/${noteFixture.id}`,
    body: { document: { ...noteDocumentFixture, note: { ...noteFixture, title: 'Updated title' } } },
  }, { noteDocument });

  assert.equal(create.status, 201);
  assert.equal(get.status, 200);
  assert.equal(update.status, 200);
  assert.equal(update.body.document.note.title, 'Updated title');
});

test('worker HTTP router delegates note library list to the configured read port', async () => {
  const noteList = new InMemoryNoteListPort([noteDocumentFixture]);

  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes',
  }, { noteList });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    notes: [{
      noteId: noteFixture.id,
      title: noteFixture.title,
      descriptionEffective: noteFixture.descriptionEffective,
      createdAt: noteFixture.createdAt,
      updatedAt: noteFixture.updatedAt,
    }],
  });
});

test('worker HTTP router delegates block digest and memory routes to explicit ports', async () => {
  const calls = [];
  const noteBlocks = {
    async createBlock(input) {
      calls.push(['createBlock', input.noteId, input.body]);
      return { ok: true, errors: [], body: { created: true } };
    },
    async updateBlock(input) {
      calls.push(['updateBlock', input.blockId, input.body]);
      return { ok: true, errors: [], body: { updated: true } };
    },
    async deleteBlock(input) {
      calls.push(['deleteBlock', input.blockId]);
      return { ok: true, errors: [] };
    },
  };
  const digestRead = {
    async getDigest(input) {
      calls.push(['getDigest', input.noteId]);
      return { ok: true, errors: [], body: { available: false } };
    },
  };
  const memoryReview = {
    async acceptMemory(input) {
      calls.push(['acceptMemory', input.memoryId]);
      return { ok: true, errors: [], body: { state: 'active' } };
    },
    async rejectMemory(input) {
      calls.push(['rejectMemory', input.memoryId]);
      return { ok: true, errors: [], body: { state: 'rejected' } };
    },
    async editMemory(input) {
      calls.push(['editMemory', input.memoryId, input.body]);
      return { ok: true, errors: [], body: { state: 'pending' } };
    },
    async deleteMemory(input) {
      calls.push(['deleteMemory', input.memoryId]);
      return { ok: true, errors: [], body: { state: 'archived' } };
    },
    async holdMemory(input) {
      calls.push(['holdMemory', input.memoryId]);
      return { ok: true, errors: [], body: { state: 'pending' } };
    },
  };

  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/notes/note_001/blocks',
    body: { block: 'draft' },
  }, { noteBlocks })).status, 201);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'PATCH',
    path: '/blocks/block_001',
    body: { block: 'draft' },
  }, { noteBlocks })).status, 200);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'DELETE',
    path: '/blocks/block_001',
  }, { noteBlocks })).status, 204);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes/note_001/digest',
  }, { digestRead })).status, 200);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/memory/memory_001/accept',
  }, { memoryReview })).status, 200);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/memory/memory_001/reject',
  }, { memoryReview })).status, 200);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/memory/memory_001/edit',
    body: { content: 'updated memory content' },
  }, { memoryReview })).status, 200);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/memory/memory_001/delete',
  }, { memoryReview })).status, 200);
  assert.equal((await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/memory/memory_001/hold',
  }, { memoryReview })).status, 200);

  assert.deepEqual(calls, [
    ['createBlock', 'note_001', { block: 'draft' }],
    ['updateBlock', 'block_001', { block: 'draft' }],
    ['deleteBlock', 'block_001'],
    ['getDigest', 'note_001'],
    ['acceptMemory', 'memory_001'],
    ['rejectMemory', 'memory_001'],
    ['editMemory', 'memory_001', { content: 'updated memory content' }],
    ['deleteMemory', 'memory_001'],
    ['holdMemory', 'memory_001'],
  ]);
});

test('worker HTTP router delegates provenance source lookup body to the configured port', async () => {
  const calls = [];
  const body = {
    sourceSpanId: 'source_span_001',
    sourceBlockId: 'block_001',
    startOffset: 3,
    endOffset: 12,
  };
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/provenance/source',
    body,
  }, {
    provenanceLookup: {
      async lookupSource(input) {
        calls.push(input);
        return {
          ok: true,
          errors: [],
          body: {
            available: true,
            sourceSpanId: input.sourceSpanId,
            sourceBlockId: input.sourceBlockId,
            excerpt: 'bounded source',
          },
        };
      },
    },
  });

  assert.deepEqual(calls, [{
    workspaceId: noteFixture.workspaceId,
    ...body,
  }]);
  assert.deepEqual(response, {
    status: 200,
    body: {
      ok: true,
      result: {
        available: true,
        sourceSpanId: 'source_span_001',
        sourceBlockId: 'block_001',
        excerpt: 'bounded source',
      },
    },
  });
});

test('worker HTTP router rejects invalid provenance source lookup body before delegated ports', async () => {
  let lookupCalls = 0;
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/provenance/source',
    body: {
      sourceSpanId: 'source_span_001',
      sourceBlockId: 'block_001',
      startOffset: 12,
      endOffset: 3,
    },
  }, {
    provenanceLookup: {
      async lookupSource() {
        lookupCalls += 1;
        return { ok: true, errors: [], body: { available: false } };
      },
    },
  });

  assert.equal(lookupCalls, 0);
  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      errors: ['endOffset must be greater than or equal to startOffset'],
    },
  });
});

test('worker HTTP router delegates note leave cause preservation to note structure runtime handler', async () => {
  const queue = createQueuePort();
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    userId: 'user_001',
    method: 'POST',
    path: `/notes/${noteFixture.id}/leave`,
    body: { cause: 'tab_switch' },
  }, {
    noteStructure: createSchedulerPorts({ queue }),
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.triggerReason, 'tab_switched');
  assert.deepEqual(
    queue.enqueuedJobs.map((job) => job.triggerReason),
    ['tab_switched'],
  );
});

test('worker HTTP router saves latest leave block updates before note structure dispatch', async () => {
  const calls = [];
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    userId: 'user_001',
    method: 'POST',
    path: `/notes/${noteFixture.id}/leave`,
    body: {
      cause: 'app_leave',
      latestBlockUpdates: [
        {
          blockId: 'block_paragraph_001',
          content: '  Latest app leave draft.  ',
        },
        {
          blockId: 'block_paragraph_002',
          content: 'Second app leave draft.',
        },
      ],
    },
  }, {
    noteBlocks: {
      async updateBlock(input) {
        calls.push(['updateBlock', input.blockId, input.noteId, input.body]);
        return { ok: true, errors: [], body: { updated: true } };
      },
      async createBlock() {
        throw new Error('leave latest updates must not create blocks');
      },
      async deleteBlock() {
        throw new Error('leave latest updates must not delete blocks');
      },
    },
    noteStructureRoute: {
      async runNoteStructureRoute(input) {
        calls.push(['noteStructureRoute', input.route, input.cause]);
        return {
          ok: true,
          route: input.route,
          triggerReason: 'app_left',
          scheduledJobs: [{ id: 'structure_job_app_leave_001' }],
          providerCalls: [],
          operationRoutingCalls: [],
          auditWrites: [],
          errors: [],
        };
      },
    },
  });

  assert.deepEqual(calls, [
    [
      'updateBlock',
      'block_paragraph_001',
      noteFixture.id,
      {
        noteId: noteFixture.id,
        content: '  Latest app leave draft.  ',
      },
    ],
    [
      'updateBlock',
      'block_paragraph_002',
      noteFixture.id,
      {
        noteId: noteFixture.id,
        content: 'Second app leave draft.',
      },
    ],
    ['noteStructureRoute', 'note_leave', 'app_leave'],
  ]);
  assert.deepEqual(response, {
    status: 202,
    body: {
      ok: true,
      route: 'note_leave',
      triggerReason: 'app_left',
      scheduledJobs: [{ id: 'structure_job_app_leave_001' }],
      errors: [],
    },
  });
});

test('worker HTTP router blocks note leave scheduling when latest block update fails', async () => {
  let structureCalls = 0;
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: `/notes/${noteFixture.id}/leave`,
    body: {
      cause: 'app_leave',
      latestBlockUpdates: [{
        blockId: 'block_paragraph_001',
        content: 'Draft rejected by Note Model command boundary.',
      }],
    },
  }, {
    noteBlocks: {
      async updateBlock() {
        return { ok: false, errors: ['block not found'] };
      },
      async createBlock() {
        throw new Error('unexpected create');
      },
      async deleteBlock() {
        throw new Error('unexpected delete');
      },
    },
    noteStructureRoute: {
      async runNoteStructureRoute() {
        structureCalls += 1;
        throw new Error('structure route must not run after latest save failure');
      },
    },
  });

  assert.equal(structureCalls, 0);
  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      errors: ['block not found'],
    },
  });
});

test('worker HTTP router rejects invalid latest leave block updates before ports', async () => {
  let updateCalls = 0;
  let structureCalls = 0;
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: `/notes/${noteFixture.id}/leave`,
    body: {
      cause: 'app_leave',
      latestBlockUpdates: [
        {
          blockId: 'block/paragraph/001',
          content: 'Invalid block id.',
        },
        {
          blockId: 'block_paragraph_002',
          content: '   ',
        },
      ],
    },
  }, {
    noteBlocks: {
      async updateBlock() {
        updateCalls += 1;
        throw new Error('latest update validation should stop before noteBlocks');
      },
      async createBlock() {
        throw new Error('unexpected create');
      },
      async deleteBlock() {
        throw new Error('unexpected delete');
      },
    },
    noteStructureRoute: {
      async runNoteStructureRoute() {
        structureCalls += 1;
        throw new Error('structure route must not run after invalid latest updates');
      },
    },
  });

  assert.equal(updateCalls, 0);
  assert.equal(structureCalls, 0);
  assert.equal(response.status, 400);
  assert.match(response.body.errors.join('\n'), /latestBlockUpdates\[0\]\.blockId/);
  assert.match(response.body.errors.join('\n'), /latestBlockUpdates\[1\]\.content/);
});

test('worker HTTP router delegates note structure routes through route port before scheduler ports', async () => {
  const calls = [];
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    userId: 'user_001',
    method: 'POST',
    path: `/notes/${noteFixture.id}/leave`,
    body: { cause: 'tab_switch' },
  }, {
    noteStructureRoute: {
      async runNoteStructureRoute(input) {
        calls.push(input);
        return {
          ok: true,
          route: input.route,
          triggerReason: 'tab_switched',
          scheduledJobs: [{ id: 'structure_job_rpc_001' }],
          providerCalls: [],
          operationRoutingCalls: [],
          auditWrites: [],
          errors: [],
        };
      },
    },
    noteStructure: createSchedulerPorts({
      noteSnapshot: {
        async loadSections() {
          throw new Error('direct scheduler ports must not be called when route port is configured');
        },
      },
    }),
  });

  assert.deepEqual(calls, [{
    workspaceId: noteFixture.workspaceId,
    userId: 'user_001',
    noteId: noteFixture.id,
    route: 'note_leave',
    cause: 'tab_switch',
    now,
  }]);
  assert.deepEqual(response, {
    status: 202,
    body: {
      ok: true,
      route: 'note_leave',
      triggerReason: 'tab_switched',
      scheduledJobs: [{ id: 'structure_job_rpc_001' }],
      errors: [],
    },
  });
});

test('worker HTTP router rejects invalid note leave cause before scheduler ports', async () => {
  let loadSections = 0;
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: `/notes/${noteFixture.id}/leave`,
    body: { cause: 'keystroke' },
  }, {
    noteStructure: createSchedulerPorts({
      noteSnapshot: {
        async loadSections() {
          loadSections += 1;
          return schedulerSectionsFixture;
        },
      },
    }),
  });

  assert.equal(loadSections, 0);
  assert.deepEqual(response, {
    status: 400,
    body: {
      ok: false,
      errors: ['note_leave cause must be one of note_close, tab_switch, app_leave, note_closed, tab_switched, app_left'],
    },
  });
});

test('worker HTTP router delegates AI operation accept and dismiss to approval handlers', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  await proposalPersistence.saveProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_accept_001',
    auditRecord: proposalAuditRecord('operation_accept_001'),
    now,
  });
  await proposalPersistence.saveProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_dismiss_001',
    auditRecord: proposalAuditRecord('operation_dismiss_001'),
    now,
  });

  const accept = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/ai-operations/operation_accept_001/accept',
  }, { operationApproval: proposalPersistence });
  const dismiss = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/ai-operations/operation_dismiss_001/dismiss',
  }, { operationApproval: proposalPersistence });

  assert.equal(accept.status, 200);
  assert.equal(accept.body.approvedIntent.operationId, 'operation_accept_001');
  assert.equal(dismiss.status, 200);
  assert.equal(dismiss.body.proposal.state, 'dismissed');
});

test('worker HTTP router connects accepted memory candidate proposals to the memory proposal boundary', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const memoryCandidatePersistence = new InMemoryMemoryCandidatePersistencePort();
  await proposalPersistence.saveProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_memory_candidate_001',
    auditRecord: memoryProposalAuditRecord('operation_memory_candidate_001'),
    now,
  });

  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    userId: 'user_001',
    method: 'POST',
    path: '/ai-operations/operation_memory_candidate_001/accept',
  }, {
    operationApproval: proposalPersistence,
    memoryCandidatePersistence,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.proposal.state, 'accepted');
  assert.equal(response.body.memoryCandidate.ok, true);
  assert.equal(response.body.memoryCandidate.memory.id, 'memory_operation_memory_candidate_001');
  assert.equal(response.body.memoryCandidate.memory.workspaceId, noteFixture.workspaceId);
  assert.equal(response.body.memoryCandidate.memory.userId, 'user_001');
  assert.equal(memoryCandidatePersistence.listMemories().length, 1);
});

test('worker HTTP router preflights memory candidate proposal requirements before accepting proposals', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  const memoryCandidatePersistence = new InMemoryMemoryCandidatePersistencePort();
  await proposalPersistence.saveProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_memory_candidate_missing_user_001',
    auditRecord: memoryProposalAuditRecord('operation_memory_candidate_missing_user_001'),
    now,
  });
  await proposalPersistence.saveProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_memory_candidate_source_less_001',
    auditRecord: memoryProposalAuditRecord('operation_memory_candidate_source_less_001', {
      noteId: undefined,
      operation: {
        ...validOperationFixtures[2],
        sourceSpans: [{ blockId: 'block_001' }],
      },
    }),
    now,
  });

  const missingUser = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/ai-operations/operation_memory_candidate_missing_user_001/accept',
  }, {
    operationApproval: proposalPersistence,
    memoryCandidatePersistence,
  });
  const sourceLess = await handleWorkerHttpRequest({
    ...baseRequest,
    userId: 'user_001',
    method: 'POST',
    path: '/ai-operations/operation_memory_candidate_source_less_001/accept',
  }, {
    operationApproval: proposalPersistence,
    memoryCandidatePersistence,
  });

  assert.equal(missingUser.status, 400);
  assert.deepEqual(missingUser.body.errors, [
    'userId must be a stable non-sentinel runtime id for memory candidate proposal persistence',
  ]);
  assert.equal(sourceLess.status, 400);
  assert.deepEqual(sourceLess.body.errors, ['memory candidate: memory item must include source provenance']);
  assert.equal((await proposalPersistence.findProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_memory_candidate_missing_user_001',
  })).state, 'pending');
  assert.equal((await proposalPersistence.findProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_memory_candidate_source_less_001',
  })).state, 'pending');
  assert.equal(memoryCandidatePersistence.listMemories().length, 0);
});

test('worker HTTP router does not call memory persistence for accepted insert_assist_block proposals', async () => {
  const proposalPersistence = new InMemoryOperationProposalPersistencePort();
  let memoryWrites = 0;
  await proposalPersistence.saveProposal({
    workspaceId: noteFixture.workspaceId,
    operationId: 'operation_assist_001',
    auditRecord: proposalAuditRecord('operation_assist_001'),
    now,
  });

  const response = await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/ai-operations/operation_assist_001/accept',
  }, {
    operationApproval: proposalPersistence,
    memoryCandidatePersistence: {
      async saveMemoryCandidate() {
        memoryWrites += 1;
        return { ok: true, errors: [] };
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.memoryCandidate, { ok: true, errors: [] });
  assert.equal(memoryWrites, 0);
});

test('worker HTTP router returns explicit not configured for unimplemented port-backed routes', async () => {
  assert.deepEqual(await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes',
  }, {}), {
    status: 501,
    body: { ok: false, errors: ['note list port is not configured'] },
  });
  assert.deepEqual(await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'POST',
    path: '/provenance/source',
    body: {
      sourceSpanId: 'source_span_001',
      sourceBlockId: 'block_001',
      startOffset: 0,
      endOffset: 4,
    },
  }, {}), {
    status: 501,
    body: { ok: false, errors: ['provenance lookup port is not configured'] },
  });
});

test('worker HTTP router source stays a thin routing boundary', async () => {
  const source = await readFile(new URL('apps/worker/src/runtime/http/workerHttpRouter.ts', root), 'utf8');

  assert.doesNotMatch(source, /from ['"].*docs\/generated\//);
  assert.doesNotMatch(source, /operationRouter|OperationRouter|providerRegistry|createStaticOperationGenerationProviderRegistry/);
  assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from)\s+[`"]?(?:notes|sections|blocks|ai_operations|source_spans|semantic_units|memory_items)[`"]?\b/i);
});

function createSchedulerPorts({ queue = createQueuePort(), noteSnapshot = createNoteSnapshotPort() } = {}) {
  return {
    noteSnapshot,
    structureJobQueue: queue,
    nextOpenDigestPreparation: {
      async prepareDigest() {
        return { ok: true, errors: [] };
      },
    },
  };
}

function createNoteSnapshotPort() {
  return {
    async loadSections() {
      return [dirtyFlagSectionFixture];
    },
  };
}

function createQueuePort() {
  const queue = {
    enqueuedJobs: [],
    async listCompletedJobs() {
      return [];
    },
    async enqueueJobs(jobs) {
      queue.enqueuedJobs.push(...jobs);
      return { ok: true, enqueuedCount: jobs.length, errors: [] };
    },
  };
  return queue;
}

function proposalAuditRecord(operationId) {
  return {
    id: operationId,
    workspaceId: noteFixture.workspaceId,
    noteId: noteFixture.id,
    structureJobId: 'structure_job_001',
    operationType: 'insert_assist_block',
    policy: 'inline',
    status: 'proposed',
    operation: validOperationFixtures[2],
    errors: [],
    sourceSpans: [],
    confidence: 0.91,
    targetType: 'block',
    targetId: 'block_001',
    generatedBy: 'worker_runtime',
    createdAt: now,
    updatedAt: now,
  };
}

function memoryProposalAuditRecord(operationId, overrides = {}) {
  const operation = overrides.operation ?? {
    ...validOperationFixtures[2],
    sourceSpans: [{ blockId: 'block_001', startOffset: 0, endOffset: 42 }],
  };
  const noteId = Object.hasOwn(overrides, 'noteId') ? overrides.noteId : noteFixture.id;

  return {
    id: operationId,
    workspaceId: noteFixture.workspaceId,
    ...(noteId === undefined ? {} : { noteId }),
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
    createdAt: now,
    updatedAt: now,
  };
}
