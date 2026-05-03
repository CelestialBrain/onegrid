# oneGrid Feature Matrix

Authoritative cross-library inventory derived from 19 per-library docs. Each cell encodes whether a library supports a feature in its **shipping product**, including paid tiers where relevant.

**Legend**

- `✅` Supported, first-class
- `⚠️` Partial / behind a flag / requires manual wiring / weak implementation
- `❌` Not supported
- `💲` Available only behind a paid tier in the same product family
- `?` Unknown / undocumented
- `–` Not applicable (e.g. licensing column for an MIT lib)

**Library codes** (column order, used for every section table):

| Code | Library | License (core) | Source |
|------|---------|----------------|--------|
| AG-C | AG Grid Community | MIT | [ag-grid](docs/grids/ag-grid.md) |
| AG-E | AG Grid Enterprise | Commercial | [ag-grid](docs/grids/ag-grid.md) |
| TT | TanStack Table v8 | MIT | [tanstack-table](docs/grids/tanstack-table.md) |
| Glide | Glide Data Grid | MIT | [glide-data-grid](docs/grids/glide-data-grid.md) |
| HOT | Handsontable | Dual (non-commercial / commercial) | [handsontable](docs/grids/handsontable.md) |
| HF | HyperFormula | Dual (GPLv3 / commercial) | [hyperformula](docs/grids/hyperformula.md) |
| RVO | RevoGrid (core) | MIT | [revogrid](docs/grids/revogrid.md) |
| MUI-C | MUI X DataGrid Community | MIT | [mui-x-data-grid](docs/grids/mui-x-data-grid.md) |
| MUI-P | MUI X DataGrid Pro | Commercial | [mui-x-data-grid](docs/grids/mui-x-data-grid.md) |
| MUI-Pr | MUI X DataGrid Premium | Commercial | [mui-x-data-grid](docs/grids/mui-x-data-grid.md) |
| Tab | Tabulator | MIT | [tabulator](docs/grids/tabulator.md) |
| GJS | Grid.js | MIT | [grid-js](docs/grids/grid-js.md) |
| Persp | Perspective (FINOS / OpenJS) | Apache-2.0 | [perspective](docs/grids/perspective.md) |
| Quad | Quadratic | Source-Available | [quadratic](docs/grids/quadratic.md) |
| SLK | SlickGrid (6pac fork) | MIT | [slickgrid](docs/grids/slickgrid.md) |
| Webix | Webix DataTable | Dual (GPLv3 / commercial) | [webix](docs/grids/webix.md) |
| Sync | Syncfusion EJ2 Grid | Commercial (free <$1M rev) | [syncfusion](docs/grids/syncfusion.md) |
| Bryn | Bryntum Grid | Commercial | [bryntum](docs/grids/bryntum.md) |
| Kendo | Kendo / KendoReact | Commercial | [kendo](docs/grids/kendo.md) |
| Smart | Smart UI / jqxGrid | Commercial | [smart-grid](docs/grids/smart-grid.md) |
| Dev | DevExtreme DataGrid | Commercial | [devextreme](docs/grids/devextreme.md) |
| Inf | Infragistics Ignite UI | Commercial | [infragistics](docs/grids/infragistics.md) |

> Note: HF (HyperFormula) and Quad (Quadratic) are not data grids — HF is a calc engine, Quad is a complete app. They appear because oneGrid will need a calc engine and a render-arch reference. Most grid features are `–` for them.

---

## 1. Architecture

| Feature | AG-C | AG-E | TT | Glide | HOT | HF | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | Quad | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DOM rendering | ✅ | ✅ | – | ❌ | ✅ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Canvas rendering | ❌ | ❌ | – | ✅ | ❌ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ |
| WebGL rendering | ❌ | ❌ | – | ❌ | ❌ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Headless / no rendering | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Row virtualization | ✅ | ✅ | ❌ | ✅ | ✅ | – | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column virtualization | ✅ | ✅ | ❌ | ✅ | ✅ | – | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Web Worker engine | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| WASM core | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Plugin / module system | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | – | ✅ | ❌ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| Web Component output | ❌ | ❌ | ❌ | ❌ | ❌ | – | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Apache Arrow / columnar | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Notable: only Perspective speaks Arrow IPC end-to-end. Only Perspective + Quadratic ship a Web Worker / WASM engine. Glide is the only prod-grade canvas grid; Infragistics' `IgrDataGrid` is canvas for body cells but DOM for chrome. Quadratic is the only WebGL stack.

