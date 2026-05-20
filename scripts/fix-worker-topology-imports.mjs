#!/usr/bin/env node
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const srcRoot = new URL('apps/worker/src/', root);

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

function contextsPrefix(relativePath) {
  const segments = relativePath.split('/');
  return '../'.repeat(segments.length + 2) + 'contexts/';
}

function relativeImport(fromRelativePath, toRelativePath) {
  const fromDir = path.posix.dirname(fromRelativePath);
  let rel = path.posix.relative(fromDir, toRelativePath);
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return rel;
}

function resolveModule(specifier) {
  const base = path.posix.basename(specifier).replace(/\.(ts|d\.ts)$/, '');
  return MODULE_MAP.get(base);
}

async function walk(dirPath, files = []) {
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(path.relative(srcRootPath, entryPath).replace(/\\/g, '/'));
    }
  }
  return files;
}

function rewriteImports(fileRelativePath, content) {
  const contextsReplacement = contextsPrefix(fileRelativePath);
  let next = content.replace(/from '(?:\.\.\/)+contexts\//g, `from '${contextsReplacement}`);
  next = next.replace(/from "(?:\.\.\/)+contexts\//g, `from "${contextsReplacement}`);

  next = next.replace(
    /from ['"]((?:\.\.\/)+|\.\/)?([^'"]+?)['"]/g,
    (match, prefix, specifier) => {
      if (!specifier.endsWith('.ts') && !specifier.endsWith('.d.ts')) {
        return match;
      }
      const mapped = resolveModule(specifier);
      if (!mapped) {
        return match;
      }
      const quote = match.includes('"') ? '"' : "'";
      const rel = relativeImport(fileRelativePath, mapped);
      return `from ${quote}${rel}${quote}`;
    },
  );

  return next;
}

const srcRootPath = fileURLToPath(srcRoot);
const files = await walk(srcRootPath);
for (const file of files) {
  const fileUrl = new URL(`apps/worker/src/${file}`, root);
  const original = await readFile(fileUrl, 'utf8');
  const rewritten = rewriteImports(file, original);
  if (rewritten !== original) {
    await writeFile(fileUrl, rewritten);
  }
}

try {
  await unlink(new URL('apps/worker/src/scheduler/noteStructureRouteHandler.ts', root));
} catch {
  // already removed
}

console.log(`updated imports in ${files.length} worker source files`);
