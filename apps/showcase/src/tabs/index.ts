import type { ComponentType } from 'react';
import { FormulaXlsxTab } from './01-formula-xlsx';
import { DataAdaptersTab } from './02-data-adapters';
import { CrdtTab } from './03-crdt';
import { FrameworkAdaptersTab } from './04-framework-adapters';
import { WebgpuTab } from './05-webgpu';
import { CrossCuttingTab } from './06-cross-cutting';
import { MoatsTab } from './07-moats';
import { ExportTab } from './08-export';
import { OneGridLiveTab } from './09-onegrid-live';

export interface ShowcaseTab {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly packages: ReadonlyArray<string>;
  readonly Component: ComponentType;
}

export const TABS: ReadonlyArray<ShowcaseTab> = [
  {
    id: 'live-grid',
    label: 'Live grid',
    description: 'A real Grid mounted via @onegrid/react with a synthetic 100K-row RowSource. The wave-22 xlsx import drops cells in; the wave-16 LAMBDA family powers a live formula bar; CRDT presence ticks below.',
    packages: ['@onegrid/core', '@onegrid/react', '@onegrid/data', '@onegrid/formula', '@onegrid/xlsx'],
    Component: OneGridLiveTab,
  },
  {
    id: 'formula-xlsx',
    label: 'Formula + .xlsx',
    description: 'Drag in a .xlsx, see formulas parsed and evaluated. Cross-validates wave-22 readWorkbook against the wave-16 LAMBDA family + wave-17 spilling + wave-15 LET/OFFSET/INDIRECT.',
    packages: ['@onegrid/formula', '@onegrid/xlsx'],
    Component: FormulaXlsxTab,
  },
  {
    id: 'data-adapters',
    label: 'Data adapters',
    description: 'SQL compilers for every supported database. Each adapter takes a BlockRequest and emits the dialect-specific SQL; the surfaces all import cleanly even without a live database.',
    packages: ['@onegrid/protocol', '@onegrid/ssrm', '@onegrid/postgres', '@onegrid/mysql', '@onegrid/sqlite', '@onegrid/clickhouse', '@onegrid/mongo', '@onegrid/drizzle', '@onegrid/kysely', '@onegrid/duckdb', '@onegrid/duckdb-join', '@onegrid/introspect', '@onegrid/migrate'],
    Component: DataAdaptersTab,
  },
  {
    id: 'crdt',
    label: 'CRDT collab',
    description: 'Two Yjs documents synced in-process. Edit row 0 in either pane, watch the other update. Presence ticks the cursor position.',
    packages: ['@onegrid/crdt', '@onegrid/protocol'],
    Component: CrdtTab,
  },
  {
    id: 'framework-adapters',
    label: 'Framework adapters',
    description: 'The same Grid shape mounted through each framework adapter (React rendered live; Vue/Svelte/Solid/Angular/WC surfaces shown to prove they import + typecheck).',
    packages: ['@onegrid/react', '@onegrid/vue', '@onegrid/svelte', '@onegrid/solid', '@onegrid/angular', '@onegrid/wc', '@onegrid/headless'],
    Component: FrameworkAdaptersTab,
  },
  {
    id: 'webgpu',
    label: 'WebGPU compute',
    description: 'CPU hash-aggregate oracle vs the GPU kernel surface. The wave-22 cross-validation harness uses this same shape for the parity gate.',
    packages: ['@onegrid/webgpu', '@onegrid/webgpu-render'],
    Component: WebgpuTab,
  },
  {
    id: 'cross-cutting',
    label: 'Cross-cutting',
    description: 'DTCG design tokens, ICU intl, pointer/touch gestures, a11y conformance, plugin-kit facets — the cross-package "every grid needs these" surface area.',
    packages: ['@onegrid/tokens', '@onegrid/intl', '@onegrid/touch', '@onegrid/a11y', '@onegrid/plugin-kit', '@onegrid/headless', '@onegrid/undo', '@onegrid/temporal', '@onegrid/sparklines'],
    Component: CrossCuttingTab,
  },
  {
    id: 'moats',
    label: 'Moats',
    description: 'The packages that aren\'t on any other grid: AI intent translator, MCP server, Salsa reactivity substrate, DBSP operator algebra, worker-boundary plugin sandbox, off-main-thread data worker, ORM live-sync.',
    packages: ['@onegrid/ai', '@onegrid/mcp', '@onegrid/reactive', '@onegrid/dbsp', '@onegrid/worker-plugins', '@onegrid/data-worker', '@onegrid/orm-sync'],
    Component: MoatsTab,
  },
  {
    id: 'export',
    label: 'Export',
    description: 'CSV + XLSX export from the live grid. The xlsx exporter shells through @onegrid/xlsx writeWorkbook (wave 22) so formulas round-trip with their cached values.',
    packages: ['@onegrid/export', '@onegrid/xlsx'],
    Component: ExportTab,
  },
];
