# @onegrid/data-worker

Web Worker offload for `@onegrid/data`'s sort / filter / group / pivot
operations. Keeps 1M-row work off the render thread so the grid stays at
60 FPS while compute runs.

## Why

A 1M-row in-memory sort takes ~700 ms on a typical laptop (real-Chromium
bench). That's 42 frames of jank on the render thread. This package
moves the work to a Worker so the grid keeps painting while the sort
completes, then swaps in the result.

## Quickstart

```ts
// my-data-worker.ts — bundled as a Worker by your build tool
export {} from '@onegrid/data-worker/worker';
```

```ts
// app.ts
import { createDataWorker } from '@onegrid/data-worker';

const worker = new Worker(new URL('./my-data-worker.ts', import.meta.url), {
  type: 'module',
});
const data = createDataWorker({ worker });
await data.ready;

const sortedIndices = await data.sort(columnTable, [
  { columnId: 'price', direction: 'desc' },
]);
```

## API

- `data.sort(table, sortModel, options?)` → `Int32Array`
- `data.filter(table, filterModel, options?)` → BitmapSelection
- `data.group(table, groupingModel, options?)` → `GroupNode`
- `data.pivot(table, pivotModel)` → `PivotedTable`
- `data.dispose()` — terminate the worker, rejecting pending calls

## Bundler plumbing

We don't ship a pre-bundled `worker.js` because every build tool inlines
workers differently:

- **Vite**: `new Worker(new URL('./my-worker.ts', import.meta.url), { type: 'module' })`
- **webpack**: `worker-loader` or `new Worker(new URL(...), { type: 'module' })`
- **esbuild**: `--bundle` with a separate entry point

Re-exporting from `@onegrid/data-worker/worker` is enough — your bundler
inlines `@onegrid/data` into the worker bundle.

## License

MIT
