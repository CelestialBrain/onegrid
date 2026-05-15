# @onegrid/headless

Framework-agnostic Grid host. Lit `ReactiveController`-shaped
lifecycle (`hostConnected` / `hostUpdate` / `hostUpdated` /
`hostDisconnected` + `requestUpdate`) wraps `@onegrid/core`'s
`Grid` so any framework — Lit, Solid, Vue Composition API,
Svelte runes, vanilla JS — implements the same five-method
controller shape and lets oneGrid own bootstrapping, rAF
coalescing, SSR adoption, and the event channel.

## Lifecycle

```ts
import { HeadlessGrid } from '@onegrid/headless';

const grid = new HeadlessGrid({
  options: {
    host: document.querySelector('[data-og-root]')!,
    data: {
      rowSource,
      columns,
      rowHeight: 32,
    },
  },
});

grid.hostConnected();
// ...
grid.requestUpdate('sort');   // single rAF-coalesced redraw
// ...
grid.hostDisconnected();
```

`hostConnected` is idempotent — safe to call from React's
`useEffect` or Solid's `onMount` without guard logic.

## Imperative surface

```ts
grid.setSort([{ columnId: 'created_at', direction: 'desc' }]);
grid.setFilter({ type: 'comparison', columnId: 'amount', op: 'gt', value: 100 });
grid.setColumns(nextColumns);
grid.setRowSource(nextSource, 32);
grid.scrollToRow(10_000);
```

Every mutator schedules a single rAF-coalesced re-render. Calling
`setSort` + `setFilter` + `setColumns` in the same frame produces
one repaint, not three.

## Event subscription

```ts
const off = grid.subscribe('sortChange', (sort) => {
  console.log('sort changed', sort);
});
off(); // unsubscribe
```

Typed events: `mount`, `unmount`, `selectionChange`, `sortChange`,
`filterChange`, `columnsChange`, `scroll`, `frame`, `invalidate`.

## SSR / hydration

```ts
// Server-side
const grid = new HeadlessGrid({ options });
const html = grid.renderAccessibilityShadowHTML();
res.send(`<div data-og-root>${html}</div>`);

// Client-side
const grid = new HeadlessGrid({
  options,
  hydrateFrom: document.querySelector('[data-og-ssr="true"]')!,
});
grid.hostConnected();
```

The accessibility shadow is meaningful server-side (AT and search
engines see the structured grid); the canvas overlay layers on top
after hydration without unmounting the ARIA tree.

## Why this exists

Every framework adapter (`@onegrid/adapters/react`, `…/solid`,
`…/svelte`, `…/vue`, `…/angular`) used to re-implement mounting,
rAF coalescing, and the event channel. Now they delegate to
`HeadlessGrid` and own only the framework-specific surface (hooks,
signals, runes, etc.). That's the contract that lets oneGrid stay
multi-framework on one engine.

## License

MIT
