import { describe, it, expect } from 'vitest';
import { DataWorker } from '../index.js';
import { definePluginWorker, type WorkerSelfLike } from '@onegrid/worker-plugins/worker';
import { sortIndex, filterIndex, groupRows, pivot, createColumnTable } from '@onegrid/data';
import type { WorkerLike } from '@onegrid/worker-plugins';

// In-process worker harness — the two sides talk through each other's
// listener tables so we can drive the protocol synchronously in tests
// without spawning a real Worker.
function pairChannels(): { hostSide: WorkerLike; workerSide: WorkerSelfLike } {
  const hostListeners = new Map<string, Set<(e: unknown) => void>>();
  const workerListeners = new Map<string, Set<(e: unknown) => void>>();
  const emit = (
    m: Map<string, Set<(e: unknown) => void>>,
    type: string,
    e: unknown,
  ): void => {
    m.get(type)?.forEach((fn) => fn(e));
  };
  const hostSide = {
    postMessage: (msg: unknown) => emit(workerListeners, 'message', { data: msg }),
    addEventListener: (type: string, listener: (e: unknown) => void) => {
      let set = hostListeners.get(type);
      if (!set) hostListeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener: (type: string, listener: unknown) =>
      hostListeners.get(type)?.delete(listener as (e: unknown) => void),
    terminate: () => {
      hostListeners.clear();
      workerListeners.clear();
    },
  } as unknown as WorkerLike;
  const workerSide = {
    postMessage: (msg: unknown) => emit(hostListeners, 'message', { data: msg }),
    addEventListener: (type: string, listener: (e: unknown) => void) => {
      let set = workerListeners.get(type);
      if (!set) workerListeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener: (type: string, listener: unknown) =>
      workerListeners.get(type)?.delete(listener as (e: unknown) => void),
  } as unknown as WorkerSelfLike;
  return { hostSide, workerSide };
}

function makeTable() {
  return createColumnTable([
    { schema: { id: 'id', type: 'int32' }, data: new Int32Array([1, 2, 3, 4, 5]) },
    { schema: { id: 'name', type: 'utf8' }, data: ['e', 'a', 'd', 'b', 'c'] },
    {
      schema: { id: 'score', type: 'float64' },
      data: new Float64Array([10, 20, 30, 40, 50]),
    },
  ]);
}

describe('DataWorker', () => {
  it('exposes the four standard handlers', async () => {
    const { hostSide, workerSide } = pairChannels();
    const worker = new DataWorker({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        sort: (input: { table: ReturnType<typeof makeTable>; sort: unknown }) =>
          sortIndex(input.table, input.sort as Parameters<typeof sortIndex>[1]),
        filter: (input: { table: ReturnType<typeof makeTable>; filter: unknown }) =>
          filterIndex(input.table, input.filter as Parameters<typeof filterIndex>[1]),
        group: (input: { table: ReturnType<typeof makeTable>; grouping: unknown }) =>
          groupRows(input.table, input.grouping as Parameters<typeof groupRows>[1]),
        pivot: (input: { table: ReturnType<typeof makeTable>; model: unknown }) =>
          pivot(input.table, input.model as Parameters<typeof pivot>[1]),
      },
    });
    const handlers = await worker.ready;
    expect(handlers).toEqual(expect.arrayContaining(['sort', 'filter', 'group', 'pivot']));
    worker.dispose();
  });

  it('sort returns an index permutation matching the synchronous path', async () => {
    const { hostSide, workerSide } = pairChannels();
    const table = makeTable();
    const worker = new DataWorker({ worker: hostSide });
    definePluginWorker({
      self: workerSide,
      handlers: {
        sort: (input: { table: typeof table; sort: Parameters<typeof sortIndex>[1] }) =>
          sortIndex(input.table, input.sort),
      },
    });
    await worker.ready;
    const sortModel: Parameters<typeof sortIndex>[1] = [
      { columnId: 'name', direction: 'asc' },
    ];
    const expected = sortIndex(table, sortModel);
    const actual = (await worker.sort(table, sortModel)) as unknown as Int32Array;
    expect(Array.from(actual)).toEqual(Array.from(expected));
    worker.dispose();
  });
});
