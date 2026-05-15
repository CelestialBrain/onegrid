# DBSP operator algebra — oneGrid spec

**Status:** v0.0.10 item 6 (the spec). Item 7 (`@onegrid/dbsp`) implements
it. This document is the contract between the two.

**Reference:** Budiu et al., *DBSP: Automatic Incremental View
Maintenance for Rich Query Languages*, VLDB 2023.
https://www.vldb.org/pvldb/vol16/p1601-budiu.pdf

oneGrid uses DBSP as the formal substrate for incremental view
maintenance on the grid. The signature use case: when a single row
arrives via CDC, recompute group totals, filtered counts, and
pivot summaries in O(Δ) time instead of O(N).

## 1. Foundations

### 1.1 Z-sets (signed multisets)

A **Z-set** over a domain `T` is a function `Z[T] = T → ℤ` with finite
support — a set of `(record, weight)` pairs where the weight is an
integer.

- Insert one row `r`: `(r, +1)`
- Delete one row `r`: `(r, -1)`
- Update from `r₀` to `r₁`: `(r₀, -1) + (r₁, +1)`

The grid's row stream IS a Z-set stream — every CDC diff carries
implicit weights of ±1.

### 1.2 Streams

A **stream** is an infinite sequence `〈z₀, z₁, z₂, …〉` of Z-sets.
Operators map streams to streams.

`Stream[T] = ℕ → Z[T]`

By convention, the grid considers position 0 as the empty stream
prefix and increments on every CDC commit.

### 1.3 Integration / differentiation

- `∫(s)` integrates: `∫(s)[t] = Σᵢ₌₀..ₜ s[i]` — the snapshot at time `t`.
- `D(s)` differentiates: `D(s)[t] = s[t] - s[t-1]` — the change at time `t`.

`∫` and `D` are mutual inverses: `D(∫(s)) = s = ∫(D(s))`.

A "stream of snapshots" IS `∫(diff_stream)`; a "stream of diffs" IS
`D(snapshot_stream)`. They're interchangeable.

### 1.4 Lifting

For any operator `f: Z[T] → Z[U]` (non-incremental), its **lifted**
version `↑f: Stream[T] → Stream[U]` applies `f` pointwise. Any
relational operator we want to incrementalize starts as a lifted
non-incremental implementation.

### 1.5 The DBSP incrementalization theorem

For any operator `f: Z[T] → Z[U]`:

```
↑f^Δ = D ∘ ↑f ∘ ∫
```

The "incremental version" of `f` (named `f^Δ`) processes a stream of
diffs by integrating to a snapshot, applying `f`, then differentiating
back to a diff. **This is a definition, not an algorithm** — the
gain is that for nice operators, `f^Δ` simplifies to something far
cheaper than the round trip.

The win: for a `count` operator, `count^Δ` ≡ `↑count` itself — adding a
row to the input adds 1 to the count regardless of total size.

## 2. Operators oneGrid implements

### 2.1 Map / select

```
σ(s)[t] = { (project(r), w) | (r, w) ∈ s[t] }
```

Pure column projection. Incremental version is identical to the
non-incremental:

```
σ^Δ = σ
```

### 2.2 Filter

```
φₚ(s)[t] = { (r, w) | (r, w) ∈ s[t] ∧ p(r) }
```

Incremental is identical:

```
φₚ^Δ = φₚ
```

The grid maps `WHERE col = $1` and friends to filter operators.

### 2.3 Union / merge (Z-set addition)

```
(s₁ + s₂)[t] = s₁[t] + s₂[t]   // pointwise Z-set addition
```

Used to fan two adapter streams (e.g., a Postgres LISTEN and a
secondary outbox) into one logical row source.

### 2.4 Distinct (idempotent filter)

```
distinct(z) = { (r, sign(w)) | (r, w) ∈ z, w ≠ 0 }
```

Coalesces multiset weights to {+1, -1}. Required when a non-monotone
operator follows.

### 2.5 Group-by + aggregation (the key one)

```
groupAgg_K_A(z) = { (k, A({ r | r ∈ z, key(r) = k })) | k ∈ keys(z) }
```

The grid's incremental groupAgg is the most expensive operator we
incrementalize:

- `SUM`, `COUNT`, `AVG` — distributive / algebraic → O(1) per diff
- `MIN`, `MAX` — algebraic over Z-set with weight=1 → O(1) per insert,
  O(log N) per delete (re-scan partition if the removed value was
  the running min/max)
- `MEDIAN`, `MODE`, distinct-count — holistic → O(N) per partition
  per diff. v0.0.10 ships these as full-recompute fallbacks.

The Z-set algebra makes deletes correct: a deleted row arrives as
`(r, -1)`, the partition's running SUM subtracts `r.value`, COUNT
subtracts 1.

### 2.6 Join (delta-join / dataflow join)

For inputs `a: Stream[A]`, `b: Stream[B]`, join key `k`, the dataflow
join is:

```
(a ⋈ b)^Δ[t] = D(a)[t] ⋈ ∫(b)[t-1]   // a's new diff vs b's old state
              + ∫(a)[t]   ⋈ D(b)[t]   // a's new state vs b's new diff
```

