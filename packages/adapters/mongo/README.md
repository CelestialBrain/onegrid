# @onegrid/mongo

MongoDB adapter for oneGrid's SSRM. Translates `BlockRequest` into
`find()` / aggregation-pipeline calls; ships a change-streams-backed
CDC adapter conforming to the universal row-diff stream shape from
`@onegrid/ssrm`.

No peer dependency — adapt the official `mongodb` driver, mongoose's
underlying collection, or any client implementing the small
`MongoCollection` / `MongoCollectionForCdc` interfaces.

## Quickstart

```ts
import { MongoClient } from 'mongodb';
import { createMongoDataSource, createMongoCdcAdapter } from '@onegrid/mongo';
import { createSsrmRowSource, createRowDiffStream } from '@onegrid/ssrm';

const client = await new MongoClient(process.env.MONGO_URL!).connect();
const collection = client.db('myapp').collection('orders');

const dataSource = createMongoDataSource({
  collection,
  descriptor: {
    collection: 'orders',
    fields: ['_id', 'status', 'amount', 'customer'],
    primaryKey: '_id',
  },
  schema: [
    { id: '_id', type: 'utf8' },
    { id: 'status', type: 'utf8' },
    { id: 'amount', type: 'float64' },
    { id: 'customer', type: 'utf8' },
  ],
});

const rowSource = createSsrmRowSource(dataSource, {
  numRows: 1_000_000,
  blockSize: 200,
});

// CDC via change streams (replica-set required by Mongo).
const cdc = createMongoCdcAdapter({ collection });
const stream = createRowDiffStream(cdc, {
  onDiff: (diff) => { /* apply locally */ },
});
```

## Compiler differences vs the SQL adapters

Mongo's idiom is the most different — every query is a JS object,
not a SQL string. The compiler emits two shapes depending on the
request:

- `find()` for flat queries: `{ filter, sort, projection, limit }`
- `aggregate()` for grouped queries: `[{ $match }, { $group }, { $project }, { $sort }]`

Specific translations:

| Concern | SQL adapters | Mongo adapter |
|---|---|---|
| Identifier whitelisting | column matched against descriptor.columns | field matched against descriptor.fields |
| Comparison filters | `WHERE col = $1` | `{ col: { $eq: value } }` |
| `IN` / `NOT IN` | `IN (...)` | `{ $in: [...] }` / `{ $nin: [...] }` |
| `LIKE` | LIKE pattern with escapes | `{ $regex: ..., $options: 'i' for CI }` |
| Logical ops | `AND` / `OR` / `NOT` | `$and` / `$or` / `$nor` |
| `BETWEEN` | `BETWEEN lo AND hi` | `{ $gte: lo, $lte: hi }` |
| Sort | `ORDER BY` | sort object with `1` / `-1` |
| Aggregation pushdown | `GROUP BY` + agg fns | `$group` stage with `$sum` / `$avg` / `$addToSet` |

Keyset pagination expands to a chained `$or` mirroring SQL row-tuple
comparison: for sort `[a ASC, b ASC]` and cursor `(vA, vB, vId)`,
the filter becomes
```
{
  $or: [
    { a: { $gt: vA } },
    { a: { $eq: vA }, b: { $gt: vB } },
    { a: { $eq: vA }, b: { $eq: vB }, _id: { $gt: vId } },
  ],
}
```
Mongo's index can scan this efficiently when there's a compound
index on `(a, b, _id)` — same constraint as the SQL adapters.

## Change streams

`createMongoCdcAdapter` opens `collection.watch()` and translates
each change document into a `RowDiff`. `documentKey._id` becomes
`pkey` (coerced to string via `.toString()` for `ObjectId`-like
values), `fullDocument` becomes `fields` for inserts and replaces,
`updateDescription.updatedFields` becomes `fields` for updates.

Resume tokens are tracked in `adapter.lastResumeToken()`; persist
this externally if you want a streamable session across process
restarts. Pass it back via `MongoCdcAdapterOptions.startAfter`.

`resync` is more nuanced than the SQL adapters: Mongo doesn't
expose a built-in "replay since version N" the way an outbox does.
The adapter accepts an optional `resyncQuery` function — a typical
implementation reads from an application-side outbox the same way
the SQL adapters do, OR from a tail of the oplog when you have the
`local.oplog.rs` permission. When omitted, every resync request
returns `snapshot: true` and the consumer wipes its cache.

Replica set required: change streams need `replSet` mode (Mongo
3.6+). Standalone Mongo doesn't support them.

## License

MIT
