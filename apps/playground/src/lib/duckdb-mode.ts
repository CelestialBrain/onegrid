/**
 * DuckDB-WASM playground mode.
 *
 * Lazy-loads DuckDB-WASM from JSDelivr's CDN bundle, generates a
 * synthetic dataset as CSV bytes, registers it in DuckDB's virtual
 * filesystem, and CREATEs a table from it. The table is then handed
 * to @onegrid/duckdb's createDuckDbDataSource → DataSource, which
 * goes through the standard SsrmRowSource → canvas pipeline.
 *
 * Why CSV ingest specifically: DuckDB-WASM has a fast read_csv path
 * (~50ms for 100k rows). Multi-row INSERT VALUES is 10× slower at the
 * same scale because each batch round-trips through prepared
 * statements. A future revision can switch to Arrow IPC ingest for
 * 1M+ row datasets.
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { createDuckDbDataSource, type DuckDbDataSourceHandle } from '@onegrid/duckdb';
import { createSsrmRowSource, type SsrmRowSourceHandle } from '@onegrid/ssrm';
import type { ColumnDef, RowSource } from '@onegrid/react';

const FIRST_NAMES = [
  'Aiko', 'Bashir', 'Camila', 'Dmitri', 'Elena', 'Farhan', 'Gabriela', 'Hideki',
  'Imani', 'Jin', 'Kalani', 'Lior', 'Maya', 'Nadir', 'Olamide', 'Priya',
  'Quentin', 'Ravi', 'Saskia', 'Tomás', 'Uma', 'Viktor', 'Wren', 'Xiomara',
  'Yara', 'Zane',
];

const LAST_NAMES = [
  'Adeyemi', 'Bukowski', 'Chen', 'Dvorak', 'Eriksen', 'Fitzgerald', 'Garibay',
  'Halevi', 'Ivanova', 'Jónsson', 'Kapur', 'Lindqvist', 'Mokoena', 'Nakamura',
  'Okonkwo', 'Petrov', 'Quesada', 'Rinaldi', 'Saito', 'Tahir', 'Ueda', 'Vargas',
  'Watanabe', 'Xu', 'Yusuf', 'Zografos',
];

const STATUSES = ['active', 'pending', 'archived', 'pilot', 'churned'] as const;

const STATUS_COLORS: Record<string, string> = {
  active: '#62d68a',
  pending: '#f4c768',
  archived: '#7f8893',
  pilot: '#6ea8fe',
  churned: '#e56f6f',
};

export const DUCKDB_COLUMNS: ReadonlyArray<ColumnDef> = [
  {
    id: 'id',
    width: 80,
    displayName: '#',
    format: (v) => (v === null || v === undefined ? '…' : String(v)),
    color: () => '#8b929c',
  },
  { id: 'first_name', width: 130, displayName: 'First name', format: stringify },
  { id: 'last_name', width: 150, displayName: 'Last name', format: stringify },
  {
    id: 'revenue',
    width: 130,
    displayName: 'Revenue',
    format: (v) => {
      if (v === null || v === undefined) return '…';
      const n = Number(v);
      return Number.isFinite(n) ? `$${n.toFixed(2)}` : '…';
    },
  },
  {
    id: 'status',
    width: 110,
    displayName: 'Status',
    format: stringify,
    color: (v) => (typeof v === 'string' ? STATUS_COLORS[v] : undefined),
  },
  { id: 'score', width: 90, displayName: 'Score', format: stringify },
  { id: 'updated_at', width: 170, displayName: 'Updated', format: stringify },
];

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '…';
  return String(v);
}

export interface DuckDbConnectionOptions {
  readonly numRows: number;
  readonly onProgress?: (message: string) => void;
  readonly onUpdate?: () => void;
}

export interface DuckDbModeHandle {
  readonly db: duckdb.AsyncDuckDB;
  readonly dataSource: DuckDbDataSourceHandle;
  readonly rowSource: RowSource;
  readonly handle: SsrmRowSourceHandle;
  readonly numRows: number;
  readonly close: () => Promise<void>;
}

/**
 * Connect, ingest, and wrap. Returns a handle whose rowSource feeds the
 * canvas via the same SsrmRowSource bridge SSRM mode uses — DuckDB just
 * happens to be the backend instead of a remote HTTP server.
 */
export async function connectDuckDb(
  options: DuckDbConnectionOptions,
): Promise<DuckDbModeHandle> {
  const { numRows, onProgress, onUpdate } = options;

  // 1. Pick a JSDelivr-hosted bundle for the user's browser.
  onProgress?.('selecting WASM bundle…');
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);

  // 2. Spin up the DuckDB worker. We wrap the CDN-hosted main worker in
  //    a Blob importScript so cross-origin Worker construction works.
  onProgress?.('booting WASM worker…');
  const workerBlob = new Blob([`importScripts("${bundle.mainWorker!}");`], {
    type: 'text/javascript',
  });
  const workerUrl = URL.createObjectURL(workerBlob);
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);

  // 3. Generate synthetic CSV in memory and register it as a virtual file.
  onProgress?.(`generating ${numRows.toLocaleString()} rows of CSV…`);
  const csvBytes = generateCsvBytes(numRows);
  await db.registerFileBuffer('synthetic.csv', csvBytes);

  // 4. CREATE TABLE FROM CSV. read_csv is significantly faster than
  //    multi-row INSERT VALUES for 100k+ rows.
  onProgress?.('CREATE TABLE FROM read_csv…');
  const conn = await db.connect();
  await conn.query(
    `CREATE TABLE synthetic AS SELECT * FROM read_csv('synthetic.csv', header=true, AUTO_DETECT=true)`,
  );
  await conn.close();

  // 5. Wrap with createDuckDbDataSource → DataSource.
  onProgress?.('wiring DataSource…');
  const dataSource = createDuckDbDataSource({
    db,
    source: 'synthetic',
    idColumn: 'id',
    defaultLimit: 200,
  });

  // 6. Wrap DataSource with SsrmRowSource so the canvas can read cells
  //    synchronously through the same lazy-block-cache path as SSRM mode.
  const handle = createSsrmRowSource(dataSource, {
    numRows,
    blockSize: 200,
    ...(onUpdate ? { onUpdate } : {}),
  });

  return {
    db,
    dataSource,
    rowSource: handle,
    handle,
    numRows,
    close: async () => {
      await dataSource.close();
      await db.terminate();
    },
  };
}

/**
 * Generate the same synthetic dataset that the in-memory mode + mock
 * server use, but encoded as RFC-4180-ish CSV bytes for DuckDB ingest.
 * Building strings inline is faster than going through Array.join()
 * for 100k+ rows.
 */
function generateCsvBytes(numRows: number): Uint8Array {
  const parts: string[] = ['id,first_name,last_name,revenue,status,score,updated_at\n'];
  for (let i = 0; i < numRows; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? '';
    const last = LAST_NAMES[(i * 17) % LAST_NAMES.length] ?? '';
    const revenue = ((i * 1009) % 1_000_000) / 100;
    const status = STATUSES[i % STATUSES.length] ?? 'active';
    const score = (i * 31) % 100;
    const t = 1_700_000_000_000 + i * 60_000;
    const updatedAt = new Date(t).toISOString().slice(0, 16).replace('T', ' ');
    parts.push(
      `${String(i)},${first},${last},${revenue.toFixed(2)},${status},${String(score)},${updatedAt}\n`,
    );
  }
  return new TextEncoder().encode(parts.join(''));
}