## 2. Framework support

| Framework | AG-C | AG-E | TT | Glide | HOT | HF | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | Quad | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vanilla JS / TS | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| React | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vue 3 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | – | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Angular | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Svelte | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Solid | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Qwik | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Lit | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Web Components | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | – | ⚠️ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| SSR | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | – | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

Web Component output (RVO, Persp, Smart, Inf) is the only architecture that gives universal framework reach without per-framework wrappers. RVO and Smart are the cleanest WC examples in this set ([revogrid](docs/grids/revogrid.md), [smart-grid](docs/grids/smart-grid.md)).

## 3. Core data ops

### 3a. Sorting

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Single-column sort | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-column sort | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom comparator | ✅ | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tristate sort | ⚠️ | ⚠️ | ⚠️ | – | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Server-side sort | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 3b. Filtering

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Per-column filter UI | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quick / global filter | ⚠️ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| Excel-style checklist filter | ❌ | ✅ | ❌ | ❌ | ⚠️ | 💲 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| Advanced filter / formula filter | ❌ | ✅ | ❌ | ❌ | ⚠️ | 💲 | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Faceted filter values | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Server-side filter | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 3c. Grouping / Pivoting / Aggregation

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Single-level row grouping | ⚠️ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-level row grouping | ❌ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Drag-to-group panel | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column / header grouping | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pivot mode | ❌ | ✅ | ❌ | ❌ | ❌ | 💲 | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | 💲 | 💲 | ❌ | ❌ | 💲 | 💲 | 💲 |
| Aggregations (sum/avg/min/max/count) | ❌ | ✅ | ✅ | ❌ | ✅ | 💲 | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom aggregation fn | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Group footer / summary row | ❌ | ✅ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lazy-load groups | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ |

Pivot is the most reliably "behind a paywall" feature: only AG-E, MUI-Pr, Persp, Webix, Sync, Smart, Dev, Inf have a real pivot. Among MIT cores, only Perspective ships pivot.

## 4. Editing & validation

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cell edit | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row edit | ✅ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Batch / Excel-like edit | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Popup / dialog edit | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Built-in editor types (text/num/date/select/bool) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom editor component | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Validation framework (sync) | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Async validation | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Undo / redo | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | 💲 | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Transaction / commit-rollback | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Read-only / disabled cells | ✅ | ✅ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | – | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

The strongest validation story belongs to Handsontable (sync + async + `allowInvalid`); the weakest is Glide and TT (you build it). MUI X documents `processRowUpdate` as the validation hook.

## 5. Selection & clipboard

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Single row select | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-row select | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Checkbox column | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cell selection | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Range selection (Excel-style) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-range / non-contig | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| Column selection | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ |
| Fill handle (drag-fill) | ❌ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ | ✅ | ❌ |
| Copy (Ctrl+C) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Paste (Ctrl+V) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Excel-compatible TSV | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Copy headers | ❌ | ✅ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

Range select + fill handle remains the cleanest "you must pay AG-E or build it" feature; only HOT, Glide, RVO, SLK, Tab give them in MIT.

## 6. Server-side row model & streaming

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Manual server-mode flags | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| First-class data-source abstraction | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| Block / chunk loading | ❌ | ✅ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| Infinite scroll | ⚠️ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| Lazy-load tree / nested | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Built-in cache (TTL) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| Streaming push API (deltas) | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| Cell flash on change | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ | ⚠️ | ✅ |
| Documented 60 FPS @ 1M+ rows | ⚠️ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ |

Best-of-breed SSRM: AG-E and Perspective. MUI-P/Pr's `GridDataSourceCacheDefault` (5 min TTL) is the clearest off-the-shelf cache. AG-E SSRM contract from [ag-grid](docs/grids/ag-grid.md) is the most mature design.

