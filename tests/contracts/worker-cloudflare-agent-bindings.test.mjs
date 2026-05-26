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
  createWorkspaceBrainStructureJobProcessorInput,
  createCloudflareDurableObjectBindingDescriptors,
  createCloudflareAgentBindings,
  getCloudflareAgentBindingDescriptor,
  noteAgentBindingDescriptor,
  toCloudflareDurableObjectBindingDescriptor,
  workspaceBrainAgentBindingDescriptor,
} from '../../apps/worker/src/runtime/cloudflare/cloudflareAgentBindings.ts';
import {
  createWorkspaceBrainStructureJobProcessorOptions,
} from '../../apps/worker/src/runtime/composition/workerRuntimePorts.ts';
import { operationRouterSnapshotFixture } from '../../contexts/ai-operations/src/contract/operationRouterFixtures.ts';

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

test('WorkspaceBrainAgent builds processor flow input from serializable command and injected runtime options', async () => {
  const command = {
    workspaceId: 'workspace_001',
    userId: 'user_001',
    now: 1_764_000_700_000,
  };
  const options = createProcessorOptions();
  const calls = [];
  const expectedProcessorResult = {
    ok: true,
    attempted: false,
    reason: 'no_queued_job',
    claim: { ok: true, errors: [] },
    providerCalls: [],
    operationRoutingCalls: [],
    auditWrites: [],
    directApplyResults: [],
    noteSotMutations: [],
    errors: [],
  };

  const input = createWorkspaceBrainStructureJobProcessorInput(command, options);
  assert.equal(input.ok, true);
  assert.equal(input.input.workspaceId, command.workspaceId);
  assert.equal(input.input.userId, command.userId);
  assert.equal(input.input.now, command.now);
  assert.equal(input.input.workQueue, options.workQueue);
  assert.equal(input.input.contextAssemblyPorts, options.contextAssemblyPorts);
  assert.equal(input.input.providerRegistry, options.providerRegistry);
  assert.equal(input.input.operationFlow, options.operationFlow);

  const agent = new WorkspaceBrainAgent({
    async runStructureJobAgentHandler() {
      throw new Error('single job handler should not be called by processor command');
    },
    async runStructureJobProcessorFlow(nextInput) {
      calls.push(nextInput);
      return expectedProcessorResult;
    },
  });

  const result = await agent.processNextQueuedStructureJob(command, options);

  assert.equal(result, expectedProcessorResult);
  assert.deepEqual(calls, [input.input]);
});

test('WorkspaceBrainAgent rejects non-serializable processor command before runtime flow delegation', async () => {
  const calls = [];
  const agent = new WorkspaceBrainAgent({
    async runStructureJobAgentHandler() {
      throw new Error('single job handler should not be called by invalid processor command');
    },
    async runStructureJobProcessorFlow(nextInput) {
      calls.push(nextInput);
      return { ok: true, attempted: false, reason: 'no_queued_job', errors: [] };
    },
  });

  const result = await agent.processNextQueuedStructureJob({
    workspaceId: 'workspace_001',
    userId: 'user_001',
    now: 1_764_000_700_000,
    workQueue: () => undefined,
  }, createProcessorOptions());

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['workQueue must be serializable']);
  assert.deepEqual(calls, []);
});

test('Worker runtime wiring builds WorkspaceBrain processor options from deployment bindings', () => {
  const turso = createSqlClient();
  const agentLocal = createSqlClient();
  const providerRegistry = {
    resolveProvider() {
      return undefined;
    },
  };

  const result = createWorkspaceBrainStructureJobProcessorOptions({
    env: {
      TURSO: turso,
      AGENT_LOCAL_SQL: agentLocal,
      WORKSPACE_BRAIN_OPERATION_PROVIDER_REGISTRY: providerRegistry,
      WORKSPACE_BRAIN_OPERATION_ROUTER_SNAPSHOT: operationRouterSnapshotFixture,
    },
    now: 1_764_000_700_000,
  });

  assert.equal(result.ok, true);
  assert.ok(result.options.workQueue);
  assert.ok(result.options.contextAssemblyPorts.targetSnapshot);
  assert.ok(result.options.contextAssemblyPorts.localStructure);
  assert.ok(result.options.contextAssemblyPorts.relatedContext);
  assert.ok(result.options.contextAssemblyPorts.memoryContext);
  assert.equal(result.options.providerRegistry, providerRegistry);
  assert.equal(result.options.operationFlow.snapshot, operationRouterSnapshotFixture);
  assert.equal(result.options.operationFlow.now, 1_764_000_700_000);
  assert.equal(result.options.operationFlow.generatedBy, 'worker_runtime');
  assert.ok(result.options.operationFlow.auditPersistence);
  assert.ok(result.options.operationFlow.auditRecoveryQueue);
});

