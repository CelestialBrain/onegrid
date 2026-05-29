// =============================================================================
// @onegrid/temporal
//
// Time-travel layer over the v0.0.8 RowDiff stream. Every diff carries a
// monotonic version already; this package adds:
//
//   - append(diff): record a diff into the log
//   - snapshotAt(version): reconstruct state at any past version
//   - diffBetween(v1, v2): net diff between two points (suitable for
//     "undo back to version V" / "redo forward")
//   - branch(fromVersion): fork a new sub-log starting at a past version
//   - current(): O(1) read of the live snapshot
//
// Memory bounds: optionally take periodic snapshot anchors every N diffs.
// snapshotAt(V) replays from the nearest preceding anchor → O(N) per
// query rather than O(total-diffs).
// =============================================================================

import type { RowDiff } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Logged diff entry. version is monotonic; ts is wall-clock.
 * @beta
 */
export interface TemporalEntry {
  readonly version: number;
  readonly ts: number;
  readonly diff: RowDiff;
}

/** @beta */
export interface TemporalLogOptions {
  /**
   * Take a full snapshot every N diffs so replay stays bounded.
   * 0 disables anchors (snapshotAt walks the whole log). Default 1000.
   */
  readonly anchorInterval?: number;
  /**
   * Drop entries older than this many versions back. 0 = never. Default 0
   * (keep all). Useful for long-running grids where the temporal window
   * is bounded.
   */
  readonly retentionVersions?: number;
}

interface Anchor {
  readonly version: number;
  readonly snapshot: Map<string, Readonly<Record<string, unknown>>>;
}

// -----------------------------------------------------------------------------
// TemporalLog
// -----------------------------------------------------------------------------

/** @beta */
export class TemporalLog {
  private readonly entries: TemporalEntry[] = [];
  private readonly anchors: Anchor[] = [];
  private snapshot = new Map<string, Readonly<Record<string, unknown>>>();
  private readonly anchorInterval: number;
  private readonly retention: number;
  private nextVersion = 1;

  constructor(opts: TemporalLogOptions = {}) {
    this.anchorInterval = opts.anchorInterval ?? 1000;
    this.retention = opts.retentionVersions ?? 0;
    // Anchor at v0 — empty state.
    this.anchors.push({ version: 0, snapshot: new Map() });
  }

  /** Latest version the log has seen. 0 if no diffs have been appended. */
  get headVersion(): number {
    return this.entries.length === 0 ? 0 : this.entries[this.entries.length - 1]!.version;
  }

