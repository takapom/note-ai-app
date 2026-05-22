// Facade for accepted memory candidate operation proposals.
// Authority: docs/contracts/memory.md
// MemoryCandidatePersistencePort persists accepted candidates with: insert into memory_items.

export type {
  MemoryCandidatePersistencePort,
  MemoryCandidatePersistenceResult,
  MemoryCandidateProposalBoundaryInput,
  MemoryCandidateProposalBoundaryResult,
  MemoryCandidateSqlExecutor,
  MemoryCandidateSqlStatement,
  MemoryCandidateWriteIntent,
} from './memoryCandidateProposalTypes.ts';
export { runMemoryCandidateProposalBoundary, prepareMemoryCandidateWriteIntent } from './memoryCandidateProposalBoundaryCore.ts';
export {
  InMemoryMemoryCandidatePersistencePort,
  TursoMemoryCandidatePersistenceAdapter,
  mapMemoryCandidateWriteIntentToSql,
  validateMemoryCandidateWriteIntent,
} from './memoryCandidatePersistencePorts.ts';
