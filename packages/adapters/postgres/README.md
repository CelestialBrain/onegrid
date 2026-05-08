# @onegrid/postgres

Raw Postgres adapter for oneGrid's SSRM. Translates `BlockRequest`
into parameterized SQL via a pure compiler; ships a LISTEN/NOTIFY-
backed CDC adapter that conforms to the universal row-diff stream
shape from `@onegrid/ssrm`.

Requires `pg` ^8.11.0 as a peer dependency.

## Quickstart

```ts
import { Pool } from 'pg';
import { createPgDataSource } from '@onegrid/postgres';
import { createSsrmRowSource } from '@onegrid/ssrm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const dataSource = createPgDataSource({
  client: pool,
  table: {
    table: 'public.orders',
    columns: ['id', 'status', 'amount', 'customer'],
    primaryKey: 'id',
  },
  schema: [
    { id: 'id', type: 'int64' },
    { id: 'status', type: 'utf8' },
    { id: 'amount', type: 'float64' },
    { id: 'customer', type: 'utf8' },
  ],
});

const rowSource = createSsrmRowSource(dataSource, {
  numRows: 1_000_000,
  blockSize: 200,
});
```

## Filters / sorts / aggregations

The compiler handles every operator in `@onegrid/protocol`'s
`ComparisonOperator` (eq, neq, lt, lte, gt, gte, in, notIn, contains,
notContains, startsWith, endsWith, isNull, isNotNull, between,
notBetween) and every aggregation in `AggregationType` (sum, avg,
count, countDistinct, min, max — `first` / `last` are unsupported as
of v0.0.8 because they're non-trivial to express in standard SQL).

Identifier safety: column names are matched against the table
descriptor's `columns` list at compile time. Anything not in that
list throws `unknown column "X"` before SQL is built — there is no
path for user input to reach an identifier slot.

LIKE-special characters (`%`, `_`, `\`) are escaped on `contains`,
`startsWith`, `endsWith`, `notContains`. The default match is case
sensitive; pass `caseSensitive: false` on the comparison filter to
get a `LOWER()`-wrapped predicate.

## Keyset pagination

Cursors are the canonical `ks:<base64>` shape from
`@onegrid/ssrm/cursor`. The compiler emits a row-comparison
predicate Postgres can seek directly via the table's covering index:

```sql
SELECT … FROM "public"."orders"
WHERE ("status", "amount", "id") > ($1, $2, $3)
ORDER BY "status" ASC NULLS LAST, "amount" ASC NULLS LAST, "id" ASC
LIMIT $4
```

The primary key is appended to ORDER BY as the tiebreaker so the
ordering is total. Mixed-direction sorts (some ASC + some DESC) are
treated as "all DESC if any DESC" for the keyset predicate; full
per-column direction support lands in v0.0.9.

Legacy `offset:N` cursors (from `SsrmRowSource`'s synchronous random-
access bridge) are dropped silently — this adapter is keyset-only.
That's deliberate: SQL `OFFSET` is O(N) on large tables and would
defeat the whole point of using Postgres.

## Aggregation pushdown

When `BlockRequest.grouping` is set, the compiler emits a
`GROUP BY` query. Each row in the result carries:

- The group-key column(s) (e.g. `status: 'active'`)
- `__count__: int` — per-group row count
- One column per aggregation, named by alias or `${fn}_${columnId}`

```sql
SELECT
  "status",
  COUNT(*)::int AS "__count__",
  COALESCE(SUM("amount")::float, 0) AS "sum_amount"
FROM "public"."orders"
GROUP BY "status"
ORDER BY "status" ASC
```

`COALESCE(SUM)` keeps the result `0` for empty groups (matches the
in-process aggregator's behavior). `AVG` returns `null` for empty
groups (Postgres's default).

## LISTEN/NOTIFY CDC

The CDC adapter subscribes to a single NOTIFY channel (default
`onegrid_row_diff`) on a dedicated `pg.Client` connection (NOT a
pool — LISTEN is per-session).

```ts
import { Client } from 'pg';
import { createPgCdcAdapter } from '@onegrid/postgres';
import { createRowDiffStream } from '@onegrid/ssrm';

const listenClient = new Client({ connectionString: process.env.DATABASE_URL });
await listenClient.connect();

const cdc = createPgCdcAdapter({
  client: listenClient,
  resyncQuery: async (fromVersion) => {
    const { rows } = await pool.query(
      `SELECT version, kind, pkey, fields
       FROM onegrid_outbox
       WHERE version > $1
       ORDER BY version
       LIMIT 10000`,
      [fromVersion],
    );
    return rows;
  },
});

const stream = createRowDiffStream(cdc, {
  onDiff: (diff) => {
    // Apply to the local cache + invalidate any block that covered
    // this row.
  },
});
```

### Required server-side schema

The trigger that emits `NOTIFY` is application code — it lives in
your migrations, not in this package, because the row-diff payload
shape depends on which columns you want to ship over the wire.

Recommended pattern (outbox + trigger):

```sql
-- Outbox table — durable history of every mutation. The CDC
-- adapter's resync query reads from this when the client missed
-- some NOTIFY events (reconnect, queue overflow).
CREATE TABLE onegrid_outbox (
  version  bigserial PRIMARY KEY,
  kind     text NOT NULL CHECK (kind IN ('insert', 'update', 'delete')),
  pkey     text NOT NULL,
  fields   jsonb,
  emitted_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger function: writes to outbox + emits NOTIFY in one txn.
CREATE FUNCTION onegrid_emit_row_diff() RETURNS trigger AS $$
DECLARE
  diff_kind text;
  diff_pkey text;
  diff_fields jsonb;
  inserted_version bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    diff_kind := 'insert';
    diff_pkey := NEW.id::text;
    diff_fields := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    diff_kind := 'update';
    diff_pkey := NEW.id::text;
    diff_fields := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    diff_kind := 'delete';
    diff_pkey := OLD.id::text;
    diff_fields := NULL;
  END IF;

  INSERT INTO onegrid_outbox (kind, pkey, fields)
  VALUES (diff_kind, diff_pkey, diff_fields)
  RETURNING version INTO inserted_version;

  PERFORM pg_notify('onegrid_row_diff', json_build_object(
    'version', inserted_version,
    'kind',    diff_kind,
    'pkey',    diff_pkey,
    'fields',  diff_fields
  )::text);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_row_diff
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION onegrid_emit_row_diff();
```

The outbox doubles as a perfect resync source: when a client missed
events, it queries `WHERE version > $fromVersion ORDER BY version`
and replays. When the gap exceeds `maxResyncDiffs` (default 10000),
the adapter falls back to a snapshot response and the client
re-fetches its blocks from scratch.

## What's NOT in this adapter (yet)

- **Live updates triggered by writes within the same connection.**
  Postgres NOTIFY doesn't deliver to the same connection that
  emitted it; if you need per-connection echo, use a separate
  listener.
- **Composite primary keys.** The compiler assumes `primaryKey` is
  a single column id. v0.0.9 will add `primaryKey: string |
  ReadonlyArray<string>` for composite keys.
- **JSONB column projection.** Whole-column JSONB roundtrip works;
  path-extraction (`->`, `->>`, `#>`) is a v0.0.9 follow-up.
- **Mixed-direction keyset sorts.** All-ASC or all-DESC sorts
  produce correct keyset SQL; mixed gets coerced to all-DESC for
  the cursor predicate.
- **Schema introspection.** The schema is currently passed in by
  hand. v0.0.8 item 12 (`inferColumns(schema)`) ships the helper.

## License

MIT
