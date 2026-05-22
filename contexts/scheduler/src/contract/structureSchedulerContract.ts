// Live product semantics for structure scheduling.
// Authority: docs/contracts/ai-structuring-lifecycle.md
// Facade evidence markers:
// Triggers: 'note_closed', 'tab_switched', 'app_left', 'next_open', 'manual_organize'.
// Helpers: handleBlockChanged, discoverDirtySections, planStructureJobs,
// shouldEnqueueStructureJob, isWholeNoteScopeAllowed, noteCloseFlowSteps.

export * from './structureSchedulerTypes.ts';
export * from './structureSchedulerPlanning.ts';
