// =============================================================================
// Arrow IPC ingestion — unit tests against fake decoders.
//
// Real Arrow decoding lives outside `@onegrid/ssrm` (consumers wire
// in `apache-arrow`'s `tableFromIPC`). These tests exercise the
// integration point: that the row source / tree source delegate to
// the supplied decoder when encoding === 'arrow-ipc', throw when no
// decoder is supplied, and pass JSON through unchanged.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type {
  BlockResponse,
  DataSource,
  HierarchyEntry,
  Schema,
} from '@onegrid/protocol';
import { createSsrmRowSource } from '../row-source';
import { createSsrmTreeSource } from '../tree-source';

const SCHEMA: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'name', type: 'utf8' },
];

function makeFlatDataSource(
  fetchImpl: () => Promise<BlockResponse>,
): DataSource {
  return {
    schema: () => SCHEMA,
    fetchBlock: fetchImpl,
  };
}

function makeTreeDataSource(
  fetchImpl: () => Promise<BlockResponse>,
): DataSource {
  return {
    schema: () => SCHEMA,
    fetchBlock: fetchImpl,
  };
}

describe('SsrmRowSource — Arrow IPC ingestion', () => {
  it('passes through JSON encoding without invoking the decoder', async () => {
    const decoder = vi.fn();
    const ds = makeFlatDataSource(async () => ({
      encoding: 'json',
      rows: [{ id: 1, name: 'json-row' }],
      nextCursor: null,
      prevCursor: null,
    }));
    const handle = createSsrmRowSource(ds, {
      numRows: 1,
      decodeArrowIpc: decoder,
    });
    // First read kicks off the fetch.
    handle.getCell(0, 'name');
    await new Promise((r) => setTimeout(r, 0));
    expect(decoder).not.toHaveBeenCalled();
    expect(handle.getCell(0, 'name')).toBe('json-row');
  });

  it('delegates arrow-ipc payloads to the decoder', async () => {
    const arrowBytes = new Uint8Array([0xab, 0xcd, 0xef]);
    const decoder = vi.fn().mockReturnValue([{ id: 99, name: 'arrow-row' }]);
    const ds = makeFlatDataSource(async () => ({
      encoding: 'arrow-ipc',
      rows: arrowBytes,
      nextCursor: null,
      prevCursor: null,
    }));
    const handle = createSsrmRowSource(ds, {
      numRows: 1,
      decodeArrowIpc: decoder,
    });
    handle.getCell(0, 'name');
    await new Promise((r) => setTimeout(r, 0));
    expect(decoder).toHaveBeenCalledWith(arrowBytes);
    expect(handle.getCell(0, 'name')).toBe('arrow-row');
  });

  it('caches a failure when arrow-ipc lands but no decoder is set', async () => {
    const ds = makeFlatDataSource(async () => ({
      encoding: 'arrow-ipc',
      rows: new Uint8Array([1, 2, 3]),
      nextCursor: null,
      prevCursor: null,
    }));
    // No decoder supplied — fetch path catches the throw and leaves
    // the block uncached. Subsequent reads return the placeholder
    // rather than tearing down the renderer.
    const handle = createSsrmRowSource(ds, { numRows: 1 });
    handle.getCell(0, 'name');
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.getCell(0, 'name')).toBe('…');
  });
});

describe('SsrmTreeSource — Arrow IPC ingestion', () => {
  it('decodes hierarchical fetches via the supplied decoder', async () => {
    const arrowBytes = new Uint8Array([0xfe, 0xed]);
    const hierarchy: HierarchyEntry[] = [
      { id: 'r:emea', hasChildren: true },
    ];
    const decoder = vi.fn().mockReturnValue([{ id: 'r:emea', name: 'EMEA' }]);
    const ds = makeTreeDataSource(async () => ({
      encoding: 'arrow-ipc',
      rows: arrowBytes,
      hierarchy,
      nextCursor: null,
      prevCursor: null,
    }));
    const handle = createSsrmTreeSource(ds, { decodeArrowIpc: decoder });
    // Tree source kicks off the root fetch on construction; wait for it.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(decoder).toHaveBeenCalledWith(arrowBytes);
    expect(handle.numRows).toBe(1);
    expect(handle.getCell(0, 'name')).toBe('EMEA');
  });

  it('falls back gracefully when arrow-ipc lands without a decoder', async () => {
    const ds = makeTreeDataSource(async () => ({
      encoding: 'arrow-ipc',
      rows: new Uint8Array([1]),
      hierarchy: [{ id: 'r:emea', hasChildren: false }],
      nextCursor: null,
      prevCursor: null,
    }));
    const handle = createSsrmTreeSource(ds);
    // The fetch's catch handler swallows the error so we don't crash;
    // numRows stays at 0 because no children landed.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(handle.numRows).toBe(0);
  });
});
