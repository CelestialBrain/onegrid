# @onegrid/duckdb-join

Cross-source SQL joins via DuckDB-WASM in the browser. Register
heterogeneous data sources (Postgres-fetched rows, Mongo docs,
ClickHouse responses, plain JS arrays, Arrow IPC byte streams) as
DuckDB views; run a single SQL query that joins across them.

The signature use case: an enterprise grid showing **orders from
Postgres LEFT JOINed with customer profiles from MongoDB LEFT JOINed
with event counts from ClickHouse**, all reconciled in the browser
in the same render frame.

## Why this is unusual

Other grids either fetch a flat denormalized view from the server or
do client-side joins via hand-rolled loops. DuckDB-WASM is a
production-grade columnar SQL engine that runs in a Web Worker — you
get real query planning, indexes on join keys, and the same SQL
syntax across heterogeneous sources.

## Quickstart

```ts
import { AsyncDuckDB, ConsoleLogger } from '@duckdb/duckdb-wasm';
import { executeJoinQuery } from '@onegrid/duckdb-join';

const db = new AsyncDuckDB(new ConsoleLogger(), /* worker */);
await db.instantiate(/* ... */);

const result = await executeJoinQuery({
  db,
  sources: [
    { kind: 'rows', name: 'orders', rows: ordersFromPostgres },
    { kind: 'rows', name: 'customers', rows: customersFromMongo },
    {
      kind: 'sql',
      name: 'event_counts',
      query: `(VALUES ${eventCountsFromClickHouse.map(({ id, n }) => `(${id}, ${n})`).join(',')}) AS t(customer_id, count)`,
    },
  ],
  query: `
    SELECT o.id, o.total, c.name, e.count AS events
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN event_counts e ON o.customer_id = e.customer_id
    ORDER BY o.total DESC
    LIMIT 100
  `,
});
// result.rows / result.columns / result.elapsedMs
```

## Source kinds

| Kind    | Use when                                                                              |
| ------- | ------------------------------------------------------------------------------------- |
| `rows`  | ≤ 1k JS objects. Cheaper than serializing to Arrow.                                   |
| `arrow` | Larger source. Registered via `db.registerFileBuffer(...)` + `read_arrow()` view.     |
| `sql`   | An inline SELECT or VALUES that becomes the view body. Lets you reuse DuckDB literals. |

## Lifecycle

`executeJoinQuery` registers sources, runs the query, drops the views.
For long-lived views (e.g. one source you refresh on a timer), call
`registerSource` directly and manage `unregisterSource` yourself.

## Peer dependency

`@duckdb/duckdb-wasm` is declared as an **optional peer**. Adopters
who already integrate DuckDB-WASM (the v0.0.8 `@onegrid/duckdb`
adapter for instance) bring their own `AsyncDuckDB` instance; we
don't pin a version or force the wasm download.

## License

MIT
