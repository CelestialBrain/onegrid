# @onegrid/introspect

Schema introspection helpers — turn a protocol `Schema`, a SQL data-
type list, or an ORM model into renderable `ColumnDef[]`. Composes
on top of the database adapters; doesn't ship its own database
client.

## Why this exists

Every database adapter in oneGrid (`@onegrid/postgres`, `mysql`,
`sqlite`, `clickhouse`, `mongo`) takes a `schema: Schema` so the
adapter knows what columns exist. Hand-writing that schema is fine
for small tables — for tables with 50+ columns or schemas that
evolve, the introspection helpers in this package read the schema
from the database itself and produce a `ColumnDef[]` the renderer
can use immediately.

## Quickstart

### From `information_schema.columns` (Postgres / MySQL)

```ts
import { schemaFromSqlRows, columnsFromSchema } from '@onegrid/introspect';
import { createPgDataSource } from '@onegrid/postgres';

const { rows } = await pool.query(
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orders'`,
);
const schema = schemaFromSqlRows(rows);
const columns = columnsFromSchema(schema);

const dataSource = createPgDataSource({
  client: pool,
  table: { table: 'public.orders', columns: schema.map(c => c.id), primaryKey: 'id' },
  schema,
});

// `columns` is the renderer-side `ColumnDef[]`.
```

### From `PRAGMA table_info` (SQLite)

```ts
import { schemaFromSqliteRows, columnsFromSchema } from '@onegrid/introspect';

const rows = db.prepare('PRAGMA table_info(orders)').all();
const schema = schemaFromSqliteRows(rows);
const columns = columnsFromSchema(schema);
```

### Direct from a hand-written Schema

```ts
import { columnsFromSchema } from '@onegrid/introspect';
import type { Schema } from '@onegrid/protocol';

const schema: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'email', type: 'utf8' },
  { id: 'is_active', type: 'bool' },
];
const columns = columnsFromSchema(schema);
```

## Heuristics

`columnsFromSchema` makes per-column decisions:

- **Width.** id-shaped columns (`id`, `_id`, `*_id`) → 80; numeric →
  120; date/time → 160; utf8/json → 200; binary → 140; bool → 80.
- **displayName.** `snake_case` → "Snake Case"; `camelCase` →
  "Camel Case". Override via `displayNames`.
- **Formatter.** Booleans → "true" / "false"; timestamps → ISO
  truncated to seconds with space separator; binary → byte count
  marker; everything else falls through to the renderer's default.

All heuristics accept per-column overrides:

```ts
columnsFromSchema(schema, {
  defaultWidth: 140,
  widths: { email: 320 },
  displayNames: { email: 'Email Address' },
  formatters: {
    is_active: (v) => (v === true ? '✓' : '✗'),
  },
  skip: ['internal_audit_id'],
});
```

## SQL data-type mapping

`columnTypeFromSql(name)` maps the data-type names returned by
`information_schema.columns` and `PRAGMA table_info` to the
protocol's `ColumnType` enum. Recognized:

- Postgres: `bigint`, `integer`, `smallint`, `numeric(p,s)`,
  `double precision`, `real`, `text`, `character varying`,
  `boolean`, `timestamp with/without time zone`, `date`, `jsonb`,
  `json`, `uuid`, `bytea`
- MySQL: `TINYINT`, `INT(11)`, `BIGINT`, `VARCHAR(n)`, `DATETIME`,
  `BLOB`, `ENUM(...)`
- SQLite affinity: `INTEGER`, `REAL`, `TEXT`, `BLOB`

Unknown / unrecognized types fall back to `'unknown'`. v0.0.9 will
add ClickHouse + Mongo BSON-type mapping.

## What's NOT here (yet)

- **ORM-specific introspection** (Drizzle / Kysely / Prisma).
  Drizzle has runtime metadata via `getTableColumns(table)`;
  Prisma exposes the DMMF; Kysely is type-level only and needs a
  database query. v0.0.9 will add `columnsFromDrizzleTable`,
  `columnsFromPrismaModel`, etc. behind optional sub-paths so the
  base package stays dep-free.
- **Foreign-key inference.** The introspector emits flat
  `ColumnDef[]`; FK relationships and joined columns are out of
  scope.

## License

MIT
