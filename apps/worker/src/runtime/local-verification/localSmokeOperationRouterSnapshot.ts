// Local verification Operation Router snapshot fixture for Worker smoke runs.
// Authority: docs/contracts/backend-runtime.md

import type { OperationRouterSnapshot } from '../../../../../contexts/ai-operations/src/contract/operationRouterContract.ts';
import type { WorkerRuntimePortEnv } from '../composition/workerRuntimePortEnv.ts';

export function createLocalSmokeOperationRouterSnapshotFromEnv(
  env: WorkerRuntimePortEnv,
): OperationRouterSnapshot | undefined {
  if (env.LOCAL_AGENT_SMOKE_ENABLED !== '1') {
    return undefined;
  }

  const noteId = readOptionalString(env.WORKER_SMOKE_NOTE_ID);
  const paragraphBlockId = readOptionalString(env.WORKER_SMOKE_BLOCK_ID);
  if (noteId === undefined || paragraphBlockId === undefined) {
    return undefined;
  }

  return {
    notes: [{ id: noteId }],
    sections: [{ id: 'section_001' }],
    blocks: [
      { id: 'block_heading_001', origin: 'user', sectionId: 'section_001' },
      { id: paragraphBlockId, origin: 'user', sectionId: 'section_001' },
      { id: 'block_ai_question_001', origin: 'ai', sectionId: 'section_001' },
    ],
    captureEntries: [{ id: 'capture_001' }],
    semanticUnits: [],
    memoryCandidates: [],
    assistBlocks: [{ id: 'block_ai_question_001' }],
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