MUI-C's update ceiling around 10/sec at scale (issue [#10952](https://github.com/mui/mui-x/issues/10952)) is documented in [mui-x-data-grid](docs/grids/mui-x-data-grid.md). AG Grid blog cites 100k/sec.

## 7. Formulas & computed cells

| Feature | AG-C | AG-E | TT | Glide | HOT | HF | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | Quad | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Computed column (accessor / valueGetter) | ✅ | ✅ | ✅ | ⚠️ | ✅ | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Excel-style formulas in cells | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | 💲 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| Formula function library (≥ 200 fns) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| Cross-sheet / multi-sheet refs | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Named expressions / ranges | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dependency graph / incremental recalc | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Array / spill formulas | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Custom function plugin API | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Volatile fn support (NOW/RAND) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Only HF (and downstream HOT), Quadratic's Rust core, and Perspective's ExprTK ship a real dependency-graph engine. Webix can do `=A1+B1` via its `math` mixin but is far from Excel parity. Most "vendor X has a separate Spreadsheet component" caveat is footnote-only — the **Grid** itself does not include formulas (Sync, Kendo, Dev, Inf, Smart, Webix all gate this behind a sister Spreadsheet product).

## 8. Tree data & master-detail

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tree data (parent-child) | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Path-based tree | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Async lazy node loading | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Master / detail panel | ❌ | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Nested grid in detail | ❌ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Frozen / pinned rows | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ |
| Frozen / pinned columns | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row span / col span | ⚠️ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Tree data is reliably commercial: AG-E, MUI-P/Pr, Sync, Bryn, Kendo TreeList, Smart, Dev TreeList, Inf TreeGrid all ship it.

## 9. Theming & customization

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CSS-variable theme | ✅ | ✅ | – | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multiple bundled themes (≥3) | ✅ | ✅ | – | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dark mode preset | ✅ | ✅ | – | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Theme builder tool | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Custom cell renderer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom header renderer | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom row renderer | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conditional formatting | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cell tooltips | ✅ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ |
| Custom borders / merge cells | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cell comments | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Density modes | ❌ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

Cell comments are nearly Handsontable-exclusive. Theme builder tools come with the commercial vendors.

## 10. Export & import

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CSV export | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Excel (.xlsx) export | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Excel with cell styling | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Excel with formulas | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| PDF export | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| JSON export | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| Apache Arrow export | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Print view / styling | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| File import (xlsx/csv/ods) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Tabulator is the **only MIT** lib with first-class file *import* (xlsx, csv, ods) per [tabulator](docs/grids/tabulator.md). Perspective is the only Arrow exporter.

## 11. Charts & visualization

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Inline sparkline cell | ❌ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Range / pivot chart | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Built-in chart types ≥ 5 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Chart linked to grid selection | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| Multi-pane workspace / dashboard | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

AG-E (Integrated Charts via AG Charts) and Perspective (D3FC plugin + Workspace) are the only first-party in-grid chart stories. Most commercial vendors say "pair with our Charts component", which is not the same.

## 12. Accessibility & i18n

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WAI-ARIA grid pattern | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Full keyboard nav | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Screen-reader tested (NVDA/JAWS/VO) | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WCAG 2.1 AA stated target | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Section 508 stated | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| High-contrast theme | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ |
| Configurable shortcuts | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Localization / i18n | ✅ | ✅ | – | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 20+ bundled locales | ✅ | ✅ | – | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| RTL | ✅ | ✅ | – | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| IME / CJK input | ⚠️ | ⚠️ | – | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

Glide explicitly disclaims a11y. Quadratic's WebGL canvas has the same problem (no DOM mirror). Sync, Smart, Dev, Inf are the only libraries that publicly claim Section 508.

## 13. Mobile & touch

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Touch scrolling | ✅ | ✅ | – | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Long-press menus / actions | ⚠️ | ⚠️ | – | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| Touch-drag select | ⚠️ | ⚠️ | – | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| Responsive / adaptive layout | ❌ | ❌ | – | ❌ | ⚠️ | ❌ | ⚠️ | 💲 | 💲 | ✅ | ✅ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Auto-hide columns by priority | ❌ | ❌ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Mobile-only list view | ❌ | ❌ | – | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| Pinch zoom | ⚠️ | ⚠️ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Mobile is broadly weak across the board. Tabulator and Sync have the most mobile-aware features (responsive collapse). MUI-P/Pr's `listView` is the most explicit "render as cards on phones" mode.

