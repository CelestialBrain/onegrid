// =============================================================================
// Worker-plugin wire protocol — structured-clone-safe message shapes
// shared by both sides of the postMessage boundary.
// =============================================================================

export interface WorkerInvocation {
  readonly kind: 'invoke';
  readonly id: number;
  readonly fn: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface WorkerHandshakeReady {
  readonly kind: 'ready';
  /** Registered handler names. Lets the host know what's available. */
  readonly handlers: ReadonlyArray<string>;
}

export type WorkerInbound = WorkerInvocation;

export type WorkerResult<T = unknown> =
  | { readonly kind: 'result'; readonly id: number; readonly ok: true; readonly value: T }
  | {
      readonly kind: 'result';
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly name: string; readonly message: string; readonly stack?: string };
    };

export type WorkerOutbound = WorkerResult | WorkerHandshakeReady;
