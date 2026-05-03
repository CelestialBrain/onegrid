# TanStack Table v8

**Source**: https://tanstack.com/table/latest, https://tanstack.com/table/v8/docs
**Repo**: https://github.com/TanStack/table
**License**: MIT
**Pricing**: Free. (Tanner Linsley accepts sponsorships; the library itself has no paid tier.)
**Latest version**: `@tanstack/react-table` 8.21.x line; latest cross-adapter publish `@tanstack/angular-table` 8.21.4 (2026-04-03 per GitHub releases).
**Stars**: ~27.9k
**Maintenance**: Active. Tanner Linsley + community contributors. v9 in alpha development as of 2026.

## Architecture
- **Headless**. The library is logic + state only — no DOM, no markup, no styles, no virtualization, no editing UI.
- Core package `@tanstack/table-core` is framework-agnostic (~14 KB min+gzip).
- Each framework adapter is a thin reactive wrapper around `createTable()` that hooks state into the framework's reactivity (React `useState`/`useReducer`, Vue `ref`, Solid signals, Svelte stores, Angular signals, Lit `ReactiveController`, Qwik signals).
- State model: a single `state` object (sorting, filtering, pagination, grouping, expanded, columnVisibility, columnOrder, columnSizing, columnPinning, rowSelection, columnFilters, globalFilter). Either fully controlled (you pass `state` + `onXChange`) or fully uncontrolled (table manages internally) or hybrid.
- Row models: pluggable functions you opt-in to. `getCoreRowModel()` is required; the rest are tree-shakeable opt-ins.
- Column definitions are accessor-based: `accessorKey`, `accessorFn`, or `display` (no value).
- TypeScript-first. Generic over your row data type; column meta is type-safe via module augmentation.

## Framework support
| Framework | Adapter | Notes |
|---|---|---|
| React | `@tanstack/react-table` | React 16.8+; hooks-only |
| Vue 3 | `@tanstack/vue-table` | Vue 3 Composition API |
| Solid | `@tanstack/solid-table` | Solid 1.x |
| Svelte | `@tanstack/svelte-table` | Svelte 3/4; Svelte 5 in newer versions |
| Angular | `@tanstack/angular-table` | Signals-based, Angular 17+ |
| Qwik | `@tanstack/qwik-table` | Qwik 1.x |
| Lit | `@tanstack/lit-table` | Lit 2.x+ |
| Vanilla | `@tanstack/table-core` directly | Manual reactivity wiring |

## Features

### Sorting
- `getSortedRowModel()` opt-in.
- Built-in sorting fns: `alphanumeric`, `alphanumericCaseSensitive`, `text`, `textCaseSensitive`, `datetime`, `basic`.
- Custom `sortingFn: (rowA, rowB, columnId) => -1 | 0 | 1`.
- Multi-sort with `enableMultiSort`, `maxMultiSortColCount`, `isMultiSortEvent`.
- Server-side via `manualSorting: true` — you sort the data, table just tracks state.
- State: `SortingState = { id: string; desc: boolean }[]`.
- Per-column `enableSorting`, `sortDescFirst`, `sortUndefined: 'first' | 'last' | -1 | 1 | false`.

### Filtering
- `getFilteredRowModel()` opt-in.
- Column filters and global filter (`globalFilter` state).
- Built-in fns: `includesString`, `includesStringSensitive`, `equalsString`, `arrIncludes`, `arrIncludesAll`, `arrIncludesSome`, `equals`, `weakEquals`, `inNumberRange`.
- Fuzzy filter recipe via `match-sorter` (community pattern, not built-in).
- `manualFiltering: true` for server-side.
- Faceted filtering via `getFacetedRowModel`, `getFacetedUniqueValues`, `getFacetedMinMaxValues` for filter UI value lists.

### Grouping
- `getGroupedRowModel()` opt-in.
- `groupingState: string[]` (column IDs to group by).
- Aggregation fns: `sum`, `min`, `max`, `extent`, `mean`, `median`, `unique`, `uniqueCount`, `count`.
- Custom `aggregationFn`.
- Grouped rows expose `subRows` and `getLeafRows`.

### Pivoting
- **Not built-in.** Can be approximated via grouping + custom column generation; no first-class API.

### Aggregations
- See Grouping above. Per-column `aggregationFn` + `aggregatedCell` cell renderer.

### Editing
- **Not built-in.** Headless: you build your own input + commit handlers. Pattern: store edits in component state and call `onChange` to update underlying data.
- No validation framework, no editor types, no edit-mode tracking.

### Selection
- `rowSelection: Record<string, boolean>` state, indexed by row id.
- `getRowId` to derive stable IDs.
- `enableRowSelection` (boolean or per-row predicate), `enableMultiRowSelection`, `enableSubRowSelection`.
- `getIsSelected`, `getIsSomeSelected`, `getToggleSelectedHandler`, `getToggleAllRowsSelectedHandler`.
- **No cell selection or range selection** — row-only.

### Clipboard / copy-paste
- **Not built-in.** Pure DOM, your responsibility.

