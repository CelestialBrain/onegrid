# @onegrid/sqlite

SQLite adapter for oneGrid's SSRM. Translates `BlockRequest` into
parameterized SQL via a pure compiler. Targets every popular SQLite
driver through one queryable interface.

No peer dependency — the consumer adapts whichever driver they're
using to the `SqliteQueryable` shape.

## Supported drivers

| Driver | Sync / async | How to adapt |
|---|---|---|
| `better-sqlite3` | sync | wrap `db.prepare(sql).all(params)` (already returns rows) |
| `node:sqlite` (Node 22+) | sync | wrap `db.prepare(sql).all(...params)` |
| `bun:sqlite` | sync | wrap `db.query(sql).all(...params)` |
| Cloudflare D1 | async | use `db.prepare(sql).bind(...params).all()` then take `.results` |
| `libsql` / Turso | async | use `client.execute({ sql, args: params })` then take `.rows` |

Sync-driver wrapping example (better-sqlite3):

```ts
import Database from 'better-sqlite3';
import { createSqliteDataSource } from '@onegrid/sqlite';

const db = new Database('app.db');
const dataSource = createSqliteDataSource({
  client: {
    query(sql, params) {
      return db.prepare(sql).all(...(params ?? []));
    },
  },
  table: { table: 'orders', columns: ['id', 'status', 'amount'], primaryKey: 'id' },
  schema: [
    { id: 'id', type: 'int64' },
    { id: 'status', type: 'utf8' },
    { id: 'amount', type: 'float64' },
  ],
});
```

D1 wrapping example:

```ts
import { createSqliteDataSource } from '@onegrid/sqlite';

export default {
  async fetch(req: Request, env: { DB: D1Database }) {
    const dataSource = createSqliteDataSource({
      client: {
        async query(sql, params) {
          const stmt = env.DB.prepare(sql).bind(...(params ?? []));
          const result = await stmt.all<Record<string, unknown>>();
          return result.results ?? [];
        },
      },
      table: { /* ... */ },
      schema: [ /* ... */ ],
    });
    // ...use dataSource to handle the request
  },
};
```

## Compiler differences vs `@onegrid/postgres`

| Concern | Postgres | SQLite |
|---|---|---|
| Identifier quoting | `"col"` | `"col"` (same) |
| Placeholders | `$1`, `$2`, … | `?` |
| `NULLS FIRST/LAST` | native | native (same) |
| Aggregate type pinning | `::int` / `::float` | none (SQLite has dynamic typing) |
| `LIKE` escape clause | implicit | explicit `ESCAPE '\'` |
| Case sensitivity | case-sensitive default | case-insensitive default for ASCII |

The compiler emits `LOWER()`-wrapped predicates when the consumer
asks for a case-insensitive comparison, and `ESCAPE '\'` on every
LIKE clause so the LIKE-special character escaping works as
expected.

`bigint` primary keys are coerced to `Number` when building keyset
cursors — better-sqlite3 returns INTEGER columns as bigint when
`safeIntegers(true)` is enabled, and the cursor codec only accepts
string or number rowIds.

## CDC: not in this package

SQLite has no LISTEN/NOTIFY-style pubsub. Production consumers wire
a polling-based outbox the same way `@onegrid/mysql` does — see that
package's README for the trigger DDL pattern. SQLite-backed grids
are typically single-writer (embedded apps, edge workers), so CDC
is rarely needed.

If you need CDC over SQLite, the standard pattern is:

```sql
CREATE TABLE onegrid_outbox (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  kind    TEXT NOT NULL CHECK (kind IN ('insert', 'update', 'delete')),
  pkey    TEXT NOT NULL,
  fields  TEXT,                                  -- json_encode'd
  emitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER orders_diff_ins AFTER INSERT ON orders BEGIN
  INSERT INTO onegrid_outbox (kind, pkey, fields)
  VALUES ('insert', NEW.id, json_object('id', NEW.id, 'status', NEW.status));
END;
-- ...similar for UPDATE / DELETE
```

Pair with a generic polling loop that calls
`SELECT version, kind, pkey, fields FROM onegrid_outbox WHERE version > ?
 ORDER BY version LIMIT ?` and forwards rows to a `RowDiffStream`.

## License

MIT
