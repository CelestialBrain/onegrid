# API surface — stability policy

Status: **draft, v1.0.0-rc.** This document defines what counts as the
public oneGrid API. Anything not listed here is internal and may move
in any release.

## Stability tiers

Every export carries one of four JSDoc tags:

| Tag             | Stability                                                                       |
| --------------- | ------------------------------------------------------------------------------- |
| `@public`       | Subject to semver. Breaking changes require a major version bump.               |
| `@beta`         | Public but unstable. Breaking changes allowed in minor versions; documented.    |
| `@internal`     | Not part of the public API. May move or disappear in any release.               |
| `@deprecated`   | Public but scheduled for removal. Will throw with `[OG_DEPRECATED_*]` warning.  |

When a tag is missing, the default is `@internal` for source files
and `@beta` for exports listed in a package's `package.json` `exports`
field. Once v1.0.0 ships, every export reachable through `exports` MUST
carry an explicit `@public` or `@beta` tag.

## Public surface (v1.0.0-rc — load-bearing entry points)

These are the imports adopter code actually writes. Anything else is
either reached through these or is `@internal`.

### `@onegrid/core`

```ts
@public
- class Grid + GridOptions / NestedGridOptions
- function createGrid(options) → Grid
- function defineGridOptions(input) → GridOptions  // accepts both shapes
- editingPreset / mobilePreset / enterprisePreset / accessibilityPreset
- type ColumnDef, ColumnGroupDef, RowSource, RowMeta, RowGroupMeta,
       FrameStats, MetricsSnapshot, SelectionSnapshot,
       CellRenderer, CellRenderContext,
       CellEditor, CellEditorInstance, CellEditContext,
       ValidationContext, ValidationResult, ContextMenuTarget,
       GridTheme
- DEFAULT_THEME
- createSelectEditor / createDateEditor / createTextareaEditor

@beta
- (nothing currently — every Grid export targets @public for v1.0)

@internal
- everything in src/ not re-exported through dist/index
- the internal render-loop methods (tick / scheduleRender / etc.)
```

### `@onegrid/protocol`

Types-only. Every export through `src/index.ts` is `@public` —
the wire contract is the most load-bearing surface in the project
and must not move silently:

```ts
@public
- ColumnSchema, ColumnType, Schema
- BlockRequest, BlockResponse, FetchOptions
- SortDirection, SortField, SortModel, SortNullHandling
- ComparisonOperator, ComparisonFilter, LogicalFilter,
  FilterNode, FilterModel
- AggregationType, Aggregation, AggregationModel
- GroupingModel, PivotModel
- HierarchyEntry
- DataSource
- RowDiff, ResyncRequest, ResyncResponse
- KeysetCursor + everything in @onegrid/ssrm/cursor (re-exported)
- PROTOCOL_VERSION
```

A change to any of these is a breaking change to every downstream
adapter. Bump the major version of `@onegrid/protocol` and propagate.

### `@onegrid/data`

```ts
@public
- createColumnTable, ColumnTable, ColumnInput, ColumnData
- FenwickHeights
- BitmapSelection
- sortIndex + SortOptions
- filterIndex + FilterOptions
- groupRows + GroupRowsOptions + GroupNode + flattenGroupTree +
  pathKey + FlatGroupEntry + FlatGroupHeader + FlatLeafRow
- pivot + PivotedTable
- aggregate + registerAggregator + AggregatorFn + AggregatorFactory
- enumerateDistinct + enumerateDistinctChunked + DistinctValue
- flattenTree + countTreeNodes + TreeNode + FlatTreeEntry
```

### `@onegrid/ssrm`

```ts
@public
- createSsrmDataSource, createSsrmRowSource, createSsrmTreeRowSource
- SsrmRowSourceHandle, SsrmTreeRowSourceHandle
- encodeKeysetCursor, decodeKeysetCursor, cursorFromRow,
  compareKeysetCursors, isLegacyOffsetCursor, parseLegacyOffsetCursor
- createRowDiffStream + CdcAdapter + RowDiffTracker
- createOptimisticMutator + MutationError
- HttpTransportOptions + WebSocketTransportOptions + SseTransportOptions
```

### `@onegrid/formula`

```ts
@public
- createFormulaEngine + FormulaEngine
- parseFormula + evaluate + CellResolver
- FormulaError + isFormulaError + FormulaErrorCode +
  DIV_ZERO / NA_ERROR / NAME_ERROR / NUM_ERROR / REF_ERROR / VALUE_ERROR
- registerFormulaFunction (extension surface)

@beta
- BigInt arithmetic helpers: addNumeric, subNumeric, mulNumeric, divNumeric
  (Settled API but the precision-precedence rules may evolve.)
```

