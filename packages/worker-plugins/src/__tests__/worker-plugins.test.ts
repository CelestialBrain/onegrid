import { describe, it, expect, vi } from 'vitest';
import {
  WorkerPluginHost,
  collectTransferables,
  type WorkerLike,
} from '../index.js';
import { definePluginWorker, type WorkerSelfLike } from '../worker.js';
import type { WorkerInbound, WorkerOutbound } from '../protocol.js';

// -----------------------------------------------------------------------------
// In-process MessageChannel-like harness — the two sides talk through
// each other's `dispatch` so the test runs without a real Worker.
// -----------------------------------------------------------------------------

function pairChannels(): { hostSide: WorkerLike; workerSide: WorkerSelfLike } {
  const hostListeners = new Map<string, Set<(e: unknown) => void>>();
  const workerListeners = new Map<string, Set<(e: unknown) => void>>();

  const emitTo = (
    listeners: Map<string, Set<(e: unknown) => void>>,
    type: string,
    e: unknown,
  ): void => {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of set) fn(e);
  };

  const hostSide = {
    postMessage: (msg: unknown) => {
      emitTo(workerListeners, 'message', { data: msg } as MessageEvent<WorkerInbound>);
    },
    addEventListener: (type: string, listener: (e: unknown) => void) => {
      let set = hostListeners.get(type);
      if (!set) {
        set = new Set();
        hostListeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (type: string, listener: unknown) => {
      hostListeners.get(type)?.delete(listener as (e: unknown) => void);
    },
    terminate: () => {
      hostListeners.clear();
      workerListeners.clear();
    },
  } as unknown as WorkerLike;

  const workerSide = {
    postMessage: (msg: unknown) => {
      emitTo(hostListeners, 'message', { data: msg } as MessageEvent<WorkerOutbound>);
    },
    addEventListener: (type: string, listener: (e: unknown) => void) => {
      let set = workerListeners.get(type);
      if (!set) {
        set = new Set();
        workerListeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener: (type: string, listener: unknown) => {
      workerListeners.get(type)?.delete(listener as (e: unknown) => void);
    },
  } as unknown as WorkerSelfLike;

  return { hostSide, workerSide };
}

describe('WorkerPluginHost ↔ definePluginWorker', () => {
  it('handshake exposes registered handler names via .ready', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        sum: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
        mul: (a: number, b: number) => a * b,
      },
    });
    const handlers = await host.ready;
    expect(handlers).toContain('sum');
    expect(handlers).toContain('mul');
    host.dispose();
  });

  it('invokes a sync handler and resolves with the value', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        double: (n: number) => n * 2,
      },
    });
    await host.ready;
    expect(await host.invoke<number>('double', [21])).toBe(42);
    host.dispose();
  });

  it('invokes an async handler', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        slow: async (n: number) => {
          await Promise.resolve();
          return n + 1;
        },
      },
    });
    await host.ready;
    expect(await host.invoke<number>('slow', [10])).toBe(11);
    host.dispose();
  });

  it('surfaces a worker-side throw as a rejection with name/message preserved', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        bang: () => {
          throw new RangeError('boom');
        },
      },
    });
    await host.ready;
    await expect(host.invoke('bang')).rejects.toMatchObject({
      name: 'RangeError',
      message: 'boom',
    });
    host.dispose();
  });

  it('rejects unknown handler names', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide });
    definePluginWorker({ self: workerSide, handlers: {} });
    await host.ready;
    await expect(host.invoke('missing')).rejects.toThrow(/unknown handler/);
    host.dispose();
  });

  it('times out a hung handler', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide, timeoutMs: 10 });
    definePluginWorker({
      self: workerSide,
      handlers: {
        hang: () => new Promise(() => undefined), // never resolves
      },
    });
    await host.ready;
    await expect(host.invoke('hang')).rejects.toThrow(/OG_WORKER_TIMEOUT/);
    host.dispose();
  });

  it('dispose rejects any pending invocations', async () => {
    const { hostSide, workerSide } = pairChannels();
    const host = new WorkerPluginHost({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        hang: () => new Promise(() => undefined),
      },
    });
    await host.ready;
    const pending = host.invoke('hang');
    host.dispose();
    await expect(pending).rejects.toThrow(/OG_WORKER_DISPOSED/);
  });
});

describe('collectTransferables', () => {
  it('picks up ArrayBuffer-backed typed arrays', () => {
    const v = new Float64Array(4);
    const transferables = collectTransferables([v, 'x', 42]);
    expect(transferables).toContain(v.buffer);
  });

  it('returns empty for plain-object args', () => {
    expect(collectTransferables([{ a: 1 }, 'x'])).toEqual([]);
  });

  it('handles a bare ArrayBuffer arg', () => {
    const buf = new ArrayBuffer(16);
    expect(collectTransferables([buf])).toEqual([buf]);
  });
});
