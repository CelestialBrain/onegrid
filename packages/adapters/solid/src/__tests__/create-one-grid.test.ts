// =============================================================================
// @onegrid/solid — createOneGrid primitive test.
//
// Same contract as the Vue + React tests: Grid is stubbed via vi.mock so
// the spec runs without WebGL / canvas. Verifies the imperative-update
// vs recreate semantics.
//
// Solid effects are queued to a microtask; tests `await flush()` between
// signal mutations and assertions so the effect's first run lands.
// =============================================================================

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, createSignal } from 'solid-js';

const destroyMock = vi.fn();
const setColumnsMock = vi.fn();
const setRowSourceMock = vi.fn();
const constructorMock = vi.fn();

vi.mock('@onegrid/core', () => ({
  Grid: class {
    constructor(opts: unknown) {
      constructorMock(opts);
    }
    destroy = destroyMock;
    setColumns = setColumnsMock;
    setRowSource = setRowSourceMock;
    setPinnedTopRowSource = vi.fn();
    setPinnedBottomRowSource = vi.fn();
  },
}));

import { createOneGrid } from '../create-one-grid';
import type { CreateOneGridOptions } from '../create-one-grid';
import type { ColumnDef, RowSource } from '@onegrid/core';

const aRowSource = (numRows: number): RowSource =>
  ({ numRows, getCell: () => '' }) as unknown as RowSource;
const aCol = (id: string): ColumnDef => ({ id, header: id, width: 100 }) as ColumnDef;

const flush = () => new Promise<void>((res) => queueMicrotask(res));

beforeEach(() => {
  constructorMock.mockReset();
  destroyMock.mockReset();
  setColumnsMock.mockReset();
  setRowSourceMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('@onegrid/solid — createOneGrid', () => {
  it('mounts when columns + rowSource are non-empty + host bound', async () => {
    const dispose = createRoot((d) => {
      const [opts] = createSignal<CreateOneGridOptions>({
        columns: [aCol('id'), aCol('name')],
        rowSource: aRowSource(10),
        rowHeight: 24,
      });
      const api = createOneGrid(opts);
      api.ref(document.createElement('div') as HTMLDivElement);
      return d;
    });
    await flush();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('does NOT mount when columns are empty', async () => {
    const dispose = createRoot((d) => {
      const [opts] = createSignal<CreateOneGridOptions>({
        columns: [],
        rowSource: aRowSource(10),
        rowHeight: 24,
      });
      const api = createOneGrid(opts);
      api.ref(document.createElement('div') as HTMLDivElement);
      return d;
    });
    await flush();
    expect(constructorMock).not.toHaveBeenCalled();
    dispose();
  });

  it('recreates the Grid when the column SHAPE changes', async () => {
    let setOpts!: (v: CreateOneGridOptions) => CreateOneGridOptions;
    const dispose = createRoot((d) => {
      const [opts, sett] = createSignal<CreateOneGridOptions>({
        columns: [aCol('id')],
        rowSource: aRowSource(5),
        rowHeight: 24,
      });
      setOpts = sett;
      const api = createOneGrid(opts);
      api.ref(document.createElement('div') as HTMLDivElement);
      return d;
    });
    await flush();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    setOpts({
      columns: [aCol('id'), aCol('name')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    });
    await flush();
    expect(destroyMock).toHaveBeenCalled();
    expect(constructorMock).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('destroys the Grid when the root scope disposes', async () => {
    const dispose = createRoot((d) => {
      const [opts] = createSignal<CreateOneGridOptions>({
        columns: [aCol('id')],
        rowSource: aRowSource(5),
        rowHeight: 24,
      });
      const api = createOneGrid(opts);
      api.ref(document.createElement('div') as HTMLDivElement);
      return d;
    });
    await flush();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    dispose();
    expect(destroyMock).toHaveBeenCalled();
  });
});