### `@onegrid/react` (and other framework adapters)

```ts
@public
- useOneGrid + UseOneGridResult
- ColumnToolPanel + SelectAllCheckbox
- createReactCellRenderer + createSelectionCheckboxColumn
- Re-exports of @onegrid/core types
```

### v0.0.9 surface

Each new v0.0.9 package's top-level exports are `@public`:

- `@onegrid/plugin-kit`: `Facet, Compartment, PluginState, PluginRegistry, Precedence, INTERFACE_VERSION, definePlugin, createPluginContext` + the 10 named registries
- `@onegrid/tokens`: `compileTheme, flattenDtcg, toCssCustomProperties, watchPrefersColorScheme, forcedColorsBlock, registerTheme, COLOR_TOKEN_NAMES, DENSITY_TOKEN_NAMES`
- `@onegrid/headless`: `HeadlessGrid, createHeadlessGrid` + every event payload type
- `@onegrid/intl`: every named export (small surface; all stable)
- `@onegrid/touch`: every named export
- `@onegrid/worker-plugins`: `WorkerPluginHost, collectTransferables, definePluginWorker`

### v0.0.10 surface

- `@onegrid/dbsp`: every `create*` operator + `Pipeline` + `coalesce / integrate`. Internal types (`Diff`, `ZEntry`) are `@public` because they cross the wire.
- `@onegrid/sparklines`: `drawSparkline, createSparklineRenderer, packRgba` + types
- `@onegrid/data-worker`: `createDataWorker, DataWorker`
- New `@onegrid/webgpu` exports: `gpuHashAggSumF32, cpuHashAggSumF32`

### v0.0.11 surface — `@beta` for v1.0.0

These ship in v1.0.0 with `@beta` markers because the contract is
new and may evolve:

- `@onegrid/mcp`: `createMcpServer` + the bridge interface
- `@onegrid/temporal`: `TemporalLog, applyDiffToSnapshot, invertDiff`
- `@onegrid/ai`: `interpretIntent, parseIntentHeuristic, parseLlmResponse`
- `@onegrid/orm-sync`: `bindOrmSync, extractFromDrizzle, extractFromKysely, extractFromPrisma`
- `@onegrid/crdt`: `bindYjsRows, applyLocalToYjs, bindAutomergeRows`
- `@onegrid/reactive`: `Database`

Promotion path: any package that ships unchanged through v1.1 and
v1.2 with no breaking changes graduates to `@public` automatically
in v1.3.

### v0.1.0 surface — `@beta` for v1.0.0

- `@onegrid/webgpu-render`: `packCells, packRgba, createRenderScaffold,
  MSDF_WGSL, screenPxRange, lookupGlyph`
- `@onegrid/duckdb-join`: `executeJoinQuery, registerSource, unregisterSource`

## Internal-only surface

The following are **explicitly internal** and may move in any release.
Adopter code that imports them is on its own:

- Any path with `/internal/`, `/dist/internal/`, or `/__tests__/`
- Anything reachable only via deep imports (`@onegrid/core/src/grid`)
- Any package version `< 0.1.0` without an explicit `@public` tag

## Enforcement

v1.0.0-rc ships:

- JSDoc `@public` / `@beta` / `@internal` / `@deprecated` tags on
  every export through every package's `src/index.ts`.
- `scripts/check-public-surface.mjs` — walks the dist `.d.ts` files,
  asserts every name reachable through `exports` has a stability tag.
  CI gate; PR fails if a new public export lacks one.

v1.0.0 final adds:

- An auto-generated API report (`docs/api/<package>.api.md`) per
  package. Diffs in CI surface as PR comments.
- A deprecation lint rule that flags consumer code importing
  `@deprecated` symbols.

## Changing the surface

| Change                                    | Allowed in version            |
| ----------------------------------------- | ----------------------------- |
| Adding a new `@public` export             | Minor                         |
| Adding a new `@beta` export               | Minor                         |
| Promoting `@beta` → `@public`             | Minor (one-way; never reverses) |
| Adding optional fields to `@public` types | Minor                         |
| Renaming `@public` exports                | **Major** (add alias + `@deprecated`) |
| Removing `@public` exports                | **Major** (deprecate first)   |
| Changing `@public` function signatures    | **Major**                     |
| Changing `@beta` anything                 | Minor (documented in CHANGELOG) |
| Anything `@internal`                      | Any release, no notice        |

See [SEMVER.md](./SEMVER.md) for the full semver policy.