### Virtualization
- **Not built-in.** Documented recommendation: use [@tanstack/virtual](https://tanstack.com/virtual) (also from Tanner) or `react-window`.
- `getCoreRowModel()` returns the full row array; you slice the visible window yourself.
- v8 docs include "virtualized rows" + "virtualized columns" + "virtualized infinite scrolling" recipes.

### Accessibility
- **Not built-in.** Headless = no DOM = no ARIA. You wire the WAI-ARIA grid pattern yourself.
- Docs offer no first-party accessibility recipe.

### Server-side row model
- No SSRM in the AG Grid sense.
- Pattern: `manualSorting`, `manualFiltering`, `manualPagination`, `manualGrouping` flags. Table tracks state but doesn't transform data; you fetch the right slice.
- `pageCount` set manually; `rowCount` for total.

### Streaming / live updates
- `data` is just a prop. Pass a new array, table re-derives row models. Memoize aggressively (`useMemo`) or perf collapses.
- No transaction API; no patch protocol.

### Formulas / computed cells
- **Not built-in.** Use `accessorFn` for derived values. No formula engine, no dependency graph.

### Theming / customization / custom cell renderers
- 100% your responsibility.
- `header`, `cell`, `footer`, `aggregatedCell`, `placeholderCell` accept renderer functions returning whatever your framework renders.
- `flexRender(component, props)` helper to call any framework component or string.

### Export
- **Not built-in.** No CSV, no Excel, no PDF.

### Master / detail rows
- **Not built-in** in the AG Grid sense.
- Approximated via expanding (`getExpandedRowModel`) + your own detail renderer.

### Tree data
- `getSubRows: row => row.children` plus `getExpandedRowModel`.
- Works for hierarchical client-side data; you handle lazy loading yourself.

### Charts integration
- Out of scope.

### Internationalization
- Out of scope. The library has no user-visible strings (no UI).
- RTL is a CSS concern.

### Mobile / touch
- Out of scope. Whatever you render.

### Other notable features
- **Column ordering** (`columnOrder` state), **column pinning** (`columnPinning: { left: [], right: [] }`), **column visibility** (`columnVisibility` map), **column sizing** (`columnSizing` + `columnSizingInfo`).
- **Pagination** — `getPaginationRowModel()`. Page index, page size, total count.
- **Row pinning** — `rowPinning` state.
- **Faceted models** for building filter chip / range UIs.
- **Row drag-and-drop** — recipe only; not built-in.
- **Custom features** (`_features` option, v8.14+) — register your own state slice + reducers.
- **Debug mode** — `debugAll`, `debugTable`, `debugHeaders`, `debugColumns`, `debugRows`.

## API style
- Declarative configuration object passed to `useReactTable({ data, columns, state, ... })`.
- Returns a `Table` instance with imperative methods (`getRowModel`, `setSorting`, `getHeaderGroups`).
- Headless. You ship every visual decision.
- TypeScript: best-in-class generics. Module augmentation for `ColumnMeta`, `FilterMeta`, `SortingFns`, etc.

## Bundle size
- `@tanstack/table-core`: ~14 KB min+gzip.
- `@tanstack/react-table`: core + ~2 KB adapter.
- Each `getXRowModel` is independently tree-shakeable; if you don't import `getGroupedRowModel`, it's not in your bundle.
- Smallest meaningful table: ~16 KB. Full-feature: ~30-40 KB.

## Performance claims
- No published benchmark numbers from the maintainers.
- Community reports: fast for 100–1,000 rows; 10k+ requires virtualization or it stalls (filtering/sorting recompute the full row model on each state change unless memoized).
- Re-render cost is the dominant factor; `getRowModel()` memoizes if `data` reference is stable.

## Recurring weaknesses
1. **No built-in virtualization** — every serious app pairs with TanStack Virtual or react-window. Required pattern, not optional.
2. **Steep learning curve and "overcomplicated" API** — see discussion [#2147](https://github.com/TanStack/table/discussions/2147). Headless flexibility = many concepts (column defs, accessors, row models, state shape, flexRender) before you render a row.
3. **Docs criticized** for showing features in isolation. Combining sort + filter + pagination + global filter is a community-discovered pattern, not a tutorial.
4. **No editing, no copy/paste, no accessibility, no export, no formulas** — you build everything outside of state mgmt.
5. **Performance ceiling without virtualization**. Tables with 10k+ rows degrade noticeably without windowing.

## Typical pairing
- TanStack Table + TanStack Virtual + Tailwind + (optional) shadcn/ui = the canonical 2026 stack.
- Pairs with TanStack Query for server data fetching and `manualPagination`/`manualSorting`.

## Source URLs read
- https://tanstack.com/table/latest
- https://tanstack.com/table/v8/docs/introduction
- https://tanstack.com/table/v8/docs/guide/virtualization
- https://tanstack.com/table/v8/docs/api/features/sorting
- https://github.com/TanStack/table
- https://github.com/TanStack/table/discussions/2147
- https://www.pkgpulse.com/blog/tanstack-table-vs-ag-grid-vs-react-data-grid-2026