## 14. Performance & scale (claimed/observed)

| Metric | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | Quad | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100k client-side rows comfortable | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 1M+ client-side rows | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ |
| 10M+ rows via SSRM | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| 10k+ updates/sec | ⚠️ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| Bundle ≤ 50 KB gzip | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | – | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bundle ≤ 200 KB gzip (full feature) | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ | – | ✅ | ❌ | ⚠️ | ❌ | ✅ | ⚠️ | ❌ | ⚠️ |
| Tree-shakeable per-feature | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | – | ⚠️ | ❌ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ |
| Published benchmark suite | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

[revogrid](docs/grids/revogrid.md) is the only MIT lib that publishes a benchmark repo (`revolist/revogrid-benchmarks`). Perspective discusses benchmarks in [discussion #1659](https://github.com/finos/perspective/discussions/1659).

## 15. License & pricing summary

| Library | License (core) | Cheapest paid tier | Most expensive tier | Free trial |
|---|---|---|---|---|
| AG Grid | MIT (Community) | Enterprise $999/dev/yr | + Charts $1,498/dev/yr | 30 days |
| TanStack Table | MIT | – | – | – |
| Glide Data Grid | MIT | – | – | – |
| Handsontable | Custom non-commercial | $999/dev/yr | Enterprise (custom) | 45 days |
| HyperFormula | GPLv3 (viral) | $1,490/yr + $1.49/user | Enterprise (custom) | – |
| RevoGrid | MIT (core); Pro is sales-quoted | – | – | – |
| MUI X DataGrid | MIT (Community) | Pro $299/dev/yr | Enterprise $1,399/dev/yr | – |
| Tabulator | MIT | – | – | – |
| Grid.js | MIT | – | – | – |
| Perspective | Apache-2.0 | – | – | – |
| Quadratic | Source-Available | $18/user/mo (SaaS) | Custom | – |
| SlickGrid (6pac) | MIT | – | – | – |
| Webix | GPLv3 / commercial | $848/yr (Custom Pack) | $9,499/yr (Unlim) | trial via demo |
| Syncfusion | Commercial (free <$1M rev) | quote-only (~mid-$1ks/dev) | Enterprise (higher) | 30 days |
| Bryntum | Commercial | $680/dev/yr (3-dev min) | OEM (quote) | 30 days |
| Kendo | Commercial | ~$881/dev (perpetual) | Suite bundles higher | 30 days |
| Smart UI / jqxGrid | Commercial | $199 single-component | Site / Enterprise | – |
| DevExtreme | Commercial | ~$882/dev/yr | DevExpress Universal $2,254/dev/yr | 30 days |
| Infragistics | Commercial | $1,399/dev/yr | Ultimate ~$2,995/dev | 30 days |

Among MIT cores with no upsell pressure: TanStack, Glide, RVO core, Tabulator, Grid.js, SlickGrid. Among Apache-2.0: Perspective. Everything else has a paid tier in the same product family.

## 16. Other notable features

| Feature | AG-C | AG-E | TT | Glide | HOT | RVO | MUI-C | MUI-P | MUI-Pr | Tab | GJS | Persp | SLK | Webix | Sync | Bryn | Kendo | Smart | Dev | Inf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Column resize | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column reorder | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column hide / chooser | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column auto-size to content | ✅ | ✅ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| Row drag-to-reorder | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | 💲 | 💲 | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cross-grid row drag | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Context menu | ❌ | ✅ | ❌ | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| Toolbar / status bar | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| State persistence (localStorage) | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Pagination | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Find / search | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| AI / NL query → state | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Spreadsheet / multi-sheet UI | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ | 💲 | 💲 | ❌ | 💲 | 💲 | 💲 | 💲 |
| Subviews / subrows | ⚠️ | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Multi-row layout (cell wraps to multiple rows) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Foreign-key / lookup column | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Per-cell shortcuts API | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ |

AI-driven NL → grid state is the newest moat: only AG-E, MUI-Pr, Sync (`SmartPaste`), Kendo (Prompt-controlled DataGrid), Inf (AI code-gen). All paid.

---

## § Universal features (oneGrid table-stakes)

Features supported by ≥80% of the 19 libraries (counting AG Grid as one product, MUI X as one, etc., per the 19-source brief). These are the **floor** — oneGrid v1 must ship them on day one or it's not credible.

1. **Single + multi-column sort with custom comparators** — every grid except Glide / Quadratic / HF (engines, not grids).
2. **Column resize, reorder, hide/show, freeze (left or both)** — universal except GJS.
3. **Per-column filter UI with at least string/number/date operators**.
4. **Server-side mode flags** — manual `manualSort/Filter/Pagination` flags or equivalent. Even TT and GJS expose these.
5. **Pagination OR row virtualization** (one of the two; usually virtualization).
6. **Single + multi-row selection with checkbox column**.
7. **Cell editing** with at least text/number/select/date/boolean editors and a custom editor escape hatch.
8. **Custom cell renderer** API (header + cell minimum).
9. **Excel-compatible copy of selection** (TSV serialization). Paste varies, but copy is universal.
10. **Theming via CSS variables** with at least light/dark presets.
11. **CSV export**. (Excel and PDF are not universal — see Premium.)
12. **WAI-ARIA grid roles + arrow-key keyboard nav**.
13. **i18n string map + RTL**.
14. **Row + column event surface** (`rowClick`, `cellEdited`, `selectionChanged`).
15. **Frozen columns** (left at minimum).

These 15 are non-negotiable for v1.

## § Premium features (oneGrid moats)

Features only 2–5 libraries ship, mostly behind paid tiers. Building these MIT-free is the moat.

1. **Drag-and-drop pivot panel** — AG-E, MUI-Pr, Persp, Sync (separate), Smart (separate), Webix (separate Pivot widget), Dev (separate PivotGrid), Inf (`IgrPivotGrid`). Among MIT cores: **only Perspective**. ([perspective](docs/grids/perspective.md))
2. **Excel-style range select + fill handle (drag-to-fill)** — AG-E, HOT, Glide, RVO core, SLK, Tab, Sync, Smart. Only ~5 of the MIT set: HOT (custom license, not OSI), Glide, RVO, Tab, SLK.
3. **Excel/XLSX export with cell styling** — AG-E, MUI-Pr, Tab (via SheetJS), Webix, Sync, Bryn, Kendo, Smart, Dev, Inf. Among MIT: only Tab.
4. **PDF export with multi-page + theming** — Tab (jsPDF), Webix, Sync, Kendo, Bryn, Smart, Dev. Among MIT: only Tab.
5. **First-class server-side row model** (block-loading + cache + pivot/group push-down) — AG-E, MUI-P/Pr, Persp, Sync, Bryn, Dev, Inf. Among MIT/Apache: only Persp.
6. **Master-detail with nested grid** — AG-E, MUI-P/Pr, SLK, Webix, Sync, Bryn, Kendo, Dev, Inf. None MIT-free at production polish (SLK is closest).
7. **Tree data with path mode + lazy node loading** — AG-E, MUI-P/Pr, Sync, Bryn, Kendo TreeList, Dev TreeList, Inf TreeGrid, Smart. None MIT-free with full feature parity.
8. **Built-in spreadsheet formulas (engine + ≥200 fns + dependency graph)** — HOT (commercial) via HF, HF itself (GPLv3), Persp (ExprTK; subset), Quad (Rust core, not a library). Among MIT/Apache: only Persp's expression language (subset of Excel).
9. **Inline charts / sparklines / range charts** — AG-E (Integrated Charts), Persp (D3FC plugin), Webix, Sync, Smart, Dev, Inf. Among MIT/Apache: only Persp.
10. **Streaming push API with cell flash + 10k+ updates/sec** — AG-E, Persp, Quad, Dev, Inf, SLK (HFT demo). Among MIT/Apache: Persp + SLK.
11. **AI / natural-language → filter/sort/aggregate** — AG-E (AI Toolkit v34+), MUI-Pr (AI Assistant), Sync (`SmartPaste`), Kendo (Prompt-controlled DataGrid), Inf (AI code-gen). Zero MIT.
12. **Multi-pane workspace / linked dashboards** — only Perspective Workspace.
13. **Apache Arrow IPC native** — only Perspective.
14. **Spreadsheet-mode (multi-sheet tabs, sheet management)** — Tab (built in), HOT/Webix/Sync/Smart/Kendo/Dev (separate Spreadsheet product). Among MIT: only Tab.
15. **Cell comments** — only Handsontable (commercial).
16. **Multi-row layout** (one record renders across multiple visual rows) — only Infragistics.
17. **AI Formula Generator / code cells** — only Quadratic.
18. **WebGL-backed canvas at infinite-canvas scale** — only Quadratic.

If oneGrid ships all 18 under MIT, it has no peer. Realistic v1: pivot, range/fill, Excel + PDF export, SSRM, master-detail, tree data, formula engine integration, charts, streaming. (1, 2, 3, 4, 5, 6, 7, 8, 9, 10.)

## § Universal gaps (oneGrid greenfield)

Features no library handles well, or weaknesses cited consistently across the per-library "Recurring weaknesses" sections.

1. **Mobile / touch UX is universally weak.** AG Grid: "designed for desktop, mobile is second-class" ([ag-grid](docs/grids/ag-grid.md)). HOT: "desktop-spreadsheet UX remains the primary focus." Glide: "touch supported but not optimized." RVO: "no dedicated mobile-optimized UI mode." MUI-P/Pr ships `listView`, but it's behind a paywall. Tab and Sync have responsive collapse but no real mobile editor. **No grid in this set has a mobile-first interaction model**.
2. **Filter UI is fragmented and ugly across every grid.** Eight different filter taxonomies (Filter Row vs Header Filter vs Filter Menu vs Excel Filter vs Filter Builder vs Filter Bar vs Search Panel vs Quick Filter). Cited weakness in MUI X (header-filtering Pro-only), AG Grid (Advanced Filter is Enterprise), Webix (multiple filter widgets), Tabulator, etc. **Customizable filter UI primitives are nobody's strength.**
3. **High-frequency updates degrade hard outside AG-E and Perspective.** MUI X #10952: ~10/sec ceiling at scale ([mui-x-data-grid](docs/grids/mui-x-data-grid.md)). Tabulator #1288: 1.5 GB memory at 4k rows. Tabulator #747: `addData` slow with large chunks. SLK is OK but legacy API. **An MIT lib with documented 60 FPS at 100k updates/sec is unprecedented.**
4. **Bundle size is universally larger than expected.** AG Grid #1459 + #3502 cite bundle inflation. MUI X is "heavier than Tabulator or Grid.js for similar features". Handsontable full UMD is ~700 KB. Perspective inline-WASM is ~1.5 MB raw. Only TT (~14 KB headless) and GJS (~50 KB, no virtualization) are small. **A < 100 KB virtualized core is open territory.**
5. **Master/detail performance falls over at scale.** MUI X #7811: `getDetailPanelContent` fires on every re-render. Bryntum forum reports nested-grid Vue 3 issues. AG-E master/detail is fine but Enterprise. **No MIT lib has a polished, performant master/detail.**
6. **Validation + editing has no shared mental model.** Handsontable has the richest API but uses a custom non-OSI license. AG Grid ships no first-class validator. TT ships nothing. MUI X uses `processRowUpdate`. Tabulator has a unique validator string DSL. **Async validation with optimistic UI + rollback is nobody's strong suit.**
7. **Accessibility is uneven and rarely certified.** Glide acknowledges its weakness. SlickGrid was historically weak. Quadratic admits a gap. Even commercial grids (Bryntum, Tabulator) only "target" WCAG 2.1 AA without certification. **A grid with audited Section 508 + WCAG 2.1 AA in MIT is rare.**
8. **Documentation is universally dated / fragmented.** RVO #193 ("Documentation Enhancement"). Tabulator docs UX is "feature-complete but dated". SlickGrid docs split across wiki + code. AG Grid docs are good but breaking-change overhead is criticized.
9. **No grid has a serious collaborative-editing story.** Quadratic has multiplayer but it's a product. **CRDT-based grid edits are unbuilt.**
10. **No grid does undo/redo across structural + cell changes well.** HOT does cell-level. AG-E does cell-level. Bryntum has it. Tabulator's history module is closest to comprehensive, but it's documented as "edits and structural changes" without a unified mental model. **Branching undo / time-travel state is a gap.**
11. **No grid has a persistent state-store API that survives mount/unmount.** State persistence to localStorage exists in many (Tab, Bryn, Sync, Dev, Smart, Webix, Inf) but they all use string blobs of vendor-specific shape. **A canonical, versioned, JSON-Schema-typed grid-state format is unowned.**
12. **No grid speaks Arrow except Perspective.** Pandas/Polars/DuckDB interop is gated behind one Apache-2.0 lib. **An MIT grid with Arrow ingest + zero-copy WASM transfer is wide open.**
13. **No vector-tile / spatial-hash render strategy outside Quadratic.** All other grids do row-recycling. Tile-based rendering (Quad's hash regions; map-tile model) gives O(visible-tiles) work for any operation, including paste of 10M cells. **No library, MIT or commercial, ships this for general-purpose grids.**
14. **No grid offers a first-class plugin API for third parties.** RVO has the closest (provider access; [revogrid](docs/grids/revogrid.md)). AG Grid, Tab, HOT all have hooks but no plugin marketplace. **A grid with a public, semver-stable plugin contract + registry is open.**

---

## Design implications for oneGrid

Concrete, PR-ready recommendations from the matrix.

- **Make the renderer a pluggable interface.** Ship DOM as v1 default (universal a11y); support a Canvas adapter (Glide-style) and a WebGL/PixiJS adapter (Quadratic-style) behind the same row/column virtualization contract. Quadratic's spatial-hash tiles ([quadratic](docs/grids/quadratic.md)) is the architecture; the API surface should be renderer-agnostic.
- **Adopt Perspective's headless-engine + viewer split.** Engine speaks Arrow IPC; viewer is a Web Component. This gives Vue/Angular/Svelte/Solid/Qwik users a single integration with no per-framework wrappers — same architectural bet as RVO + Persp, generalized.
- **Ship the SSRM contract as the default, even client-side.** Match AG-E's `IServerSideDatasource` shape ([ag-grid](docs/grids/ag-grid.md)). Client mode is just a Datasource-over-array. This kills the "client/server divergence" problem MUI X has.
- **Filter UI must be a primitives kit, not a fixed component.** Ship `<FilterRow>`, `<FilterMenu>`, `<ExcelStyleFilter>`, `<FilterBuilder>`, `<QuickFilter>`, and `<AdvancedFilter>` as composable parts with one shared `FilterModel` JSON. Every commercial vendor ships these as separate widgets — oneGrid should ship them all as MIT and let users pick.
- **First-class formula engine integration via adapter, not vendoring.** Define `FormulaEngine` interface (`evaluate`, `setCell`, `getDependencies`); ship a default JS implementation for ≤100 functions; allow drop-in HF (GPL) or future MIT engine. This avoids the GPLv3 viral risk while keeping `=SUM(A1:A10)` as a tier-0 feature.
- **State is a single typed JSON object.** Mirror TanStack's pattern — sort, filter, group, pivot, expand, selection, columnSizing, columnOrder, columnVisibility, rowPinning, paginationState all live in one `GridState`. Versioned with a schema version. Persistence to localStorage / URL / server is a serializer over the same shape.
- **Streaming is a first-class API, not a callback.** Ship `grid.applyTransaction({ add, remove, update })` (AG Grid + Persp pattern). No prop-replacement model — that's where MUI hits #10952. Document a 60 FPS target for 100k updates/sec; publish a benchmark repo (RVO and Persp both do this).
- **Mobile-first interaction model is a v1 differentiator.** Ship a `<MobileListView>` component that shares `GridState` with the grid; auto-collapse columns by priority (Tabulator + Sync do this); long-press → context menu; pinch-zoom column widths. None of the leaders prioritize this.
- **Range select + fill handle in MIT.** Implement Excel-style range select + drag-fill in v1. AG-E gates this; HOT requires commercial. This is the #1 user-visible "I have to pay" feature.
- **Excel + PDF export in MIT.** Ship `exportXLSX()` (via SheetJS / fastest community lib) and `exportPDF()` (jsPDF) as MIT modules. Tab does this; nobody else MIT-free does.
- **AI integration is an interface, not a feature.** Define `AICommand { intent, target } → Partial<GridState>`. Ship NL → state translator as an optional package; let users wire OpenAI/Anthropic/local. Don't bake an AI provider into core (avoid MUI's "you build the proxy" gotcha).
- **Plugin contract with semver stability.** Provide internal providers (data, dimension, viewport, selection, edit) RVO-style ([revogrid](docs/grids/revogrid.md)). Document a public plugin API at v1 and treat breaking changes to it the same as breaking core changes.
- **One canonical column type system.** `text | number | date | boolean | select | multi-select | image | url | markdown | currency | percent | progress | rating | sparkline | tags | code | foreign-key`. Most grids reinvent this list inconsistently — converge it.
- **Tree + master-detail share an "expandable row" primitive.** AG-E has tree, master-detail, and group-rows as three different things; MUI X has tree + detail-panel. They're all "row with children". Ship one `ExpandableRow` API, parameterized by content (group / detail / tree-children).
- **Validation is sync + async + optimistic, with built-in rollback.** Adopt HOT's `validator` + `allowInvalid` semantics; add `processRowUpdate`-style async commit (MUI X) with automatic rollback if the promise rejects. Surface validation errors in a `validationModel` slice of state for renderable error overlays.
- **Cell comments and conditional formatting are core.** HOT's killer features should not be a competitor's exclusive. Conditional formatting is a function of `(row, col, value, state) → style`; ship it.
- **Section 508 and WCAG 2.1 AA from v1.** Pay for an a11y audit before 1.0. No leader has a public certification — being the first MIT grid with one is press-worthy.
- **Bundle: < 60 KB gzip headless core, < 120 KB gzip with default DOM renderer + sort/filter/select/edit.** Tree-shake every feature. TT proves this is achievable headless; oneGrid should match it batteries-included.
- **Ship a `regular-table`-style virtual data fetcher.** Persp's `regular-table` does lazy data-on-demand (`getCellContent([col, row])`). Glide does too. This is the right primitive for million-row grids; expose it as `<Grid datasource={...} />`.
- **Test like Perspective documents.** Publish a benchmark repo with real datasets (1M rows, 100k updates/sec, 100-column wide). RVO and Persp do this; AG Grid does not.

---

## Summary

- **Total features cataloged:** ~190 across 16 sections (Architecture, Framework support, Sorting, Filtering, Grouping/Pivoting/Aggregation, Editing, Selection/Clipboard, SSRM/Streaming, Formulas, Tree/Master-Detail, Theming, Export, Charts, A11y/i18n, Mobile, Performance, License, Other).
- **File written:** `/Users/angelonrevelo/Antigravity/onegrid/docs/feature-matrix.md`
- **Thin-doc libraries** where rows had to be inferred or marked `?` / `⚠️` more aggressively:
  - **Quadratic** ([quadratic](docs/grids/quadratic.md)) — it's a product, not a library; many grid-feature rows are `–`.
  - **HyperFormula** ([hyperformula](docs/grids/hyperformula.md)) — it's a calc engine, not a grid; only formula-related rows apply.
  - **Webix** ([webix](docs/grids/webix.md)) — closed-source Pro features; bundle size and 1M-row claims unverifiable.
  - **Smart UI / jqxGrid** ([smart-grid](docs/grids/smart-grid.md)) — two product lines, doc fragmentation, some claims (`enableAdaptiveUI`-equivalent, async validation) inferred from suite parity.
  - **Bryntum** ([bryntum](docs/grids/bryntum.md)) — repo private; bundle size estimated; some streaming/cache details inferred from store architecture rather than confirmed APIs.
