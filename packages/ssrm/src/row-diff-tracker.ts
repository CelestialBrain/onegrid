// =============================================================================
// RowDiffTracker
//
// Client-side gap-detection wrapper around an incoming `RowDiff`
// stream. Tracks the last-seen version, applies diffs in monotonic
// order, and fires `onGap` whenever the next received version is not
// exactly `lastSeenVersion + 1` — at which point the consumer is
// expected to issue a `ResyncRequest` to the server (the tracker
// itself never talks to the wire; it just observes).
//
// Two real-world failure modes the tracker exists to catch:
//   1. WebSocket transient disconnect: the client misses N diffs;
//      the next emit's version is far ahead of last-seen.
//   2. Server-side queue overflow: the server itself drops events
//      and emits a "next safe version" marker; client has to rebuild
//      from a snapshot.
//
// Not on-wire — purely a client-state-machine helper.
// =============================================================================

import type { RowDiff } from '@onegrid/protocol';

export interface RowDiffTrackerOptions {
  /** Initial last-seen version. -1 = "no diffs seen yet, accept any
   *  starting version." Default: -1. */
  readonly initialVersion?: number;
  /** Called for every diff that lands in correct version order. */
  readonly onDiff?: (diff: RowDiff) => void;
  /** Called when the next received version is not lastSeenVersion + 1.
   *  Caller should issue a `ResyncRequest({ fromVersion: gap.fromVersion })`
   *  to the server. The tracker pauses (doesn't fire `onDiff` for
   *  out-of-order diffs) until `resume(throughVersion)` is called. */
  readonly onGap?: (gap: { fromVersion: number; nextVersion: number }) => void;
  /** Called when a diff with version ≤ lastSeenVersion arrives — a
   *  duplicate / out-of-order replay. Default: ignored silently
   *  (most common cause is a server resending after a network flap). */
  readonly onDuplicate?: (diff: RowDiff) => void;
}

export interface RowDiffTracker {
  /** Apply a single diff. Routes through gap detection and ordering. */
  readonly accept: (diff: RowDiff) => void;
  /** Apply a batch of diffs in version order. */
  readonly acceptMany: (diffs: ReadonlyArray<RowDiff>) => void;
  /** After a gap is signaled and the consumer has fetched a
   *  ResyncResponse, replay its `diffs` through the tracker and
   *  call this to advance the high-water mark to `toVersion`. */
  readonly resume: (throughVersion: number) => void;
  /** Force a snapshot reset — equivalent to receiving
   *  `ResyncResponse { snapshot: true, toVersion: V }`. Drops the
   *  paused state if any and rebases the version to V. */
  readonly snapshotTo: (version: number) => void;
  /** Current last-seen version. */
  readonly lastVersion: () => number;
  /** Whether the tracker is currently paused awaiting a resync. */
  readonly isPaused: () => boolean;
}

export function createRowDiffTracker(
  options: RowDiffTrackerOptions = {},
): RowDiffTracker {
  let lastVersion = options.initialVersion ?? -1;
  let paused = false;

  const apply = (diff: RowDiff): void => {
    // Duplicate / replay (≤ lastVersion). Ignore by default.
    if (diff.version <= lastVersion) {
      options.onDuplicate?.(diff);
      return;
    }
    // Gap detection. lastVersion=-1 means "no baseline yet" — accept
    // any starting version without firing onGap.
    if (lastVersion >= 0 && diff.version !== lastVersion + 1) {
      paused = true;
      options.onGap?.({
        fromVersion: lastVersion,
        nextVersion: diff.version,
      });
      // Hold the diff back; consumer will replay through resume().
      return;
    }
    lastVersion = diff.version;
    options.onDiff?.(diff);
  };

  return {
    accept(diff) {
      if (paused) {
        // While paused, only the resume / snapshotTo path advances
        // the version. New live diffs are dropped — they'll be
        // re-delivered as part of the resync response or a snapshot
        // refresh.
        return;
      }
      apply(diff);
    },
    acceptMany(diffs) {
      for (const d of diffs) {
        if (paused) return;
        apply(d);
      }
    },
    resume(throughVersion) {
      paused = false;
      if (throughVersion > lastVersion) lastVersion = throughVersion;
    },
    snapshotTo(version) {
      paused = false;
      lastVersion = version;
    },
    lastVersion: () => lastVersion,
    isPaused: () => paused,
  };
}
