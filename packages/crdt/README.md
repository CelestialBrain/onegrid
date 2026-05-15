# @onegrid/crdt

Collaborative real-time editing for oneGrid. Pluggable backends —
Yjs (YATA lineage) and Automerge — translating CRDT document changes
into the same `RowDiff` stream the CDC adapters emit, so collaborative
edits compose with optimistic mutations, time-travel, and DBSP without
extra translation.

We don't import Yjs or Automerge directly. Adopters pass structural
ports — `YMapLike` for Yjs, `AutomergeDocLike` + `AutomergeWatcherLike`
for Automerge — so this package stays dep-free and version-agnostic.

## Yjs

```ts
import * as Y from 'yjs';
import { bindYjsRows, applyLocalToYjs } from '@onegrid/crdt';

const doc = new Y.Doc();
const map = doc.getMap('rows');

const handle = bindYjsRows({
  map,
  onDiff: (diff) => grid.applyDiff(diff),
});

// Local edit — propagates via Yjs sync just like a remote change
applyLocalToYjs(map, {
  kind: 'update',
  pkey: 'row-42',
  fields: { status: 'paid' },
});

// later
handle.close();
```

## Automerge

```ts
import * as A from '@automerge/automerge';
import { bindAutomergeRows } from '@onegrid/crdt';

let doc = A.from({ rows: {} as Record<string, MyRow> });
const subscribers = new Set<() => void>();

bindAutomergeRows({
  doc: { getRows: () => doc.rows },
  watcher: {
    subscribe: (h) => {
      subscribers.add(h);
      return () => subscribers.delete(h);
    },
  },
  onDiff: (diff) => grid.applyDiff(diff),
});

// After every local or remote change, call all subscribers:
doc = A.change(doc, (d) => {
  d.rows['row-42'] = { ...d.rows['row-42'], status: 'paid' };
});
subscribers.forEach((s) => s());
```

The Automerge bridge does a shallow snapshot diff between calls.
For workspaces with thousands of rows you'll want a smarter diffing
strategy (heads-based delta walk); the structural port lets you
swap implementations without touching the grid.

## License

MIT
