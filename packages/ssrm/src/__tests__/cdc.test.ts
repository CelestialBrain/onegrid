// =============================================================================
// CdcAdapter + createRowDiffStream — unit tests.
//
// Exercises the universal CDC contract by wiring a *fake* CdcAdapter
// (in-memory queue + manual resync responses) through
// `createRowDiffStream` and asserting the gap-detection / resync /
// snapshot flow end-to-end.
// =============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ResyncRequest,
  ResyncResponse,
  RowDiff,
  Unsubscribe,
} from '@onegrid/protocol';
import { createRowDiffStream, type CdcAdapter } from '../cdc';

interface FakeAdapter {
  readonly adapter: CdcAdapter;
  /** Inject a single diff into the live stream, simulating a server
   *  push. */
  emit(diff: RowDiff): void;
  /** Configure what the next `resync()` call returns. */
  setResyncResponse(response: ResyncResponse): void;
  /** Override the resync implementation (e.g. to make it stall or reject). */
  setResyncImpl(impl: (req: ResyncRequest) => Promise<ResyncResponse>): void;
  /** Override the subscribe implementation. */
  setSubscribeImpl(
    impl: (onDiff: (diff: RowDiff) => void) => Unsubscribe,
  ): void;
  /** Track resync calls for assertions. */
  readonly resyncCalls: ResyncRequest[];
}

function makeFakeAdapter(): FakeAdapter {
  let listener: ((diff: RowDiff) => void) | null = null;
  let resyncResponse: ResyncResponse = {
    fromVersion: 0,
    toVersion: 0,
    diffs: [],
  };
  let resyncImpl: ((req: ResyncRequest) => Promise<ResyncResponse>) | null = null;
  let subscribeImpl:
    | ((onDiff: (diff: RowDiff) => void) => Unsubscribe)
    | null = null;
  const resyncCalls: ResyncRequest[] = [];

  const adapter: CdcAdapter = {
    subscribe(onDiff): Unsubscribe {
      if (subscribeImpl) return subscribeImpl(onDiff);
      listener = onDiff;
      return () => {
        listener = null;
      };
    },
    async resync(req) {
      resyncCalls.push(req);
      if (resyncImpl) return resyncImpl(req);
      return resyncResponse;
    },
  };

  return {
    adapter,
    emit(diff) {
      listener?.(diff);
    },
    setResyncResponse(response) {
      resyncResponse = response;
    },
    setResyncImpl(impl) {
      resyncImpl = impl;
    },
    setSubscribeImpl(impl) {
      subscribeImpl = impl;
    },
    resyncCalls,
  };
}

function diff(version: number, kind: RowDiff['kind'] = 'update'): RowDiff {
  return { version, kind, pkey: `r${String(version)}` };
}

