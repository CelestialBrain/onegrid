# @onegrid/plugin-kit

oneGrid's plugin/extension framework. Facets combine many inputs into
one output. Compartments swap a sub-extension at runtime without
rebuilding the tree. Registries provide id-keyed lookup for things
like per-column cellRenderers, themes, i18n catalogs, aggregators.

The shape is the same one CodeMirror 6 uses for editor extensions —
the design has held up across a large open-source codebase and is
where the inspiration comes from (see Marijn Haverbeke's "CodeMirror
6 system guide" essay on his personal site for the reasoning).

## Why this exists

v0.0.6–0.0.8 hard-coded a fixed set of cell renderers, themes,
formula functions, and aggregators into the core. That doesn't
scale — adopters need to add their own without forking. This package
defines the contract every other v0.0.9 milestone item registers
into: `@onegrid/tokens` registers themes, `@onegrid/intl` registers
locale catalogs, future packages register aggregators and filter
operators.

## Concepts

### Extension

Opaque value returned by `facet.of(value)`, `compartment.of(ext)`, or
a `PluginRegistry.register(id, value)`. The grid never inspects an
Extension structurally — it resolves it through a `PluginState`.

### Facet

A typed combination point. Many plugins register inputs; the facet's
`combine` step reduces them to one output.

```ts
import { Facet, PluginState } from '@onegrid/plugin-kit';

const tabSize = Facet.define<number, number>({
  combine: (xs) => xs[0] ?? 4, // first wins
});

const state = PluginState.create({ extensions: [tabSize.of(2)] });
state.facet(tabSize); // → 2
```

### Compartment

Hot-reconfigurable extension slot. Wrap a sub-extension to swap it
later without rebuilding the rest of the state.

```ts
import { Compartment } from '@onegrid/plugin-kit';

const theme = new Compartment();
const state = PluginState.create({
  extensions: [theme.of(darkTheme), unrelatedFeature()],
});

const next = state.reconfigure({
  replace: new Map([[theme, lightTheme]]),
});
```

### Precedence

Five tiers — `highest`, `high`, `default`, `low`, `lowest`. Higher
precedence resolves first. Within a tier, registration order wins.

```ts
import { precedence } from '@onegrid/plugin-kit';

precedence.highest(someExt); // wins ties
```

### PluginRegistry

Keyed registry for id-based lookup. First registration wins on id
collision; combine that with precedence to give users override
power.

```ts
import { cellRendererRegistry } from '@onegrid/plugin-kit';

const ext = cellRendererRegistry.register('money', {
  render: ({ value }) => `$${String(value)}`,
});
```

## Ten domain registries

`@onegrid/plugin-kit` exports ten typed registries — one per
extension surface in the grid:

| Registry | Used by |
|---|---|
| `cellRendererRegistry` | per-column custom cell render |
| `cellEditorRegistry` | per-column editor (date picker, multi-select, etc.) |
| `exporterRegistry` | CSV / Excel / PDF / custom export formats |
| `dataSourceRegistry` | row source kinds beyond the built-in adapters |
| `themeRegistry` | DTCG token bundles |
| `formulaFunctionRegistry` | user-supplied formula functions |
| `aggregatorRegistry` | custom group-by aggregations |
| `filterOperatorRegistry` | custom filter operators (e.g. `containsAccentInsensitive`) |
| `columnToolRegistry` | per-column menu items |
| `i18nCatalogRegistry` | translation message bundles |

## Interface versioning

The plugin contract has a single integer version. Plugins declare
the version they were authored against; loading a plugin from a
mismatched version throws at registration time with code
`OG_PLUGIN_INTERFACE_VERSION`.

```ts
import { definePlugin, INTERFACE_VERSION, themeRegistry } from '@onegrid/plugin-kit';

export default definePlugin({
  name: 'my-dark-theme',
  interfaceVersion: INTERFACE_VERSION,
  extensions: [themeRegistry.register('dark', { tokens: { /* ... */ } })],
});
```

## PluginContext

The narrow surface plugins receive — no DOM, no canvas, no raw grid
internals. Just `facet`, `resolve`, and the negotiated
`interfaceVersion`. Keeps plugins portable across the worker
boundary (v0.0.9 item 8).

## License

MIT
