// Worker HTTP provenance lookup route handler.
// Authority: docs/contracts/api-events.md

import type { ProvenanceLookupPort } from '../../note-model/provenanceLookupPort.ts';
import { parseProvenanceLookupRouteInput } from './workerHttpRouteParsers.ts';
import { badRequest, mapPortResult, notConfigured } from './workerHttpRouteResponses.ts';
import type { WorkerHttpRequest, WorkerHttpResponse } from './workerHttpRouterTypes.ts';

export async function runProvenanceLookupRoute(
  request: WorkerHttpRequest,
  port: ProvenanceLookupPort | undefined,
): Promise<WorkerHttpResponse> {
  if (port === undefined) {
    return notConfigured('provenance lookup port is not configured');
  }

  const parsedInput = parseProvenanceLookupRouteInput(request);
  if (!parsedInput.ok) {
    return badRequest(parsedInput.errors);
  }

  const result = await port.lookupSource(parsedInput.input);

  return mapPortResult(result, 200);
}
