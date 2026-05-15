// =============================================================================
// @onegrid/worker-plugins (host side)
//
// Second trust tier for user-supplied formula functions and aggregators.
// The plugin module loads in a dedicated Worker (Web or Node); the host
// invokes named handlers over postMessage. Arrow vectors travel zero-copy
// via Transferable when the host detects ArrayBuffer-backed inputs.
//
// Iframe sandboxing is intentionally NOT offered — too much overhead for
// hot-path formula evaluation; the Worker tier is the trust boundary.
// Errors thrown inside the worker are caught and surfaced as
// { ok: false, error } without crashing the main thread.
// =============================================================================

import type {
  WorkerInbound,
  WorkerInvocation,
  WorkerOutbound,
  WorkerResult,
} from './protocol.js';

// -----------------------------------------------------------------------------
// Minimal Worker-shape interface so the host doesn't pin Web vs Node.
// -----------------------------------------------------------------------------

export interface WorkerLike {
  postMessage(message: unknown, transfer?: ReadonlyArray<Transferable>): void;
  addEventListener(
    type: 'message',
    listener: (e: MessageEvent<WorkerOutbound>) => void,
  ): void;
  addEventListener(type: 'error', listener: (e: unknown) => void): void;
  removeEventListener(type: string, listener: unknown): void;
  terminate(): void;
}

// -----------------------------------------------------------------------------
// WorkerPluginHost
// -----------------------------------------------------------------------------

export interface WorkerPluginHostOptions {
  /** Either a pre-constructed Worker OR a URL/blob the host will spawn from. */
  readonly worker: WorkerLike;
  /** Per-call timeout in ms. Default 30 000. */
  readonly timeoutMs?: number;
  /** Called when the worker reports an unrecoverable error (onerror). */
  readonly onWorkerError?: (err: unknown) => void;
}

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class WorkerPluginHost {
  private readonly worker: WorkerLike;
  private readonly timeoutMs: number;
  private readonly pending = new Map<number, PendingCall>();
  private nextId = 1;
  private readyResolve: ((handlers: ReadonlyArray<string>) => void) | null = null;
  readonly ready: Promise<ReadonlyArray<string>>;
  private readonly onMessage = (e: MessageEvent<WorkerOutbound>): void =>
    this.handleMessage(e.data);
  private readonly onError = (err: unknown): void =>
    this.opts.onWorkerError?.(err);

  constructor(private readonly opts: WorkerPluginHostOptions) {
    this.worker = opts.worker;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.ready = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
  }

  /**
   * Invoke a named handler in the worker. Resolves with the return
   * value; rejects with the worker-side error (or a timeout error).
   *
   * Pass any `Transferable` items in `transfer` to hand off ownership
   * zero-copy (Arrow vectors → ArrayBuffer).
   */
  invoke<T = unknown>(
    fn: string,
    args: ReadonlyArray<unknown> = [],
    transfer: ReadonlyArray<Transferable> = [],
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[OG_WORKER_TIMEOUT] '${fn}' exceeded ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      const msg: WorkerInvocation = { kind: 'invoke', id, fn, args };
      this.worker.postMessage(msg, transfer);
    });
  }

  /** Tear down: rejects pending calls and terminates the worker. */
  dispose(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('[OG_WORKER_DISPOSED]'));
    }
    this.pending.clear();
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
  }

  private handleMessage(data: WorkerOutbound): void {
    if (data.kind === 'ready') {
      this.readyResolve?.(data.handlers);
      this.readyResolve = null;
      return;
    }
    const pending = this.pending.get(data.id);
    if (!pending) return; // late delivery after timeout
    clearTimeout(pending.timer);
    this.pending.delete(data.id);
    if (data.ok) {
      pending.resolve(data.value);
    } else {
      const err = new Error(data.error.message);
      err.name = data.error.name;
      if (data.error.stack) err.stack = data.error.stack;
      pending.reject(err);
    }
  }
}

// -----------------------------------------------------------------------------
// Convenience — extract Transferables from candidate arg arrays.
// -----------------------------------------------------------------------------

/**
 * Walk an args array looking for objects with a `.buffer` ArrayBuffer
 * (typed arrays, Arrow vectors). Returns the buffers in the order they
 * appear, suitable for the third `transfer` argument of `postMessage`.
 *
 * Use this when you don't need fine-grained control — for hot paths,
 * pass `transfer` explicitly.
 */
export function collectTransferables(
  args: ReadonlyArray<unknown>,
): Transferable[] {
  const out: Transferable[] = [];
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue;
    const buf = (arg as { buffer?: unknown }).buffer;
    if (buf instanceof ArrayBuffer) out.push(buf);
    else if (arg instanceof ArrayBuffer) out.push(arg);
  }
  return out;
}

export type { WorkerInbound, WorkerOutbound, WorkerResult, WorkerInvocation };
