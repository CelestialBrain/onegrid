# @onegrid/temporal

Time-travel for oneGrid. Append-only diff log layered over the v0.0.8
`RowDiff` stream; reconstruct state at any past version, compute the
net diff between two points, branch from history.

## Why

Every `RowDiff` already carries a monotonic version. v0.0.8's CDC
adapters emit them; v0.0.8's `RowDiffTracker` consumes them; v0.0.10's
`@onegrid/dbsp` runs incremental operators against them. What was
missing: a built-in way to **look back**.

Use cases:
- Undo / redo at the row level
- "What did the dashboard look like at 2pm yesterday?"
- Branching simulations — fork a sub-log, try a change, compare
- Audit log replay

## Quickstart

```ts
import { TemporalLog } from '@onegrid/temporal';

const log = new TemporalLog({ anchorInterval: 1000 });

// Wire your CDC adapter's onDiff callback to log.append
cdc.subscribe((diff) => log.append(diff));

// Time travel
const snapAt2pm = log.snapshotAt(versionAt2pm);
const lastHour = log.diffBetween(versionAnHourAgo, log.headVersion);

// Branch
const fork = log.branch(versionAt2pm);
fork.append(/* hypothetical diff */);
```

## Memory bounds

- **`anchorInterval`** (default 1000): take a full-snapshot anchor every
  N diffs so `snapshotAt(V)` replays at most `anchorInterval` diffs
  forward from the nearest preceding anchor. 0 disables anchors.
- **`retentionVersions`** (default 0 = keep all): drop entries older
  than N versions back. Anchors older than the new oldest entry are
  also dropped.

## Undo / redo recipe

```ts
import { applyDiffToSnapshot, invertDiff } from '@onegrid/temporal';

// To roll back from headVersion down to version V:
const snapBefore = log.snapshotAt(V);
const undos: RowDiff[] = [];
for (const diff of log.diffBetween(V, log.headVersion)) {
  const preSnap = log.snapshotAt(diff.version - 1);
  undos.unshift(invertDiff(diff, preSnap));
}
// Apply `undos` in order via your normal diff-application path.
```

`invertDiff` returns:
- `insert` → `delete`
- `delete` → `insert` with the row's previous contents
- `update` → `update` with the touched fields restored to their
  previous values

## License

MIT
