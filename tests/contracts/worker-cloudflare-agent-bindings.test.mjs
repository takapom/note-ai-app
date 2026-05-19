import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NOTE_AGENT_CLASS_NAME,
  NOTE_AGENT_DEPLOYMENT_BINDING,
  NoteAgent,
  WORKSPACE_BRAIN_AGENT_CLASS_NAME,
  WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
  WorkspaceBrainAgent,
  cloudflareAgentBindingDescriptors,
  createCloudflareDurableObjectBindingDescriptors,
  createCloudflareAgentBindings,
  getCloudflareAgentBindingDescriptor,
  noteAgentBindingDescriptor,
  toCloudflareDurableObjectBindingDescriptor,
  workspaceBrainAgentBindingDescriptor,
} from '../../apps/worker/src/cloudflareAgentBindings.ts';

const root = new URL('../../', import.meta.url);

test('Cloudflare Agent binding descriptors name deployment bindings and runtime roles', () => {
  assert.deepEqual(
    cloudflareAgentBindingDescriptors.map((descriptor) => [
      descriptor.className,
      descriptor.deploymentBinding,
      descriptor.deploymentBindingKind,
      descriptor.moduleExport,
      descriptor.ownsRuntimePolicy,
      descriptor.delegatesTo,
    ]),
    [
      [
        NOTE_AGENT_CLASS_NAME,
        NOTE_AGENT_DEPLOYMENT_BINDING,
        'durable_object_namespace',
        NOTE_AGENT_CLASS_NAME,
        false,
        ['runNoteStructureRouteHandler'],
      ],
      [
        WORKSPACE_BRAIN_AGENT_CLASS_NAME,
        WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
        'durable_object_namespace',
        WORKSPACE_BRAIN_AGENT_CLASS_NAME,
        false,
        ['runStructureJobAgentHandler', 'runStructureJobProcessorFlow'],
      ],
    ],
  );

  assert.ok(noteAgentBindingDescriptor.runtimeRole.includes('edit event buffer'));
  assert.ok(noteAgentBindingDescriptor.runtimeRole.includes('dirty section tracking'));
  assert.ok(noteAgentBindingDescriptor.runtimeRole.includes('note leave handling'));
  assert.ok(noteAgentBindingDescriptor.runtimeRole.includes('structure job scheduling'));
  assert.ok(noteAgentBindingDescriptor.runtimeRole.includes('context_hash dedupe coordination'));

  assert.ok(workspaceBrainAgentBindingDescriptor.runtimeRole.includes('related context retrieval coordination'));
  assert.ok(workspaceBrainAgentBindingDescriptor.runtimeRole.includes('memory candidate management coordination'));
  assert.ok(workspaceBrainAgentBindingDescriptor.runtimeRole.includes('workspace-wide semantic graph coordination'));
  assert.ok(workspaceBrainAgentBindingDescriptor.runtimeRole.includes('queued structure job processing'));

  assert.equal(
    getCloudflareAgentBindingDescriptor(NOTE_AGENT_CLASS_NAME),
    noteAgentBindingDescriptor,
  );
  assert.equal(
    getCloudflareAgentBindingDescriptor(WORKSPACE_BRAIN_AGENT_CLASS_NAME),
    workspaceBrainAgentBindingDescriptor,
  );
});

test('Cloudflare Agent descriptors generate SDK-neutral Durable Object binding records', () => {
  assert.deepEqual(
    createCloudflareDurableObjectBindingDescriptors(),
    [
      {
        name: NOTE_AGENT_DEPLOYMENT_BINDING,
        class_name: NOTE_AGENT_CLASS_NAME,
      },
      {
        name: WORKSPACE_BRAIN_AGENT_DEPLOYMENT_BINDING,
        class_name: WORKSPACE_BRAIN_AGENT_CLASS_NAME,
      },
    ],
  );

  assert.deepEqual(
    toCloudflareDurableObjectBindingDescriptor(noteAgentBindingDescriptor),
    {
      name: NOTE_AGENT_DEPLOYMENT_BINDING,
      class_name: NOTE_AGENT_CLASS_NAME,
    },
  );
});

