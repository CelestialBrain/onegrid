# @onegrid/mysql

MySQL adapter for oneGrid's SSRM. Translates `BlockRequest` into
parameterized SQL via a pure compiler; ships a polling-based CDC
adapter that conforms to the universal row-diff stream shape from
`@onegrid/ssrm`.

Requires `mysql2` ^3.6.0 as a peer dependency.

## Quickstart

```ts
import mysql from 'mysql2/promise';
import { createMyDataSource } from '@onegrid/mysql';
import { createSsrmRowSource } from '@onegrid/ssrm';

const pool = mysql.createPool(process.env.DATABASE_URL);

const dataSource = createMyDataSource({
  client: pool,
  table: {
    table: 'myapp.orders',
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

## Compiler differences vs `@onegrid/postgres`

The two adapters mirror each other intentionally — anywhere they
diverge, the divergence is a contained MySQL idiom rather than a
protocol leak. As of v0.0.8 the divergences are:

| Concern | Postgres | MySQL |
|---|---|---|
| Identifier quoting | `"col"` | `` `col` `` |
| Placeholders | `$1`, `$2`, … | `?` |
| `NULLS FIRST/LAST` | native syntax | emulated via leading `col IS NULL` ordering |
| Case-sensitive comparison | default | requires `BINARY` wrap (collations dictate the default) |
| Aggregate type pinning | `::int` / `::float` | `CAST(... AS SIGNED)` / `CAST(... AS DOUBLE)` |
| Row-tuple comparison | `(a,b) > (1,2)` | `(a,b) > (1,2)` (same since 5.7) |

Mixed-direction keyset is treated as "all DESC if any DESC"
(matches the Postgres compiler); per-column direction support is a
v0.0.9 follow-up.

## Polling-based CDC

MySQL has no LISTEN/NOTIFY equivalent. The adapter polls an outbox
table every `pollIntervalMs` (default 500ms) for rows whose
`version` exceeds the last seen value, and forwards new rows as
`RowDiff` events through the universal stream shape.

```ts
import { createMyCdcAdapter } from '@onegrid/mysql';
import { createRowDiffStream } from '@onegrid/ssrm';

const cdc = createMyCdcAdapter({
  client: pool,
  pollIntervalMs: 250,
});

const stream = createRowDiffStream(cdc, {
  onDiff: (diff) => { /* apply locally */ },
});
```

### Required server-side schema

Same outbox-with-trigger pattern as the Postgres adapter — the
trigger lives in your migrations, not in this package. Recommended
DDL:

```sql
CREATE TABLE onegrid_outbox (
  version  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind     VARCHAR(8) NOT NULL,
  pkey     VARCHAR(255) NOT NULL,
  fields   JSON,
  emitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (kind IN ('insert', 'update', 'delete')),
  INDEX (version)
) ENGINE = InnoDB;

DELIMITER //
CREATE TRIGGER orders_row_diff_ins AFTER INSERT ON orders FOR EACH ROW
BEGIN
  INSERT INTO onegrid_outbox (kind, pkey, fields)
  VALUES ('insert', NEW.id, JSON_OBJECT(
    'id', NEW.id, 'status', NEW.status, 'amount', NEW.amount
  ));
END //

CREATE TRIGGER orders_row_diff_upd AFTER UPDATE ON orders FOR EACH ROW
BEGIN
  INSERT INTO onegrid_outbox (kind, pkey, fields)
  VALUES ('update', NEW.id, JSON_OBJECT(
    'id', NEW.id, 'status', NEW.status, 'amount', NEW.amount
  ));
END //

CREATE TRIGGER orders_row_diff_del AFTER DELETE ON orders FOR EACH ROW
BEGIN
  INSERT INTO onegrid_outbox (kind, pkey, fields)
  VALUES ('delete', OLD.id, NULL);
END //
DELIMITER ;
```

When end-to-end latency matters more than operational simplicity,
plug in a binlog-based CDC source (Debezium / Canal / Maxwell)
that emits the same RowDiff shape — the adapter contract is
identical, only the producer changes.

## License

MIT
