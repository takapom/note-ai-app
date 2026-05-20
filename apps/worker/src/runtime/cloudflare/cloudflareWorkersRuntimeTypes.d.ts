declare module 'cloudflare:workers' {
  export interface DurableObjectState {
    readonly storage?: unknown;
  }

  export class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;

    constructor(ctx: DurableObjectState, env: Env);
  }
}
