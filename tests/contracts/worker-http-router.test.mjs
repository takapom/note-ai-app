import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  handleWorkerHttpRequest,
  matchWorkerRoute,
} from '../../apps/worker/src/workerHttpRouter.ts';
import { InMemoryOperationProposalPersistencePort } from '../../apps/worker/src/operationProposalPort.ts';
import { InMemoryNoteDocumentPersistencePort } from '../../apps/worker/src/noteDocumentPersistencePort.ts';
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
  assert.deepEqual(matchWorkerRoute('POST', '/ai-operations/operation_001/accept'), { name: 'accept_operation', params: { operationId: 'operation_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/ai-operations/operation_001/dismiss'), { name: 'dismiss_operation', params: { operationId: 'operation_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/accept'), { name: 'accept_memory', params: { memoryId: 'memory_001' } });
  assert.deepEqual(matchWorkerRoute('POST', '/memory/memory_001/reject'), { name: 'reject_memory', params: { memoryId: 'memory_001' } });
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

  assert.deepEqual(calls, [
    ['createBlock', 'note_001', { block: 'draft' }],
    ['updateBlock', 'block_001', { block: 'draft' }],
    ['deleteBlock', 'block_001'],
    ['getDigest', 'note_001'],
    ['acceptMemory', 'memory_001'],
    ['rejectMemory', 'memory_001'],
  ]);
});

test('worker HTTP router delegates note leave cause preservation to note structure runtime handler', async () => {
  const queue = createQueuePort();
  const response = await handleWorkerHttpRequest({
    ...baseRequest,
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

test('worker HTTP router returns explicit not configured for unimplemented port-backed routes', async () => {
  assert.deepEqual(await handleWorkerHttpRequest({
    ...baseRequest,
    method: 'GET',
    path: '/notes',
  }, {}), {
    status: 501,
    body: { ok: false, errors: ['note list port is not configured'] },
  });
});

test('worker HTTP router source stays a thin routing boundary', async () => {
  const source = await readFile(new URL('apps/worker/src/workerHttpRouter.ts', root), 'utf8');

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