test('Worker runtime wiring reports missing WorkspaceBrain deployment bindings with stable meanings', () => {
  const result = createWorkspaceBrainStructureJobProcessorOptions({
    env: {
      TURSO: createSqlClient(),
      AGENT_LOCAL_SQL: createSqlClient(),
    },
    now: Number.NaN,
  });

  assert.deepEqual(result, {
    ok: false,
    errors: [
      'workspace brain provider registry is not configured',
      'workspace brain operation router snapshot is not configured',
      'workspace brain processor now must be a finite number',
    ],
  });
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
  const source = await readFile(new URL('apps/worker/src/runtime/cloudflare/cloudflareAgentBindings.ts', root), 'utf8');

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

test('Cloudflare Durable Object adapter is deployable and only delegates to framework-neutral agents', async () => {
  const source = await readFile(new URL('apps/worker/src/runtime/cloudflare/cloudflareDurableObjectAgents.ts', root), 'utf8');

  assert.match(source, /from\s+['"]cloudflare:workers['"]/);
  assert.match(source, /class\s+NoteAgent\s+extends\s+DurableObject/);
  assert.match(source, /class\s+WorkspaceBrainAgent\s+extends\s+DurableObject/);
  assert.match(source, /new\s+NoteAgentRuntimeDelegate\(\)/);
  assert.match(source, /new\s+WorkspaceBrainAgentRuntimeDelegate\(\)/);
  assert.match(source, /scheduleNoteStructure\(\s*input:\s*NoteAgentScheduleStructureCommand/s);
  assert.match(source, /enqueueStructureJobs\(\s*input:\s*WorkspaceBrainEnqueueStructureJobsCommand/s);
  assert.match(source, /alarm\(\):\s*Promise<CloudflareAgentRpcResult>/);
  assert.match(source, /processNextQueuedStructureJob\(\s*input:\s*WorkspaceBrainProcessNextStructureJobCommand/s);
  assert.match(source, /WORKSPACE_BRAIN_STRUCTURE_JOB_PROCESSOR_OPTIONS/);
  assert.match(source, /createWorkspaceBrainStructureJobProcessorOptions/);
  assert.match(source, /enqueueWorkspaceBrainStructureJobs/);
  assert.match(source, /scheduleWorkspaceBrainProcessingAlarm/);
  assert.match(source, /shouldScheduleNextWorkspaceBrainAlarm/);
  assert.match(source, /runtimeDelegate\.processNextQueuedStructureJob\(input,\s*options\.options\)/);
  assert.doesNotMatch(source, /handleNoteStructureRoute\(\s*input:\s*NoteStructureRouteHandlerInput/s);
  assert.doesNotMatch(source, /handleStructureJob\(\s*input:\s*StructureJobAgentHandlerInput/s);
  assert.doesNotMatch(source, /processNextStructureJob\(\s*input:\s*StructureJobProcessorFlowInput/s);
  assert.doesNotMatch(source, /processNextQueuedStructureJob\(\s*input:\s*StructureJobProcessorFlowInput/s);
  assert.doesNotMatch(source, /from\s+['"][^'"]*(ai-sdk|openai|anthropic|google|mistral|cohere)/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRouterContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationContract\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationRoutingFlow\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*operationAudit/i);
  assert.doesNotMatch(source, /from\s+['"][^'"]*noteDocument(SqlAdapter|PersistencePort)\.ts['"]/);
  assert.doesNotMatch(source, /from\s+['"][^'"]*noteBlockCommandPort\.ts['"]/);
  assert.doesNotMatch(source, /\berror\.message\b|\berror\.trim\s*\(/);
  assert.doesNotMatch(source, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i);
  assert.doesNotMatch(source, /\b(notes|sections|blocks)\s+(set|values)\b/i);
});

function createSqlClient() {
  return {
    async execute() {
      return { rows: [] };
    },
  };
}

function createProcessorOptions() {
  return {
    workQueue: {
      async claimNextQueuedJob() {
        return { ok: true, errors: [] };
      },
      async markJobCompleted() {
        throw new Error('no queued job should not complete');
      },
      async markJobFailed() {
        throw new Error('no queued job should not fail');
      },
    },
    contextAssemblyPorts: {
      targetSnapshot: {
        async loadTargetContext() {
          throw new Error('no queued job should not assemble target context');
        },
      },
      localStructure: {
        async loadLocalStructure() {
          throw new Error('no queued job should not assemble local structure');
        },
      },
      relatedContext: {
        async loadRelatedContext() {
          throw new Error('no queued job should not assemble related context');
        },
      },
      memoryContext: {
        async loadMemoryContext() {
          throw new Error('no queued job should not assemble memory context');
        },
      },
    },
    providerRegistry: {
      async resolveProvider() {
        throw new Error('no queued job should not resolve provider');
      },
    },
    operationFlow: {
      snapshot: {},
      auditPersistence: {
        async save(record) {
          return { ok: true, errors: [], record };
        },
      },
      now: 1_764_000_700_100,
    },
  };
}
