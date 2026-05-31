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

export interface LocalSmokeSchedulerSnapshotStorageLike {
  get?(key: string): unknown;
  put?(key: string, value: unknown): unknown;
}

export type LocalSmokeSchedulerSnapshotReadResult =
  | { ok: true; snapshot?: LocalSmokeSchedulerSnapshotCommand }
  | { ok: false; errors: string[] };

export const LOCAL_SMOKE_SCHEDULER_SNAPSHOT_STORAGE_PREFIX = 'local_smoke.scheduler_snapshot.';

export class LocalSmokeSchedulerSnapshotStore {
  private readonly sectionsByNoteId = new Map<string, readonly unknown[]>();

  applySnapshot(input: LocalSmokeSchedulerSnapshotCommand): { ok: boolean; errors: string[] } {
    const errors = validateLocalSmokeSchedulerSnapshotCommand(input);
    if (errors.length > 0) {
      return { ok: false, errors };
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

export async function persistLocalSmokeSchedulerSnapshot(input: {
  storage: unknown;
  snapshot: LocalSmokeSchedulerSnapshotCommand;
}): Promise<{ ok: boolean; errors: string[] }> {
  const errors = validateLocalSmokeSchedulerSnapshotCommand(input.snapshot);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const storage = readLocalSmokeSchedulerSnapshotStorage(input.storage);
  if (storage === undefined || typeof storage.put !== 'function') {
    return { ok: false, errors: ['local smoke scheduler snapshot storage is not configured'] };
  }

  try {
    await storage.put(
      localSmokeSchedulerSnapshotStorageKey(input.snapshot.noteId),
      structuredClone(input.snapshot),
    );
  } catch {
    return { ok: false, errors: ['local smoke scheduler snapshot storage write failed'] };
  }

  return { ok: true, errors: [] };
}

export async function readLocalSmokeSchedulerSnapshot(input: {
  storage: unknown;
  noteId: string;
}): Promise<LocalSmokeSchedulerSnapshotReadResult> {
  const storage = readLocalSmokeSchedulerSnapshotStorage(input.storage);
  if (storage === undefined || typeof storage.get !== 'function') {
    return { ok: false, errors: ['local smoke scheduler snapshot storage is not configured'] };
  }

  let snapshot: unknown;
  try {
    snapshot = await storage.get(localSmokeSchedulerSnapshotStorageKey(input.noteId));
  } catch {
    return { ok: false, errors: ['local smoke scheduler snapshot storage read failed'] };
  }
  if (snapshot === undefined) {
    return { ok: true };
  }

  const errors = validateLocalSmokeSchedulerSnapshotCommand(snapshot);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    snapshot: structuredClone(snapshot) as LocalSmokeSchedulerSnapshotCommand,
  };
}

export function localSmokeSchedulerSnapshotStorageKey(noteId: string): string {
  return `${LOCAL_SMOKE_SCHEDULER_SNAPSHOT_STORAGE_PREFIX}${noteId}`;
}

function validateLocalSmokeSchedulerSnapshotCommand(command: unknown): string[] {
  if (!isRecord(command)) {
    return ['local smoke scheduler snapshot command is invalid'];
  }
  if (
    command.purpose !== 'local_verification' ||
    typeof command.noteId !== 'string' ||
    command.noteId.trim().length === 0 ||
    !Array.isArray(command.sections)
  ) {
    return ['local smoke scheduler snapshot command is invalid'];
  }

  return [];
}

function readLocalSmokeSchedulerSnapshotStorage(
  storage: unknown,
): LocalSmokeSchedulerSnapshotStorageLike | undefined {
  return isRecord(storage) ? storage as LocalSmokeSchedulerSnapshotStorageLike : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
