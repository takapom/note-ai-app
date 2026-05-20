// Cloudflare deployment entrypoint.
// Authority: docs/contracts/backend-runtime.md, docs/contracts/cloudflare-agents-turso.md

import { createWorkerFetchHandler } from '../http/workerEntrypoint.ts';

export {
  NoteAgent,
  WorkspaceBrainAgent,
} from './cloudflareDurableObjectAgents.ts';

export default {
  fetch: createWorkerFetchHandler(),
};
