// Default Cloudflare Agent runtime delegate wiring.
// Authority: docs/contracts/backend-runtime.md
// Companion: docs/contracts/cloudflare-agents-turso.md

import { runStructureJobAgentHandler } from '../../ai-operations/structure-job/structureJobAgentHandler.ts';
import { runStructureJobProcessorFlow } from '../../ai-operations/structure-job/structureJobProcessorFlow.ts';
import { runNoteStructureRouteHandler } from '../../scheduler/noteStructureRouteHandler.ts';

export type {
  NoteStructureRouteHandlerInput,
  NoteStructureRouteHandlerResult,
} from '../../scheduler/noteStructureRouteHandler.ts';
export type {
  StructureJobAgentHandlerInput,
  StructureJobAgentHandlerResult,
} from '../../ai-operations/structure-job/structureJobAgentHandler.ts';
export type {
  StructureJobProcessorFlowInput,
  StructureJobProcessorFlowResult,
} from '../../ai-operations/structure-job/structureJobProcessorFlow.ts';

export const defaultNoteAgentRuntimeDelegates = {
  runNoteStructureRouteHandler,
} as const;

export const defaultWorkspaceBrainAgentRuntimeDelegates = {
  runStructureJobAgentHandler,
  runStructureJobProcessorFlow,
} as const;
