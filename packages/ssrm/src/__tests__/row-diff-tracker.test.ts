// =============================================================================
// RowDiffTracker — unit tests.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { RowDiff } from '@onegrid/protocol';
import { createRowDiffTracker } from '../row-diff-tracker';

function diff(version: number, kind: RowDiff['kind'] = 'update'): RowDiff {
  return { version, kind, pkey: `r${String(version)}` };
}

describe('createRowDiffTracker', () => {
  it('fires onDiff in version order on a contiguous stream', () => {
    const onDiff = vi.fn();
    const tracker = createRowDiffTracker({ onDiff });
    tracker.accept(diff(1));
    tracker.accept(diff(2));
    tracker.accept(diff(3));
    expect(onDiff).toHaveBeenCalledTimes(3);
    expect(tracker.lastVersion()).toBe(3);
    expect(tracker.isPaused()).toBe(false);
  });

  it('accepts any starting version when no baseline is set', () => {
    const onDiff = vi.fn();
    const tracker = createRowDiffTracker({ onDiff });
    tracker.accept(diff(42));
    tracker.accept(diff(43));
    expect(onDiff).toHaveBeenCalledTimes(2);
    expect(tracker.lastVersion()).toBe(43);
  });

  it('respects an explicit initialVersion baseline', () => {
    const onDiff = vi.fn();
    const onGap = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 9,
      onDiff,
      onGap,
    });
    tracker.accept(diff(10));
    expect(onDiff).toHaveBeenCalledTimes(1);
    expect(onGap).not.toHaveBeenCalled();
  });

  it('fires onGap when a version is skipped and pauses', () => {
    const onDiff = vi.fn();
    const onGap = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 5,
      onDiff,
      onGap,
    });
    tracker.accept(diff(6));
    tracker.accept(diff(8)); // skip 7 → gap
    expect(onDiff).toHaveBeenCalledTimes(1);
    expect(onGap).toHaveBeenCalledWith({
      fromVersion: 6,
      nextVersion: 8,
    });
    expect(tracker.isPaused()).toBe(true);
  });

  it('drops live diffs while paused', () => {
    const onDiff = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 0,
      onDiff,
    });
    tracker.accept(diff(1));
    tracker.accept(diff(5)); // gap → paused
    tracker.accept(diff(6));
    tracker.accept(diff(7));
    // Only diff(1) made it through; everything after the gap was held.
    expect(onDiff).toHaveBeenCalledTimes(1);
    expect(tracker.isPaused()).toBe(true);
  });

  it('resume(throughVersion) clears paused state and advances the high-water mark', () => {
    const onDiff = vi.fn();
    const onGap = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 5,
      onDiff,
      onGap,
    });
    tracker.accept(diff(6));
    tracker.accept(diff(10)); // gap
    expect(tracker.isPaused()).toBe(true);
    // Caller fetches a ResyncResponse covering 7..10 and replays
    // them through the tracker before calling resume.
    tracker.resume(10);
    expect(tracker.isPaused()).toBe(false);
    expect(tracker.lastVersion()).toBe(10);
    // Subsequent live diffs from 11 onwards land normally.
    tracker.accept(diff(11));
    expect(tracker.lastVersion()).toBe(11);
  });

  it('snapshotTo() rebases the version and unblocks paused state', () => {
    const onDiff = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 0,
      onDiff,
    });
    tracker.accept(diff(1));
    tracker.accept(diff(99)); // huge gap → paused
    expect(tracker.isPaused()).toBe(true);
    // Server returns ResyncResponse { snapshot: true, toVersion: 99 }
    // — the client wipes its cache and calls snapshotTo(99).
    tracker.snapshotTo(99);
    expect(tracker.isPaused()).toBe(false);
    expect(tracker.lastVersion()).toBe(99);
    tracker.accept(diff(100));
    expect(tracker.lastVersion()).toBe(100);
  });

  it('forwards duplicates to onDuplicate without advancing the version', () => {
    const onDuplicate = vi.fn();
    const onDiff = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 5,
      onDiff,
      onDuplicate,
    });
    tracker.accept(diff(6));
    tracker.accept(diff(6)); // exact duplicate
    tracker.accept(diff(3)); // out-of-order replay
    expect(onDiff).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(2);
    expect(tracker.lastVersion()).toBe(6);
  });

  it('acceptMany processes a batch in order until paused', () => {
    const onDiff = vi.fn();
    const tracker = createRowDiffTracker({
      initialVersion: 0,
      onDiff,
    });
    tracker.acceptMany([diff(1), diff(2), diff(5), diff(6), diff(7)]);
    // Got 1, 2 cleanly. Gap at 5 → paused. 6 and 7 dropped.
    expect(onDiff).toHaveBeenCalledTimes(2);
    expect(tracker.isPaused()).toBe(true);
  });
});