(Adapted from Budiu et al. eq. 12.) Both arms run against indexed
state; the cost is `O(|Δa| · |b_at_key|) + O(|Δb| · |a_at_key|)`,
which is linear in the diff size for evenly-distributed keys. We
maintain incremental indexes on the join keys.

### 2.7 Pivot

Pivot decomposes into group-by on the row-key, then projection of
each row's values column into named columns keyed by the pivot
dimension. As a DBSP plan:

```
pivot = groupAgg_(row_keys)_(per_dim → A)
```

Same incremental properties as group-by, multiplied by the number
of pivot columns.

### 2.8 Sort + paging

Sort is the operator that resists pure incrementalization — adding
one row at the top requires sliding every row down by one in the
worst case. Two paths:

- **Top-K sort** with a window of K rows (the grid viewport): O(K)
  per diff via heap.
- **Full sort** with keyset cursors: we incrementally maintain the
  sorted index using a balanced BST (red-black tree). Insert / delete
  is O(log N); the SSRM viewport reads a slice cheaply.

Sort sits between the DBSP pipeline and the renderer — diffs arrive,
the algebra runs, then sort is applied at the cursor read point.

## 3. The grid's IR

oneGrid's DBSP IR is a directed-acyclic operator graph. Each node is
typed:

```ts
type Op =
  | { kind: 'source'; name: string }                       // input stream
  | { kind: 'map'; project: (r: Row) => Row }
  | { kind: 'filter'; predicate: (r: Row) => boolean }
  | { kind: 'union' }
  | { kind: 'distinct' }
  | { kind: 'groupAgg'; keys: string[]; aggs: AggSpec[] }
  | { kind: 'join'; left: Op; right: Op; on: (l: Row, r: Row) => unknown }
  | { kind: 'pivot'; rowKeys: string[]; dim: string; agg: AggSpec }
  | { kind: 'sort'; sort: SortModel; topK?: number }
  | { kind: 'sink'; name: string };                        // output cursor
```

Each operator implements:

```ts
interface Operator {
  init(): void;
  applyDiff(diff: Diff): Diff;       // input diff → output diff
  snapshot(): Z<Row>;                 // for debug / cold-start
  dispose(): void;
}
```

`applyDiff` is the hot path — it MUST run in time proportional to
the input diff, not the snapshot size, for the operator to qualify
as "incremental."

## 4. Wire format

Diffs cross adapter / worker / network boundaries as serialized
Z-sets. The shape matches v0.0.8's `RowDiff` but with explicit
weights:

```ts
interface DbspDiff {
  readonly stream: string;          // source id
  readonly version: number;         // monotonic
  readonly entries: ReadonlyArray<{
    readonly weight: -1 | 1;
    readonly key: string;
    readonly row: Readonly<Record<string, unknown>>;
  }>;
}
```

Weight magnitude > 1 is legal in the algebra but never emitted by
oneGrid's CDC adapters (insert + insert = two separate +1 entries,
not one +2).

## 5. State management

Most operators maintain auxiliary state:

| Operator   | State shape                                    |
| ---------- | ---------------------------------------------- |
| `groupAgg` | `Map<key, { count: number, agg: AggState }>`   |
| `join`     | `Map<joinKey, Map<rowId, Row>>` per input      |
| `distinct` | `Map<key, weight>`                             |
| `sort`     | red-black tree / heap, keyed by sort tuple     |
| `pivot`    | `Map<rowKey, Map<dimValue, AggState>>`         |
| filter / map / union | none (pure functions of the current diff) |

State lives in the operator instance; serialization for resume after
a process restart is out of scope for v0.0.10. v0.0.11 will add a
checkpoint protocol.

## 6. Reference implementation

`@onegrid/dbsp` (v0.0.10 item 7) implements every operator in §2
plus the wire format in §4 and the IR runtime that walks the graph
applying diffs. The package goal is correctness + match the algebraic
semantics; perf can be optimized in v0.0.11+.

Test strategy:
1. **Property tests** verifying `↑f^Δ ≡ D ∘ ↑f ∘ ∫` for each
   non-incremental `f` we ship. The property holds by construction
   but the implementation might drift.
2. **Replay tests** — synthesize a stream of inserts/updates/deletes,
   run the full snapshot pipeline vs. the incremental pipeline,
   assert byte-equal output at every step.
3. **Adversarial tests** — operator orderings the algebra DOESN'T
   handle gracefully (a non-distinct stream feeding a non-monotone
   operator) should throw `[OG_DBSP_INVALID_PLAN]` at construction.

## 7. What's out of scope

- **Recursive queries** (transitive closure, etc.). DBSP supports
  them; oneGrid doesn't need them at the grid surface.
- **Multiple time dimensions.** Single linear logical time.
- **Distributed execution.** Single-process for v0.0.10; v0.1.x may
  add operator-graph partitioning across Workers.
- **Cost-based planner.** The plan is what the consumer specifies;
  we don't reorder joins or push down predicates.

## References (public source only)

- Budiu et al., *DBSP: Automatic Incremental View Maintenance for
  Rich Query Languages*, VLDB 2023.
- McSherry et al., *Differential Dataflow*, CIDR 2013.
- Gjengset et al., *Noria: dynamic, partially-stateful data-flow*,
  OSDI 2018.
