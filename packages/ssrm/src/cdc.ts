// =============================================================================
// CdcAdapter — universal change-data-capture interface.
//
// Every database-or-source-specific CDC adapter (Postgres
// LISTEN/NOTIFY, Mongo change streams, Kafka, Debezium, …)
// implements this interface. Consumers of the unified stream don't
// care which source produced the events; they just consume `RowDiff`
// in version order with a documented resync recovery path.
//
// This is a runtime-side interface (not a protocol type) because
// CDC wiring is the adapter's responsibility — the protocol only
// describes the wire-shape of `RowDiff` / `ResyncRequest` /
// `ResyncResponse`. The adapter is the bridge between a specific
// data source's idioms and that wire shape.
//
// Pairs with `createRowDiffTracker` for client-side gap detection
// and `createRowDiffStream` (this file) which composes a CdcAdapter
// + tracker into a single subscribe-and-forget pipeline.
// =============================================================================

import type {
  ResyncRequest,
  ResyncResponse,
  RowDiff,
  Unsubscribe,
} from '@onegrid/protocol';
import { createRowDiffTracker, type RowDiffTracker } from './row-diff-tracker';

export interface CdcSubscribeOptions {
  /** Optional starting version. The adapter SHOULD only deliver
   *  diffs with `version > fromVersion`. When omitted, the adapter
   *  delivers from its current source position (typical for a fresh
   *  client that's about to fetch a snapshot first). */
  readonly fromVersion?: number;
  /** Optional AbortSignal to cancel the subscription. */
  readonly signal?: AbortSignal;
}

/**
 * Universal CDC adapter shape. Adapter authors implement these three
 * methods; the rest of the stack (RowDiffTracker, RowDiffStream,
 * SsrmDataSource integration) is generic.
 */
export interface CdcAdapter {
  /** Open the underlying source (start LISTEN, open the change-stream
   *  cursor, subscribe to the topic) and call `onDiff` for every row
   *  mutation. Returns an unsubscribe function. */
  readonly subscribe: (
    onDiff: (diff: RowDiff) => void,
    options?: CdcSubscribeOptions,
  ) => Unsubscribe;
  /** Replay diffs from `req.fromVersion` (exclusive) onwards, or
   *  signal `{ snapshot: true }` when the gap is too large to replay
   *  incrementally. Called by `RowDiffStream` whenever the tracker
   *  detects a gap. */
  readonly resync: (req: ResyncRequest) => Promise<ResyncResponse>;
  /** Tear down underlying resources. Optional — adapters that hold
   *  no persistent state can omit this. */
  readonly close?: () => void;
}

export interface RowDiffStreamOptions {
  /** Starting version to track from. Default -1 ("accept any starting
   *  version on the first diff received"). Pass a known version when
   *  resuming a session. */
  readonly initialVersion?: number;
  /** Called for every diff that lands in correct version order. */
  readonly onDiff?: (diff: RowDiff) => void;
  /** Called after a successful incremental replay finishes. The
   *  stream has already advanced its tracker. */
  readonly onIncrementalResync?: (response: ResyncResponse) => void;
  /** Called when the server signals `snapshot: true`. The consumer
   *  MUST drop their cache and re-fetch from scratch — the stream
   *  has already rebased its version to `response.toVersion`. */
  readonly onSnapshotResync?: (response: ResyncResponse) => void;
  /** Called if the adapter's `resync` rejects. The stream remains
   *  paused; the consumer's recovery policy decides whether to
   *  retry, abandon, or surface the error to the user. */
  readonly onResyncError?: (err: unknown) => void;
}

export interface RowDiffStream {
  /** Tear down the subscription + drop the tracker. */
  readonly close: () => void;
  /** Current last-seen version (≥ -1). */
  readonly lastVersion: () => number;
  /** Whether the stream is currently paused awaiting a resync. */
  readonly isPaused: () => boolean;
  /** Force a manual resync (e.g. after a network reconnect). The
   *  stream issues a `ResyncRequest` from its current `lastVersion()`
   *  and applies the response. */
  readonly resyncNow: () => Promise<void>;
}

/**
 * Compose a `CdcAdapter` with a `RowDiffTracker` into a single
 * subscribe-and-forget pipeline. Gaps detected by the tracker
 * trigger a `resync` on the adapter; `snapshot: true` responses
 * signal the consumer to wipe their cache.
 */
export function createRowDiffStream(
  adapter: CdcAdapter,
  options: RowDiffStreamOptions = {},
): RowDiffStream {
  let tracker: RowDiffTracker;
  let unsubscribe: Unsubscribe = () => undefined;
  let closed = false;

  const handleResyncResponse = (response: ResyncResponse): void => {
    if (response.snapshot === true) {
      tracker.snapshotTo(response.toVersion);
      options.onSnapshotResync?.(response);
      return;
    }
    // Replay path: fire onDiff directly for each replayed diff so
    // the tracker's paused gate doesn't drop them. The tracker is
    // re-armed via resume() with the post-replay high-water mark.
    for (const d of response.diffs) {
      options.onDiff?.(d);
    }
    tracker.resume(response.toVersion);
    options.onIncrementalResync?.(response);
  };

  const triggerResync = (fromVersion: number): void => {
    adapter
      .resync({ fromVersion })
      .then((response) => {
        if (closed) return;
        handleResyncResponse(response);
      })
      .catch((err: unknown) => {
        if (closed) return;
        options.onResyncError?.(err);
      });
  };

  tracker = createRowDiffTracker({
    ...(options.initialVersion !== undefined
      ? { initialVersion: options.initialVersion }
      : {}),
    ...(options.onDiff ? { onDiff: options.onDiff } : {}),
    onGap: (gap) => {
      triggerResync(gap.fromVersion);
    },
  });

  unsubscribe = adapter.subscribe(
    (diff) => {
      if (closed) return;
      tracker.accept(diff);
    },
    options.initialVersion !== undefined
      ? { fromVersion: options.initialVersion }
      : undefined,
  );

  return {
    close() {
      if (closed) return;
      closed = true;
      try {
        unsubscribe();
      } catch {
        // ignore — adapter's unsubscribe shouldn't throw, but defensive.
      }
      adapter.close?.();
    },
    lastVersion: () => tracker.lastVersion(),
    isPaused: () => tracker.isPaused(),
    resyncNow: async () => {
      const fromVersion = tracker.lastVersion();
      const response = await adapter.resync({ fromVersion });
      if (closed) return;
      handleResyncResponse(response);
    },
  };
}