  /** O(1) read of the current snapshot. */
  current(): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
    return this.snapshot;
  }

  /**
   * Append a diff with an auto-incremented version. Re-takes a snapshot
   * anchor when `anchorInterval` is crossed; trims old entries when
   * `retentionVersions` is set.
   */
  append(diff: RowDiff, ts: number = Date.now()): TemporalEntry {
    const version = this.nextVersion++;
    const entry: TemporalEntry = { version, ts, diff };
    this.applyToLive(diff);
    this.entries.push(entry);
    if (this.anchorInterval > 0 && version % this.anchorInterval === 0) {
      this.anchors.push({ version, snapshot: new Map(this.snapshot) });
    }
    if (this.retention > 0) this.trim(version);
    return entry;
  }

  /**
   * Reconstruct the snapshot state immediately after applying every diff
   * up to and including `version`. Throws if `version` is in the future
   * or trimmed past.
   */
  snapshotAt(version: number): Map<string, Readonly<Record<string, unknown>>> {
    if (version < 0) throw new Error('[OG_TEMPORAL_INVALID_VERSION] negative');
    if (version > this.headVersion) {
      throw new Error(
        `[OG_TEMPORAL_INVALID_VERSION] ${String(version)} > head ${String(this.headVersion)}`,
      );
    }
    // Find the latest anchor with version <= target.
    let base: Anchor | undefined;
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i]!;
      if (a.version <= version) {
        base = a;
        break;
      }
    }
    if (!base) {
      throw new Error(
        `[OG_TEMPORAL_TRIMMED] version ${String(version)} is older than the earliest anchor`,
      );
    }
    const snap = new Map(base.snapshot);
    for (const e of this.entries) {
      if (e.version <= base.version) continue;
      if (e.version > version) break;
      applyDiffToSnapshot(snap, e.diff);
    }
    return snap;
  }

  /**
   * Net diff from version `from` (exclusive) to `to` (inclusive). Useful
   * for "undo back to v" — apply this diff in reverse to roll back, or
   * apply forward to redo.
   */
  diffBetween(from: number, to: number): RowDiff[] {
    if (from > to) throw new Error('[OG_TEMPORAL_INVALID_RANGE] from > to');
    if (to > this.headVersion) throw new Error('[OG_TEMPORAL_INVALID_RANGE] to > head');
    const out: RowDiff[] = [];
    for (const e of this.entries) {
      if (e.version > from && e.version <= to) out.push(e.diff);
    }
    return out;
  }

  /**
   * Fork a new TemporalLog starting at `fromVersion`. The new log
   * inherits the snapshot at that version; subsequent appends are
   * independent.
   */
  branch(fromVersion: number, opts?: TemporalLogOptions): TemporalLog {
    const snap = this.snapshotAt(fromVersion);
    const fork = new TemporalLog({
      anchorInterval: opts?.anchorInterval ?? this.anchorInterval,
      retentionVersions: opts?.retentionVersions ?? this.retention,
    });
    // Seed the fork's live snapshot + anchor at v0 to the parent's
    // snapshot at fromVersion.
    fork.snapshot = snap;
    fork.anchors[0] = { version: 0, snapshot: new Map(snap) };
    return fork;
  }

  /**
   * Iterate every entry in version order. Useful for replication /
   * persistence — write each entry to durable storage.
   */
  *iterate(): IterableIterator<TemporalEntry> {
    for (const e of this.entries) yield e;
  }

  /** Number of entries currently retained. */
  get size(): number {
    return this.entries.length;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private applyToLive(diff: RowDiff): void {
    applyDiffToSnapshot(this.snapshot, diff);
  }

  private trim(currentVersion: number): void {
    const cutoff = currentVersion - this.retention;
    if (cutoff <= 0) return;
    // Drop entries with version <= cutoff. Drop anchors strictly less
    // than the new oldest entry.
    while (this.entries.length > 0 && this.entries[0]!.version <= cutoff) {
      this.entries.shift();
    }
    const oldestRetained = this.entries[0]?.version ?? currentVersion;
    while (
      this.anchors.length > 1 &&
      this.anchors[0]!.version < oldestRetained - 1 &&
      (this.anchors[1]?.version ?? Infinity) <= oldestRetained
    ) {
      this.anchors.shift();
    }
  }
}

// -----------------------------------------------------------------------------
// Free-function helpers
// -----------------------------------------------------------------------------

/**
 * Apply a single RowDiff to a mutable snapshot map.
 * @beta
 */
export function applyDiffToSnapshot(
  snap: Map<string, Readonly<Record<string, unknown>>>,
  diff: RowDiff,
): void {
  const pkey = String(diff.pkey);
  switch (diff.kind) {
    case 'insert':
      snap.set(pkey, diff.fields ?? {});
      return;
    case 'update': {
      const cur = snap.get(pkey) ?? {};
      snap.set(pkey, { ...cur, ...(diff.fields ?? {}) });
      return;
    }
    case 'delete':
      snap.delete(pkey);
      return;
  }
}

/**
 * Compute the inverse of a single RowDiff given the state immediately
 * before it was applied. Used to construct undo diffs.
 * @beta
 */
export function invertDiff(
  diff: RowDiff,
  prevSnap: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): RowDiff {
  const pkey = String(diff.pkey);
  switch (diff.kind) {
    case 'insert':
      return { kind: 'delete', version: diff.version, pkey };
    case 'delete': {
      const prev = prevSnap.get(pkey) ?? {};
      return { kind: 'insert', version: diff.version, pkey, fields: { ...prev } };
    }
    case 'update': {
      const prev = prevSnap.get(pkey) ?? {};
      // The inverse of an update is an update back to the previous
      // values of the touched fields — fields the diff didn't carry
      // are unchanged and don't appear in the inverse.
      const touched = diff.fields ?? {};
      const inverseFields: Record<string, unknown> = {};
      for (const k of Object.keys(touched)) inverseFields[k] = prev[k];
      return { kind: 'update', version: diff.version, pkey, fields: inverseFields };
    }
  }
}
