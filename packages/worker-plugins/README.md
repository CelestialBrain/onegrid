# @onegrid/worker-plugins

Second trust tier for user-supplied formula functions and aggregators.
The plugin module loads in a dedicated Worker; the host invokes named
handlers via `postMessage`. Arrow vectors travel zero-copy via
`Transferable` when the host detects ArrayBuffer-backed inputs.
1 KB gz host-side, 0.5 KB gz worker-side.

Iframe sandboxing is intentionally **not** offered — too much overhead
for hot-path formula evaluation. The Worker is the trust boundary.

## Why this exists

Plugins registered via `@onegrid/plugin-kit` run on the main thread.
That's fine for cell renderers, themes, i18n catalogs — but a
user-supplied `aggregator.step()` that loops over 1M rows OR throws
crashes the grid. Worker-boundary plugins isolate that compute:

- Errors are caught and surfaced as `{ ok: false, error }` without
  taking out the main thread.
- Long-running handlers can time out (default 30 s) without blocking
  rendering.
- ArrayBuffer-backed inputs (Arrow vectors, typed arrays) transfer
  ownership zero-copy.

## Quickstart

**Host side** — wherever the grid is mounted:

```ts
import { WorkerPluginHost } from '@onegrid/worker-plugins';

const worker = new Worker(new URL('./my-plugin-worker.ts', import.meta.url), {
  type: 'module',
});
const host = new WorkerPluginHost({ worker });

await host.ready; // resolves with the list of registered handler names

const sum = await host.invoke<number>('sumColumn', [vec], [vec.buffer]);
```

**Worker side** — `my-plugin-worker.ts`:

```ts
import { definePluginWorker } from '@onegrid/worker-plugins/worker';

definePluginWorker({
  handlers: {
    async sumColumn(vec: Float64Array): Promise<number> {
      let acc = 0;
      for (let i = 0; i < vec.length; i++) acc += vec[i];
      return acc;
    },
  },
});
```

## Transferable shortcut

For non-hot-path code, let the host pick out the buffers:

```ts
import { collectTransferables } from '@onegrid/worker-plugins';

const args = [columnVector, anotherVector];
const transferables = collectTransferables(args);
await host.invoke('aggregate', args, transferables);
```

This walks the args looking for `.buffer instanceof ArrayBuffer`
(typed arrays, Arrow vectors) and gathers them for the third
`postMessage` parameter.

## Error / timeout shape

- Handler throws → main-thread `Error` rejection with the
  worker-side `name` / `message` / `stack` preserved.
- Unknown handler → `Error('unknown handler '<name>'')`.
- Per-call timeout exceeded → `Error('[OG_WORKER_TIMEOUT] '<fn>'
  exceeded <N>ms')`.
- `host.dispose()` → pending calls reject with `[OG_WORKER_DISPOSED]`.

## License

MIT
