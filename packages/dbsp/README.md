# @onegrid/dbsp

Differential dataflow / DBSP operator algebra. Incremental view
maintenance — when a single row arrives via CDC, recompute group
totals, filtered counts, and pivot summaries in O(Δ) time instead
of O(N).

Reference implementation of [docs/dbsp-spec.md](../../docs/dbsp-spec.md).

## Operators

| Operator      | applyDiff cost          | Spec § |
| ------------- | ----------------------- | ------ |
| `source`      | O(\|Δ\|)                | 2.1    |
| `map`         | O(\|Δ\|)                | 2.1    |
| `filter`      | O(\|Δ\|)                | 2.2    |
| `union`       | O(\|Δ\|)                | 2.3    |
| `distinct`    | O(\|Δ\|)                | 2.4    |
| `groupAgg`    | O(\|Δ\| · #aggs)        | 2.5    |
| `topK` (sort) | O(N log K) baseline     | 2.8    |

Full join (delta-join with indexed state on both sides) and full
sort with red-black tree are scheduled for v0.0.10.x.

## Quickstart

```ts
import { Pipeline, createSource, createFilter, createGroupAgg } from '@onegrid/dbsp';

const pipeline = new Pipeline([
  createSource(),
  createFilter((r) => Number(r.amount) >= 100),
  createGroupAgg(['region'], [
    { out: 'total', src: 'amount', kind: 'sum' },
    { out: 'n', kind: 'count' },
  ]),
]);

// CDC diff arrives — pipeline updates group totals incrementally.
pipeline.step({
  entries: [
    { key: 'r1', row: { region: 'us', amount: 200 }, weight: 1 },
  ],
});
```

## Property: incrementalization theorem

For each operator `f` in §2 of the spec:

```
↑f^Δ ≡ D ∘ ↑f ∘ ∫
```

— applying `f` incrementally to a diff stream produces the same
output as snapshotting, applying `f`, and differentiating back.
The test suite verifies this for every operator on synthesized
random diff streams.

## License

MIT
