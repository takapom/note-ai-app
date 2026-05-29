// Thin command delegation helpers for Worker HTTP route handlers.
// Authority: docs/contracts/backend-runtime.md

import { mapPortResult, notConfigured } from './workerHttpRouteResponses.ts';
import type {
  WorkerHttpRequest,
  WorkerHttpResponse,
  WorkerRouteCommandInput,
  WorkerRouteCommandResult,
} from './workerHttpRouterTypes.ts';

export async function delegateCommand(
  command: ((input: WorkerRouteCommandInput) => Promise<WorkerRouteCommandResult>) | undefined,
  request: WorkerHttpRequest,
  params: Omit<WorkerRouteCommandInput, 'workspaceId' | 'userId' | 'now' | 'body'>,
  successStatus: number,
  missingMessage: string,
): Promise<WorkerHttpResponse> {
  if (command === undefined) {
    return notConfigured(missingMessage);
  }

  const result = await command({
    workspaceId: request.workspaceId,
    ...(request.userId === undefined ? {} : { userId: request.userId }),
    now: request.now,
    ...(request.body === undefined ? {} : { body: request.body }),
    ...params,
  });

  return mapPortResult(result, successStatus);
}

export function bindCommand<
  Port extends object,
  MethodName extends keyof Port,
>(
  port: Port | undefined,
  methodName: MethodName,
): ((input: WorkerRouteCommandInput) => Promise<WorkerRouteCommandResult>) | undefined {
  if (port === undefined) {
    return undefined;
  }

  const method = port[methodName];
  return typeof method === 'function'
    ? (method as (this: Port, input: WorkerRouteCommandInput) => Promise<WorkerRouteCommandResult>).bind(port)
    : undefined;
}
