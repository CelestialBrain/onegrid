// =============================================================================
// @onegrid/worker-plugins/worker (worker side)
//
// The companion module plugin authors import inside their Worker file.
// Wire it up with `definePluginWorker({ handlers, self? })` — the worker
// listens for invocations, dispatches to the matching handler, catches
// throws, and posts { ok: true, value } or { ok: false, error } back.
//
// Example (`my-plugin-worker.ts`):
//
//   import { definePluginWorker } from '@onegrid/worker-plugins/worker';
//
//   definePluginWorker({
//     handlers: {
//       async sumColumn(vec: Float64Array): Promise<number> {
//         let acc = 0;
//         for (let i = 0; i < vec.length; i++) acc += vec[i];
//         return acc;
//       },
//     },
//   });
//
// The author code stays portable across Web Workers, dedicated workers,
// and (with a small shim) Node worker_threads.
// =============================================================================

import type { WorkerInbound, WorkerOutbound } from './protocol.js';

export interface WorkerHandlers {
  readonly [name: string]: (...args: never[]) => unknown | Promise<unknown>;
}

export interface DefinePluginWorkerOptions {
  readonly handlers: WorkerHandlers;
  /**
   * Override the worker-global scope. Defaults to `self` in Web Workers /
   * `globalThis` in Node. Pass an explicit MessagePort in test harnesses.
   */
  readonly self?: WorkerSelfLike;
}

export interface WorkerSelfLike {
  postMessage(message: unknown, transfer?: ReadonlyArray<Transferable>): void;
  addEventListener(
    type: 'message',
    listener: (e: MessageEvent<WorkerInbound>) => void,
  ): void;
  removeEventListener(type: string, listener: unknown): void;
}

/** Initialize the worker. Returns a cleanup function for test harnesses. */
export function definePluginWorker(opts: DefinePluginWorkerOptions): () => void {
  const scope = opts.self ?? (globalThis as unknown as WorkerSelfLike);
  const handlers = opts.handlers;

  const onMessage = async (e: MessageEvent<WorkerInbound>): Promise<void> => {
    const data = e.data;
    if (!data || data.kind !== 'invoke') return;
    const handler = handlers[data.fn] as
      | ((...args: never[]) => unknown | Promise<unknown>)
      | undefined;
    if (!handler) {
      const out: WorkerOutbound = {
        kind: 'result',
        id: data.id,
        ok: false,
        error: {
          name: 'WorkerPluginError',
          message: `unknown handler '${data.fn}'`,
        },
      };
      scope.postMessage(out);
      return;
    }
    try {
      const value = await handler(...(data.args as never[]));
      const out: WorkerOutbound = {
        kind: 'result',
        id: data.id,
        ok: true,
        value,
      };
      scope.postMessage(out);
    } catch (err) {
      const e2 = err as Error;
      const out: WorkerOutbound = {
        kind: 'result',
        id: data.id,
        ok: false,
        error: {
          name: e2.name ?? 'Error',
          message: e2.message ?? String(err),
          ...(e2.stack ? { stack: e2.stack } : {}),
        },
      };
      scope.postMessage(out);
    }
  };

  scope.addEventListener('message', onMessage);

  // Announce ready + handler list.
  const ready: WorkerOutbound = {
    kind: 'ready',
    handlers: Object.keys(handlers),
  };
  scope.postMessage(ready);

  return () => scope.removeEventListener('message', onMessage);
}
