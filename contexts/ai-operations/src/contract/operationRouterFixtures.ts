// Contract fixtures for the AI Operation Router.
// Authority: docs/contracts/operation-return-contract.md

import type { OperationRouterSnapshot } from './operationRouterContract.ts';

export const operationRouterSnapshotFixture: OperationRouterSnapshot = {
  notes: [{ id: 'note_001' }],
  blocks: [
    { id: 'block_001', origin: 'user', sectionId: 'section_001' },
    { id: 'block_002', origin: 'user', sectionId: 'section_001' },
    { id: 'assist_block_001', origin: 'ai', sectionId: 'section_001' },
  ],
  sections: [{ id: 'section_001' }],
  captureEntries: [{ id: 'capture_001' }],
  semanticUnits: [{ id: 'unit_existing_001' }, { id: 'unit_001' }],
  memoryCandidates: [{ id: 'memory_001' }],
  assistBlocks: [{ id: 'assist_block_001' }],
};

export const emptyOperationRouterSnapshotFixture: OperationRouterSnapshot = {
  notes: [],
  blocks: [],
  sections: [],
  captureEntries: [],
  semanticUnits: [],
  memoryCandidates: [],
  assistBlocks: [],
};
