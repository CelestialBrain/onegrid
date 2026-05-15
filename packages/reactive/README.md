# @onegrid/reactive

Salsa-style on-demand memoization substrate. Inputs you write to, tracked
queries you read from, revision-counter invalidation, and the
**backdating** property that turns dependency cascades into
single-leaf recomputes.

Substrate-only in v0.0.11: the formula engine, derived views, and the
column tool panel migrate onto this in v0.0.11.x patch releases. The
formula engine's existing Adapton-style implementation stays canonical
until then.

## Why Salsa

The Adapton model invalidates on dependency change. The Salsa model goes
further: when a query recomputes and its **value** hasn't changed (even
though a dependency's identity has), the cached entry **keeps its old
`computedAt` revision**. Anything downstream sees the upstream as
"unchanged since revision R" and short-circuits its own recompute. A
1000-node graph with one leaf changing — where the change happens to
re-derive to the same final value — runs O(1) recomputes, not O(N).

That property is what `rust-analyzer` uses to stay responsive as you
type. oneGrid will lean on it for derived views, column tool panel,
and formula trees.

## Quickstart

```ts
import { Database } from '@onegrid/reactive';

const db = new Database();

const x = db.defineInput('x', 5);
const y = db.defineInput('y', 10);

const square = db.defineQuery<undefined, number>('square', () => {
  return x.get() * x.get();
});

const sum = db.defineQuery<undefined, number>('sum', () => {
  return square(undefined) + y.get();
});

sum(undefined);      // computes square + sum
x.set(5);            // no-op — input value didn't change
sum(undefined);      // cache hit, zero compute
x.set(-5);           // bumps revision
sum(undefined);      // square re-runs, gets 25 again (backdated)
                     // — sum SKIPS its compute because square's
                     //   computedAt didn't advance
```

## API

- **`db.defineInput<T>(key, initial, eq?)`** — register an input slot.
  Returns `{ get, set }`. `eq` overrides the default `===` comparator
  for backdating at the input level (deep-equal trees, etc.).
- **`db.defineQuery<Args, T>(key, compute, opts?)`** — register a
  tracked query. Returns a callable `(args) => T`. `opts.eq` overrides
  the output comparator. `opts.hashArgs` overrides the args→memo-key
  function (default: `JSON.stringify`).
- **`db.currentRevision`** — monotonic revision counter (debug).
- **`db.memoCount`** — number of cached memos (debug).

## License

MIT
