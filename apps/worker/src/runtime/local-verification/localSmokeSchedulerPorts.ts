// Local smoke scheduler snapshot state and smoke-only port construction.
// Authority: docs/contracts/backend-runtime.md

import {
  AgentLocalNextOpenDigestPreparationAdapter,
  AgentLocalStructureJobQueueAdapter,
  type SchedulerAgentLocalSqlExecutor,
} from '../../scheduler/schedulerAgentLocalSqlAdapter.ts';
import type { SectionContract } from '../../../../../contexts/note-model/src/contract/noteContract.ts';
import type { StructureTriggerSchedulerFlowInput } from '../../scheduler/structureSchedulerRuntimeFlow.ts';

export interface LocalSmokeSchedulerSnapshotCommand {
  purpose: 'local_verification';
  noteId: string;
  sections: readonly unknown[];
}

export class LocalSmokeSchedulerSnapshotStore {
  private readonly sectionsByNoteId = new Map<string, readonly unknown[]>();

  applySnapshot(input: LocalSmokeSchedulerSnapshotCommand): { ok: boolean; errors: string[] } {
    if (
      input.purpose !== 'local_verification' ||
      typeof input.noteId !== 'string' ||
      !Array.isArray(input.sections)
    ) {
      return { ok: false, errors: ['local smoke scheduler snapshot command is invalid'] };
    }

    this.sectionsByNoteId.set(input.noteId, structuredClone(input.sections));
    return { ok: true, errors: [] };
  }

  hasSnapshot(noteId: string): boolean {
    return this.sectionsByNoteId.has(noteId);
  }

  createNoteStructurePorts(
    noteId: string,
    executor: Pick<SchedulerAgentLocalSqlExecutor, 'execute' | 'query'>,
  ): StructureTriggerSchedulerFlowInput['ports'] {
    const schedulerExecutor = executor as SchedulerAgentLocalSqlExecutor;
    return {
      noteSnapshot: {
        loadSections: async () => structuredClone(this.sectionsByNoteId.get(noteId) ?? []) as SectionContract[],
      },
      structureJobQueue: new AgentLocalStructureJobQueueAdapter(schedulerExecutor),
      nextOpenDigestPreparation: new AgentLocalNextOpenDigestPreparationAdapter(schedulerExecutor),
    };
  }
}
