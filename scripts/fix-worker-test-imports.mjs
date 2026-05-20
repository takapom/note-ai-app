#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const MODULE_MAP = new Map([
  ['workerEntrypoint', 'runtime/http/workerEntrypoint.ts'],
  ['workerHttpRouter', 'runtime/http/workerHttpRouter.ts'],
  ['workerAuthBoundary', 'runtime/http/workerAuthBoundary.ts'],
  ['cloudflareWorkerEntrypoint', 'runtime/cloudflare/cloudflareWorkerEntrypoint.ts'],
  ['cloudflareDurableObjectAgents', 'runtime/cloudflare/cloudflareDurableObjectAgents.ts'],
  ['cloudflareAgentRpcBoundary', 'runtime/cloudflare/cloudflareAgentRpcBoundary.ts'],
  ['cloudflareDurableObjectSqlAdapter', 'runtime/cloudflare/cloudflareDurableObjectSqlAdapter.ts'],
  ['cloudflareAgentBindings', 'runtime/cloudflare/cloudflareAgentBindings.ts'],
  ['cloudflareWorkersRuntimeTypes', 'runtime/cloudflare/cloudflareWorkersRuntimeTypes.d.ts'],
  ['durableObjectAgentLocalSchema', 'runtime/cloudflare/durableObjectAgentLocalSchema.ts'],
  ['noteStructureRouteRpcTypes', 'runtime/cloudflare/noteStructureRouteRpcTypes.ts'],
  ['workerRuntimePorts', 'runtime/composition/workerRuntimePorts.ts'],
  ['agentDelegates', 'runtime/composition/agentDelegates.ts'],
  ['localSmokeRuntime', 'runtime/local-verification/localSmokeRuntime.ts'],
  ['noteDocumentPersistencePort', 'note-model/noteDocumentPersistencePort.ts'],
  ['noteDocumentSqlAdapter', 'note-model/noteDocumentSqlAdapter.ts'],
  ['noteBlockCommandPort', 'note-model/noteBlockCommandPort.ts'],
  ['provenanceLookupPort', 'note-model/provenanceLookupPort.ts'],
  ['noteStructureRouteHandler', 'scheduler/noteStructureRouteHandler.ts'],
  ['noteStructureRuntimeHandlers', 'scheduler/noteStructureRouteHandler.ts'],
  ['structureSchedulerRuntimeFlow', 'scheduler/structureSchedulerRuntimeFlow.ts'],
  ['schedulerAgentLocalSqlAdapter', 'scheduler/schedulerAgentLocalSqlAdapter.ts'],
  ['schedulerNoteSnapshotSqlAdapter', 'scheduler/schedulerNoteSnapshotSqlAdapter.ts'],
  ['structureJobWorkQueuePort', 'scheduler/structureJobWorkQueuePort.ts'],
  ['structureJobWorkQueueAgentLocalSqlAdapter', 'scheduler/structureJobWorkQueueAgentLocalSqlAdapter.ts'],
  ['nextOpenDigestReadPort', 'scheduler/nextOpenDigestReadPort.ts'],
  ['contextAssemblyRuntimeFlow', 'context-assembly/contextAssemblyRuntimeFlow.ts'],
  ['contextAssemblyTargetSnapshotSqlAdapter', 'context-assembly/contextAssemblyTargetSnapshotSqlAdapter.ts'],
  ['contextAssemblyLocalStructureSqlAdapter', 'context-assembly/contextAssemblyLocalStructureSqlAdapter.ts'],
  ['contextAssemblyRelatedContextSqlAdapter', 'context-assembly/contextAssemblyRelatedContextSqlAdapter.ts'],
  ['contextAssemblyMemoryContextSqlAdapter', 'context-assembly/contextAssemblyMemoryContextSqlAdapter.ts'],
  ['memoryReviewPort', 'memory/memoryReviewPort.ts'],
  ['memoryCandidateProposalBoundary', 'memory/memoryCandidateProposalBoundary.ts'],
  ['operationGenerationProviderFlow', 'ai-operations/operationGenerationProviderFlow.ts'],
  ['operationRoutingAdapter', 'ai-operations/operationRoutingAdapter.ts'],
  ['operationRoutingFlow', 'ai-operations/operationRoutingFlow.ts'],
  ['operationAuditPort', 'ai-operations/operationAuditPort.ts'],
  ['operationAuditSqlAdapter', 'ai-operations/operationAuditSqlAdapter.ts'],
  ['operationAuditPersistenceFlow', 'ai-operations/operationAuditPersistenceFlow.ts'],
  ['operationAuditRecoveryQueue', 'ai-operations/operationAuditRecoveryQueue.ts'],
  ['operationAuditRecoveryAgentLocalSqlAdapter', 'ai-operations/operationAuditRecoveryAgentLocalSqlAdapter.ts'],
  ['tursoOperationAuditExecutor', 'ai-operations/tursoOperationAuditExecutor.ts'],
  ['operationProjectionPort', 'ai-operations/operationProjectionPort.ts'],
  ['operationProjectionPersistenceFlow', 'ai-operations/operationProjectionPersistenceFlow.ts'],
  ['operationProposalPort', 'ai-operations/operationProposalPort.ts'],
  ['operationProposalSqlAdapter', 'ai-operations/operationProposalSqlAdapter.ts'],
  ['operationApprovalRuntimeHandlers', 'ai-operations/operationApprovalRuntimeHandlers.ts'],
  ['structureJobProcessorFlow', 'ai-operations/structure-job/structureJobProcessorFlow.ts'],
  ['structureJobOperationFlow', 'ai-operations/structure-job/structureJobOperationFlow.ts'],
  ['structureJobOperationOrchestrationFlow', 'ai-operations/structure-job/structureJobOperationOrchestrationFlow.ts'],
  ['structureJobAgentHandler', 'ai-operations/structure-job/structureJobAgentHandler.ts'],
]);

function remapWorkerPath(hit) {
  const match = hit.match(/apps\/worker\/src\/(.+)$/);
  if (!match) {
    return hit;
  }
  const base = path.posix.basename(match[1]).replace(/\.(ts|d\.ts)$/, '');
  const mapped = MODULE_MAP.get(base);
  return mapped ? `apps/worker/src/${mapped}` : hit;
}

function rewrite(content) {
  return content.replace(/apps\/worker\/src\/[A-Za-z0-9_./-]+\.ts/g, (hit) => remapWorkerPath(hit));
}

async function walk(dirPath, files = []) {
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
    } else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.md') || entry.name.endsWith('.toml')) {
      files.push(entryPath);
    }
  }
  return files;
}

let changed = 0;
const scanRoots = [path.join(root, 'tests'), path.join(root, 'docs'), path.join(root, 'scripts')];
for (const scanRoot of scanRoots) {
  const files = await walk(scanRoot);
  for (const filePath of files) {
    const original = await readFile(filePath, 'utf8');
    if (!original.includes('apps/worker/src/')) {
      continue;
    }
    const rewritten = rewrite(original);
    if (rewritten !== original) {
      await writeFile(filePath, rewritten);
      changed += 1;
    }
  }
}

console.log(`updated ${changed} files referencing worker src`);
