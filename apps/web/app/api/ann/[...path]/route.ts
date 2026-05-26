import { handleNextWorkerProxyRequest } from '../../../../src/runtime/next/nextWorkerProxy.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return handleNextWorkerProxyRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleNextWorkerProxyRequest(request);
}

export function PATCH(request: Request): Promise<Response> {
  return handleNextWorkerProxyRequest(request);
}

export function DELETE(request: Request): Promise<Response> {
  return handleNextWorkerProxyRequest(request);
}
