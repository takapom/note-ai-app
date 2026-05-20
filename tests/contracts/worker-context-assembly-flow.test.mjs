import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultContextAssemblyLimits,
} from '../../contexts/context-assembly/src/contract/contextEnvelopeContract.ts';
import { contextAssemblyInputFixture } from '../../contexts/context-assembly/src/contract/contextEnvelopeFixtures.ts';
import { runContextEnvelopeAssemblyFlow } from '../../apps/worker/src/context-assembly/contextAssemblyRuntimeFlow.ts';

const runtimeInput = {
  workspaceId: 'workspace_001',
  userId: 'user_001',
  noteId: 'note_001',
  structureJobId: 'structure_job_context_001',
  targetScope: 'section',
  targetId: 'section_001',
  now: 1_764_000_200_000,
};

test('context assembly flow builds a valid envelope from retrieval ports without provider or routing calls', async () => {
  const calls = [];
  const ports = createPorts({ calls });

  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    ports,
  });

  assert.equal(result.validation.valid, true);
  assert.equal(result.envelope.target.scope, 'section');
  assert.deepEqual(result.envelope.target.sourceBlockIds, ['block_heading_001', 'block_paragraph_001']);
  assert.equal(result.event.type, 'ContextEnvelopeBuilt');
  assert.deepEqual(result.event, {
    type: 'ContextEnvelopeBuilt',
    workspaceId: runtimeInput.workspaceId,
    userId: runtimeInput.userId,
    noteId: runtimeInput.noteId,
    structureJobId: runtimeInput.structureJobId,
    targetScope: runtimeInput.targetScope,
    builtAt: runtimeInput.now,
  });
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(calls.map(([name]) => name), ['target', 'local', 'related', 'memory']);
  assert.deepEqual(calls.map(([, input]) => input.userId), [
    runtimeInput.userId,
    runtimeInput.userId,
    runtimeInput.userId,
    runtimeInput.userId,
  ]);
});

test('context assembly flow rejects invalid runtime input before calling ports', async () => {
  const calls = [];

  const result = await runContextEnvelopeAssemblyFlow({
    workspaceId: '',
    userId: '',
    noteId: ' ',
    structureJobId: '',
    targetScope: 'workspace',
    now: Number.NaN,
    ports: createPorts({ calls }),
  });

  assert.deepEqual(calls, []);
  assert.equal(result.envelope, undefined);
  assert.equal(result.event, undefined);
  assert.equal(result.validation.valid, false);
  assert.ok(result.errors.includes('workspaceId must be a non-empty string'));
  assert.ok(result.errors.includes('userId must be a non-empty string'));
  assert.ok(result.errors.includes('noteId must be a non-empty string'));
  assert.ok(result.errors.includes('structureJobId must be a non-empty string'));
  assert.ok(result.errors.includes('targetScope must be section, chunk, or note'));
  assert.ok(result.errors.includes('now must be a finite number'));
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('context assembly flow leaves invalid limit semantics to the Context Assembly contract', async () => {
  const calls = [];

  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    limits: {
      ...defaultContextAssemblyLimits,
      maxRelatedNotes: Number.NaN,
      maxContextCharacters: 0,
    },
    ports: createPorts({ calls }),
  });

  assert.deepEqual(calls.map(([name]) => name), ['target', 'local', 'related', 'memory']);
  assert.equal(result.validation.valid, false);
  assert.deepEqual(result.errors, ['context assembly limits must be finite non-negative numbers']);
  assert.equal(result.envelope, undefined);
  assert.equal(result.event, undefined);
});

test('context assembly flow stops after target snapshot failure', async () => {
  const calls = [];

  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    ports: createPorts({
      calls,
      targetSnapshot: {
        async loadTargetContext() {
          calls.push('target');
          throw new Error('target unavailable');
        },
      },
    }),
  });

  assert.deepEqual(calls, ['target']);
  assert.equal(result.validation.valid, false);
  assert.deepEqual(result.errors, ['target context snapshot failed: target unavailable']);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('context assembly flow rejects target snapshot scope mismatch before reading other context', async () => {
  const calls = [];

  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    ports: createPorts({
      calls,
      targetSnapshot: {
        async loadTargetContext(input) {
          calls.push(['target', input]);
          return {
            target: {
              ...contextAssemblyInputFixture.target,
              scope: 'note',
            },
            note: contextAssemblyInputFixture.note,
            outline: contextAssemblyInputFixture.outline,
          };
        },
      },
    }),
  });

  assert.deepEqual(calls.map(([name]) => name), ['target']);
  assert.equal(result.envelope, undefined);
  assert.equal(result.event, undefined);
  assert.equal(result.validation.valid, false);
  assert.deepEqual(result.errors, ['target snapshot scope note must match requested targetScope section']);
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('context assembly flow returns validation failure instead of provider-ready envelope', async () => {
  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    ports: createPorts({
      targetSnapshot: {
        async loadTargetContext() {
          return {
            target: {
              ...contextAssemblyInputFixture.target,
              sourceBlockIds: [],
            },
            note: contextAssemblyInputFixture.note,
            outline: contextAssemblyInputFixture.outline,
          };
        },
      },
    }),
  });

  assert.equal(result.envelope, undefined);
  assert.equal(result.event, undefined);
  assert.equal(result.validation.valid, false);
  assert.ok(result.errors.includes('target must include source block ids'));
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('context assembly flow rejects full workspace or full note dumps from retrieval ports', async () => {
  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    ports: createPorts({
      relatedContext: {
        async loadRelatedContext() {
          return {
            ...contextAssemblyInputFixture.relatedContext,
            notes: [
              {
                ...contextAssemblyInputFixture.relatedContext.notes[0],
                fullNoteText: 'full note dump must not pass through',
              },
            ],
          };
        },
      },
    }),
  });

  assert.equal(result.envelope, undefined);
  assert.equal(result.validation.valid, false);
  assert.ok(result.errors.includes('retrieval port output must not include full workspace, full notes, or dump fields'));
  assert.deepEqual(result.providerCalls, []);
  assert.deepEqual(result.operationRoutingCalls, []);
  assert.deepEqual(result.auditWrites, []);
});

test('context assembly flow keeps memory filtering in the Context Assembly contract', async () => {
  const result = await runContextEnvelopeAssemblyFlow({
    ...runtimeInput,
    ports: createPorts(),
  });

  assert.equal(result.validation.valid, true);
  assert.deepEqual(
    result.envelope.memoryContext.items.map((item) => item.id),
    ['memory_002', 'memory_001'],
  );
  assert.ok(!result.envelope.memoryContext.items.some((item) => item.id === 'memory_rejected_001'));
});

function createPorts(overrides = {}) {
  const calls = overrides.calls ?? [];
  return {
    targetSnapshot: overrides.targetSnapshot ?? {
      async loadTargetContext(input) {
        calls.push(['target', input]);
        return {
          target: contextAssemblyInputFixture.target,
          note: contextAssemblyInputFixture.note,
          outline: contextAssemblyInputFixture.outline,
        };
      },
    },
    localStructure: overrides.localStructure ?? {
      async loadLocalStructure(input) {
        calls.push(['local', input]);
        return contextAssemblyInputFixture.localStructure;
      },
    },
    relatedContext: overrides.relatedContext ?? {
      async loadRelatedContext(input) {
        calls.push(['related', input]);
        return contextAssemblyInputFixture.relatedContext;
      },
    },
    memoryContext: overrides.memoryContext ?? {
      async loadMemoryContext(input) {
        calls.push(['memory', input]);
        return contextAssemblyInputFixture.memoryContext;
      },
    },
  };
}