test('NoteAgent delegates route inputs unchanged to the runtime handler', async () => {
  const input = { marker: 'note-route-input' };
  const expectedResult = {
    ok: true,
    route: 'note_leave',
    scheduledJobs: [],
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    errors: [],
  };
  let capturedInput;

  const agent = new NoteAgent({
    async runNoteStructureRouteHandler(nextInput) {
      capturedInput = nextInput;
      return expectedResult;
    },
  });

  const result = await agent.handleNoteStructureRoute(input);

  assert.equal(agent.descriptor, noteAgentBindingDescriptor);
  assert.equal(capturedInput, input);
  assert.equal(result, expectedResult);
});

test('WorkspaceBrainAgent delegates structure job inputs unchanged to runtime flows', async () => {
  const structureJobInput = { marker: 'structure-job-input' };
  const processorInput = { marker: 'processor-input' };
  const expectedAgentResult = {
    ok: true,
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    directApplyResults: [],
    noteSotMutations: [],
    errors: [],
  };
  const expectedProcessorResult = {
    ok: true,
    attempted: false,
    reason: 'no_queued_job',
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    directApplyResults: [],
    noteSotMutations: [],
    errors: [],
  };
  const calls = [];

  const agent = new WorkspaceBrainAgent({
    async runStructureJobAgentHandler(nextInput) {
      calls.push(['agent', nextInput]);
      return expectedAgentResult;
    },
    async runStructureJobProcessorFlow(nextInput) {
      calls.push(['processor', nextInput]);
      return expectedProcessorResult;
    },
  });

  const agentResult = await agent.handleStructureJob(structureJobInput);
  const processorResult = await agent.processNextStructureJob(processorInput);

  assert.equal(agent.descriptor, workspaceBrainAgentBindingDescriptor);
  assert.deepEqual(calls, [
    ['agent', structureJobInput],
    ['processor', processorInput],
  ]);
  assert.equal(agentResult, expectedAgentResult);
  assert.equal(processorResult, expectedProcessorResult);
});

test('binding factory returns framework-neutral NoteAgent and WorkspaceBrainAgent instances', async () => {
  const noteInput = { marker: 'factory-note-input' };
  const processorInput = { marker: 'factory-processor-input' };
  const expectedNoteResult = { ok: true, route: 'manual_organize', errors: [] };
  const expectedProcessorResult = { ok: true, reason: 'completed', errors: [] };
  const calls = [];

  const bindings = createCloudflareAgentBindings({
    noteAgent: {
      async runNoteStructureRouteHandler(input) {
        calls.push(['note', input]);
        return expectedNoteResult;
      },
    },
    workspaceBrainAgent: {
      async runStructureJobAgentHandler() {
        throw new Error('single job handler should not be called by this test');
      },
      async runStructureJobProcessorFlow(input) {
        calls.push(['processor', input]);
        return expectedProcessorResult;
      },
    },
  });

  assert.ok(bindings.NoteAgent instanceof NoteAgent);
  assert.ok(bindings.WorkspaceBrainAgent instanceof WorkspaceBrainAgent);
  assert.equal(await bindings.NoteAgent.handleNoteStructureRoute(noteInput), expectedNoteResult);
  assert.equal(await bindings.WorkspaceBrainAgent.processNextStructureJob(processorInput), expectedProcessorResult);
  assert.deepEqual(calls, [
    ['note', noteInput],
    ['processor', processorInput],
  ]);
});

test('Cloudflare Agent binding source avoids SDK imports and direct persistence shortcuts', async () => {
  const source = await readFile(new URL('apps/worker/src/cloudflareAgentBindings.ts', root), 'utf8');

  assert.match(source, /class NoteAgent/);
  assert.match(source, /class WorkspaceBrainAgent/);
  assert.match(source, /runNoteStructureRouteHandler/);
  assert.match(source, /runStructureJobAgentHandler/);
  assert.match(source, /runStructureJobProcessorFlow/);
  assert.doesNotMatch(source, /from\s+['"]cloudflare:workers['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(@cloudflare|cloudflare\/agents|agents-sdk)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*noteDocument(SqlAdapter|PersistencePort)\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*noteBlockCommandPort\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(workspace-api\/generated|generated\/openapi|openapi\.json)/i);
  assert.doesNotMatch(source, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
  assert.doesNotMatch(source, /\b(notes|sections|blocks)\s+(set|values)\b/i);
});
