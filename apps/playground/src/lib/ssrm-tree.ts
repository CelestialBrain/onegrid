/**
 * Wire-up helpers for the SSRM-tree playground mode.
 *
 * Connects to the localhost mock server's hierarchical endpoint
 * (regions → countries → cities) via the same DataSource transport
 * the flat SSRM mode uses, then wraps it with `createSsrmTreeSource`
 * so chevron toggles trigger lazy children fetches over the network.
 */

import {
  createHttpTransport,
  createSsrmDataSource,
  createSsrmTreeSource,
  type SsrmTreeSourceHandle,
} from '@onegrid/ssrm';
import type { ColumnDef, RowSource } from '@onegrid/react';

const SSRM_BASE_URL = 'http://localhost:3001';

export const SSRM_TREE_COLUMNS: ReadonlyArray<ColumnDef> = [
  {
    id: 'name',
    width: 320,
    displayName: 'Region · Country · City',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
  },
  {
    id: 'population',
    width: 160,
    displayName: 'Population',
    format: (v) => {
      if (v === undefined || v === null) return '—';
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString() : '—';
    },
  },
  {
    id: 'id',
    width: 260,
    displayName: 'Node id',
    format: (v) => (v === undefined || v === null ? '…' : String(v)),
    color: () => '#8b929c',
  },
];

export interface SsrmTreeConnection {
  readonly rowSource: RowSource;
  readonly handle: SsrmTreeSourceHandle;
}

/**
 * Open an SSRM-tree connection and wait for the root fetch to land
 * before resolving. Without this, useOneGrid would see numRows=0 and
 * skip mounting the Grid until the next render — so we'd race the
 * first onUpdate against the React effect cycle. Awaiting the first
 * roots makes that race deterministic: the grid mounts with rows
 * already populated.
 */
export async function connectSsrmTree(onUpdate: () => void): Promise<SsrmTreeConnection> {
  const transport = createHttpTransport({ baseUrl: SSRM_BASE_URL });
  const dataSource = createSsrmDataSource(transport, { maxBlocks: 50 });
  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });
  let firstUpdateSeen = false;
  const handle = createSsrmTreeSource(dataSource, {
    onUpdate: () => {
      if (!firstUpdateSeen) {
        firstUpdateSeen = true;
        resolveReady();
      }
      onUpdate();
    },
  });
  await ready;
  return { rowSource: handle, handle };
}
