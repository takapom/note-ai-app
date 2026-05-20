import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createNoteAgentObjectName,
  createWorkspaceBrainAgentObjectName,
  readDurableObjectNamespace,
  scheduleNoteStructureThroughAgent,
  processWorkspaceBrainThroughAgent,
} from '../../apps/worker/src/cloudflareAgentRpcBoundary.ts';

const root = new URL('../../', import.meta.url);

test('Cloudflare Agent RPC boundary invokes stub methods through direct RPC call shape', async () => {
  const source = await readFile(new URL('apps/worker/src/cloudflareAgentRpcBoundary.ts', root), 'utf8');

  assert.doesNotMatch(source, /\.call\(stub/);
  assert.match(source, /\[input\.methodName\]\(\s*input\.command,\s*\)/s);
});

test('Cloudflare Agent RPC boundary derives stable object names without runtime values in config', () => {
  assert.deepEqual(
    createNoteAgentObjectName({ workspaceId: 'workspace_001', noteId: 'note_001' }),
    { ok: true, objectName: 'workspace_001:note_001' },
  );
  assert.deepEqual(
    createWorkspaceBrainAgentObjectName({ workspaceId: 'workspace_001' }),
    { ok: true, objectName: 'workspace_001' },
  );
});

test('Cloudflare Agent RPC boundary invokes NoteAgent stub with serializable command', async () => {
  const calls = [];
  const namespace = createNamespace({
    async scheduleNoteStructure(command) {
      calls.push(command);
      return {
        ok: true,
        accepted: true,
        reason: 'tab_switched',
        scheduledJobIds: ['structure_job_001'],
        scheduledJobs: [{ id: 'structure_job_001' }],
        providerCalls: [],
        operationRoutingCalls: [],
        auditWrites: [],
        noteSotMutations: [],
        errors: [],
      };
    },
  });

  const result = await scheduleNoteStructureThroughAgent({
    namespace,
    command: {
      workspaceId: 'workspace_001',
      noteId: 'note_001',
      route: 'note_leave',
      cause: 'tab_switch',
      now: 1_764_001_000_000,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.reason, 'tab_switched');
  assert.deepEqual(result.result.scheduledJobIds, ['structure_job_001']);
  assert.deepEqual(calls, [{
    workspaceId: 'workspace_001',
    noteId: 'note_001',
    route: 'note_leave',
    cause: 'tab_switch',
    now: 1_764_001_000_000,
  }]);
});

test('Cloudflare Agent RPC boundary invokes WorkspaceBrainAgent stub', async () => {
  const namespace = createNamespace({
    async processNextQueuedStructureJob(command) {
      return {
        ok: true,
        accepted: true,
        reason: `processed:${command.workspaceId}:${command.userId}`,
        scheduledJobIds: ['structure_job_001'],
        providerCalls: [{ providerId: 'provider_001', structureJobId: 'structure_job_001' }],
        operationRoutingCalls: [{ structureJobId: 'structure_job_001' }],
        auditWrites: [{ structureJobId: 'structure_job_001', savedCount: 1 }],
        noteSotMutations: [],
        errors: [],
      };
    },
  });

  const result = await processWorkspaceBrainThroughAgent({
    namespace,
    command: {
      workspaceId: 'workspace_001',
      userId: 'user_001',
      now: 1_764_001_000_000,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.reason, 'processed:workspace_001:user_001');
  assert.deepEqual(result.result.noteSotMutations, []);
});

test('Cloudflare Agent RPC boundary normalizes namespace and thrown failures', async () => {
  assert.equal(readDurableObjectNamespace({}), undefined);

  const missingMethod = await scheduleNoteStructureThroughAgent({
    namespace: createNamespace({}),
    command: {
      workspaceId: 'workspace_001',
      noteId: 'note_001',
      route: 'manual_organize',
      now: 1,
    },
  });
  assert.deepEqual(missingMethod, {
    ok: false,
    reason: 'agent_rpc_method_missing',
    binding: 'NOTE_AGENT',
    objectName: 'workspace_001:note_001',
    methodName: 'scheduleNoteStructure',
    errors: ['scheduleNoteStructure RPC method is not available on NOTE_AGENT'],
  });

  const thrown = await processWorkspaceBrainThroughAgent({
    namespace: createNamespace({
      async processNextQueuedStructureJob() {
        throw new Error('workerd internal token secret sql failure');
      },
    }),
    command: {
      workspaceId: 'workspace_001',
      userId: 'user_001',
      now: 1,
    },
  });
  assert.deepEqual(thrown, {
    ok: false,
    reason: 'agent_rpc_invocation_failed',
    binding: 'WORKSPACE_BRAIN_AGENT',
    objectName: 'workspace_001',
    methodName: 'processNextQueuedStructureJob',
    errors: ['WORKSPACE_BRAIN_AGENT agent RPC invocation failed'],
  });
  assert.doesNotMatch(JSON.stringify(thrown), /workerd|secret|token|sql/i);
});

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
