# @onegrid/clickhouse

ClickHouse adapter for oneGrid's SSRM. Translates `BlockRequest`
into native parameterized SQL using ClickHouse's `{pN:Type}` named-
placeholder syntax. Supports both JSONEachRow and Arrow IPC
response formats — Arrow IPC is the high-throughput columnar path
for wide tables.

No peer dependency — adapt your existing client (`@clickhouse/client`,
custom HTTP wrapper, etc.) to the `ChQueryable` shape.

## Quickstart with `@clickhouse/client`

```ts
import { createClient } from '@clickhouse/client';
import { createChDataSource, type ChQueryRequest } from '@onegrid/clickhouse';

const ch = createClient({ url: process.env.CLICKHOUSE_URL });

const dataSource = createChDataSource({
  client: {
    async query({ sql, params, format }: ChQueryRequest) {
      if (format === 'JSONEachRow') {
        const rs = await ch.query({ query: sql, query_params: params, format });
        const json = await rs.json<Record<string, unknown>>();
        return { format, rows: json };
      }
      // Arrow IPC
      const rs = await ch.query({ query: sql, query_params: params, format: 'Arrow' });
      const buf = await rs.text(); // or .stream()  →  Uint8Array
      return { format: 'Arrow', bytes: new TextEncoder().encode(buf) };
    },
  },
  table: {
    table: 'default.events',
    columns: ['id', 'kind', 'amount'],
    primaryKey: 'id',
    columnTypes: { id: 'UInt64', kind: 'String', amount: 'Float64' },
  },
  schema: [
    { id: 'id', type: 'int64' },
    { id: 'kind', type: 'utf8' },
    { id: 'amount', type: 'float64' },
  ],
  format: 'JSONEachRow', // or 'Arrow' for high-throughput columnar
});
```

## Compiler differences vs `@onegrid/postgres`

| Concern | Postgres | ClickHouse |
|---|---|---|
| Identifier quoting | `"col"` | `` `col` `` |
| Placeholders | `$1`, `$2` (positional) | `{p0:Type}` (named, typed) |
| Case-insensitive `LIKE` | `LOWER()` wrap | `ILIKE` (native) |
| Sum on empty group | `0` after COALESCE | `0` natively (no COALESCE needed) |
| `NULLS FIRST/LAST` | native | native (since 22.x) |

The named-parameter shape is non-negotiable: ClickHouse's HTTP /
TCP protocol doesn't support positional placeholders. Type hints
flow from `ChTableDescriptor.columnTypes` when provided; without
them every placeholder gets `String` (most permissive — ClickHouse
coerces String literals to most other types) but explicit type
hints are strongly recommended for production.

## Arrow IPC ingestion

Set `format: 'Arrow'` to have the adapter request Arrow IPC bytes
from ClickHouse. The adapter returns
`BlockResponse<'arrow-ipc'>` whose `rows` field is the raw
`Uint8Array`; the consumer's `SsrmRowSource.decodeArrowIpc` (see
`@onegrid/ssrm`) materializes them.

```ts
import { tableFromIPC } from 'apache-arrow';
import { createSsrmRowSource } from '@onegrid/ssrm';

const rowSource = createSsrmRowSource(dataSource, {
  numRows: 1_000_000,
  blockSize: 1000, // bigger blocks justify the Arrow overhead
  decodeArrowIpc: (bytes) => {
    const table = tableFromIPC(bytes);
    return table.toArray().map((row) => row.toJSON());
  },
});
```

When the response format is Arrow, the adapter returns `null`
cursors. Keyset pagination over Arrow requires decoding the result
to derive the resume row, which the adapter delegates to the
consumer; doing it in-adapter would force `apache-arrow` into the
package's bundle. If you need cursors over Arrow, use the JSON
path for the first request to get the `nextCursor`, then switch to
Arrow for subsequent requests.

## CDC: not in this package

ClickHouse is append-mostly + ReplacingMergeTree for updates — it
doesn't fit the row-diff model the other adapters use. Real-world
CDC against ClickHouse means upstream Debezium → ClickHouse Kafka
engine tables, or materialized views consuming a CDC topic. The
`RowDiff` shape is still useful in those pipelines (the upstream
producer emits it), but the consumer is on the producer side, not
the ClickHouse side.

## License

MIT
