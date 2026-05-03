/**
 * Wire-up helpers for connecting the playground to the localhost SSRM mock
 * server. Pulled out of App so it stays focused on UI state.
 */

import {
  createHttpTransport,
  createSsrmDataSource,
  createSsrmRowSource,
  type SsrmRowSourceHandle,
} from '@onegrid/ssrm';
import type { ColumnDef, RowSource } from '@onegrid/react';

const SSRM_BASE_URL = 'http://localhost:3001';

const STATUS_COLORS: Record<string, string> = {
  active: '#62d68a',
  pending: '#f4c768',
  archived: '#7f8893',
  pilot: '#6ea8fe',
  churned: '#e56f6f',
};

/**
 * Visual column definitions for the playground SSRM view. Aligns with the
 * mock server's schema; the server keeps the data, this keeps the renderer
 * configuration.
 */
export const SSRM_COLUMNS: ReadonlyArray<ColumnDef> = [
  {
    id: 'id',
    width: 80,
    displayName: '#',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
    color: () => '#8b929c',
  },
  {
    id: 'firstName',
    width: 130,
    displayName: 'First name',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
  },
  {
    id: 'lastName',
    width: 150,
    displayName: 'Last name',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
  },
  {
    id: 'revenue',
    width: 130,
    displayName: 'Revenue',
    format: (v) => {
      if (v === undefined || v === null) return '…';
      const n = Number(v);
      return Number.isFinite(n) ? `$${n.toFixed(2)}` : '…';
    },
  },
  {
    id: 'status',
    width: 110,
    displayName: 'Status',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
    color: (v) => {
      if (typeof v !== 'string') return undefined;
      return STATUS_COLORS[v];
    },
  },
  {
    id: 'score',
    width: 90,
    displayName: 'Score',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
  },
  {
    id: 'updatedAt',
    width: 170,
    displayName: 'Updated',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
  },
];

export interface SsrmConnection {
  readonly rowSource: RowSource;
  readonly handle: SsrmRowSourceHandle;
  readonly numRows: number;
}

/**
 * Open an SSRM connection: fetch the dataset's total row count via the schema
 * + a probe block, then wire a SsrmRowSource that lazily fills cells from
 * the server. `onUpdate` fires whenever a block lands so the renderer can
 * repaint.
 */
export async function connectSsrm(onUpdate: () => void): Promise<SsrmConnection> {
  const transport = createHttpTransport({ baseUrl: SSRM_BASE_URL });
  const dataSource = createSsrmDataSource(transport, { maxBlocks: 50 });
  // Resolve schema first so we know the connection works before mounting.
  await Promise.resolve(dataSource.schema());
  // Probe the first block to learn totalRowCount.
  const probe = await dataSource.fetchBlock({
    cursor: null,
    direction: 'after',
    limit: 1,
    sort: [],
    filter: null,
  });
  const numRows = probe.totalRowCount ?? 1_000_000;
  const handle = createSsrmRowSource(dataSource, {
    numRows,
    blockSize: 200,
    onUpdate,
  });
  return { rowSource: handle, handle, numRows };
}