describe('createRowDiffStream', () => {
  let stream: ReturnType<typeof createRowDiffStream> | null = null;
  afterEach(() => {
    stream?.close();
    stream = null;
  });

  it('forwards in-order diffs to onDiff', () => {
    const adapter = makeFakeAdapter();
    const onDiff = vi.fn();
    stream = createRowDiffStream(adapter.adapter, { onDiff });
    adapter.emit(diff(1));
    adapter.emit(diff(2));
    adapter.emit(diff(3));
    expect(onDiff).toHaveBeenCalledTimes(3);
    expect(stream.lastVersion()).toBe(3);
    expect(stream.isPaused()).toBe(false);
  });

  it('triggers an incremental resync on a version gap', async () => {
    const adapter = makeFakeAdapter();
    const onDiff = vi.fn();
    const onIncrementalResync = vi.fn();
    stream = createRowDiffStream(adapter.adapter, {
      initialVersion: 0,
      onDiff,
      onIncrementalResync,
    });

    // Server replays 5..10 when asked.
    adapter.setResyncResponse({
      fromVersion: 4,
      toVersion: 10,
      diffs: [diff(5), diff(6), diff(7), diff(8), diff(9)],
    });

    adapter.emit(diff(1));
    adapter.emit(diff(2));
    adapter.emit(diff(3));
    adapter.emit(diff(4));
    adapter.emit(diff(10)); // gap → resync triggered async

    // Wait for the resync promise chain.
    await new Promise((r) => setTimeout(r, 0));

    expect(adapter.resyncCalls).toEqual([{ fromVersion: 4 }]);
    expect(onIncrementalResync).toHaveBeenCalled();
    // 4 in-order + 5 from replay = 9. (10 was held back during pause.)
    expect(onDiff).toHaveBeenCalledTimes(9);
    expect(stream.lastVersion()).toBe(10);
    expect(stream.isPaused()).toBe(false);
  });

  it('handles snapshot:true resync by rebasing version + signaling consumer', async () => {
    const adapter = makeFakeAdapter();
    const onSnapshotResync = vi.fn();
    stream = createRowDiffStream(adapter.adapter, {
      initialVersion: 0,
      onSnapshotResync,
    });

    adapter.setResyncResponse({
      fromVersion: 1,
      toVersion: 9999,
      diffs: [],
      snapshot: true,
    });

    adapter.emit(diff(1));
    adapter.emit(diff(9999)); // huge gap → resync → snapshot

    await new Promise((r) => setTimeout(r, 0));

    expect(onSnapshotResync).toHaveBeenCalled();
    expect(stream.lastVersion()).toBe(9999);
    expect(stream.isPaused()).toBe(false);
    // After snapshot, fresh diffs from 10000 land normally.
    adapter.emit(diff(10000));
    expect(stream.lastVersion()).toBe(10000);
  });

  it('drops live diffs while paused awaiting a resync', async () => {
    const adapter = makeFakeAdapter();
    const onDiff = vi.fn();
    stream = createRowDiffStream(adapter.adapter, {
      initialVersion: 0,
      onDiff,
    });

    // Make resync stall so the stream stays paused.
    let resolveResync!: (response: ResyncResponse) => void;
    adapter.setResyncImpl(
      () =>
        new Promise<ResyncResponse>((res) => {
          resolveResync = res;
        }),
    );

    adapter.emit(diff(1));
    adapter.emit(diff(5)); // gap → paused
    adapter.emit(diff(6));
    adapter.emit(diff(7));
    expect(stream.isPaused()).toBe(true);
    // Only diff(1) made it through.
    expect(onDiff).toHaveBeenCalledTimes(1);

    // Resolve the resync now.
    resolveResync({
      fromVersion: 1,
      toVersion: 7,
      diffs: [diff(2), diff(3), diff(4), diff(5), diff(6), diff(7)],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(stream.isPaused()).toBe(false);
    expect(stream.lastVersion()).toBe(7);
  });

  it('forwards resync errors via onResyncError without unpausing', async () => {
    const adapter = makeFakeAdapter();
    const onResyncError = vi.fn();
    adapter.setResyncImpl(() => Promise.reject(new Error('network')));
    stream = createRowDiffStream(adapter.adapter, {
      initialVersion: 0,
      onResyncError,
    });

    adapter.emit(diff(1));
    adapter.emit(diff(99)); // gap → resync rejects

    await new Promise((r) => setTimeout(r, 0));
    expect(onResyncError).toHaveBeenCalledWith(new Error('network'));
    expect(stream.isPaused()).toBe(true);
  });

  it('resyncNow() forces a manual resync from current lastVersion', async () => {
    const adapter = makeFakeAdapter();
    stream = createRowDiffStream(adapter.adapter);
    adapter.emit(diff(1));
    adapter.emit(diff(2));
    adapter.emit(diff(3));
    expect(stream.lastVersion()).toBe(3);

    adapter.setResyncResponse({
      fromVersion: 3,
      toVersion: 5,
      diffs: [diff(4), diff(5)],
    });
    await stream.resyncNow();
    expect(adapter.resyncCalls).toEqual([{ fromVersion: 3 }]);
    expect(stream.lastVersion()).toBe(5);
  });

  it('close() unsubscribes the underlying adapter', () => {
    const adapter = makeFakeAdapter();
    let unsubCallCount = 0;
    adapter.setSubscribeImpl((cb): Unsubscribe => {
      void cb;
      return () => {
        unsubCallCount++;
      };
    });
    stream = createRowDiffStream(adapter.adapter);
    stream.close();
    expect(unsubCallCount).toBe(1);
  });
});
