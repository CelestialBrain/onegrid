// =============================================================================
// @onegrid/svelte — createOneGrid factory test.
//
// Drives the factory directly (no Svelte runtime needed because the
// adapter intentionally exposes an imperative API). Grid is stubbed
// via vi.mock so the spec runs without canvas / WebGL.
// =============================================================================

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const destroyMock = vi.fn();
const setColumnsMock = vi.fn();
const setRowSourceMock = vi.fn();
const setPinnedTopMock = vi.fn();
const setPinnedBottomMock = vi.fn();
const constructorMock = vi.fn();

vi.mock('@onegrid/core', () => ({
  Grid: class {
    constructor(opts: unknown) {
      constructorMock(opts);
    }
    destroy = destroyMock;
    setColumns = setColumnsMock;
    setRowSource = setRowSourceMock;
    setPinnedTopRowSource = setPinnedTopMock;
    setPinnedBottomRowSource = setPinnedBottomMock;
  },
}));

import { createOneGrid } from '../create-one-grid';
import type { CreateOneGridOptions } from '../create-one-grid';
import type { ColumnDef, RowSource } from '@onegrid/core';

const aRowSource = (numRows: number): RowSource =>
  ({ numRows, getCell: () => '' }) as unknown as RowSource;
const aCol = (id: string): ColumnDef => ({ id, header: id, width: 100 }) as ColumnDef;

beforeEach(() => {
  constructorMock.mockReset();
  destroyMock.mockReset();
  setColumnsMock.mockReset();
  setRowSourceMock.mockReset();
  setPinnedTopMock.mockReset();
  setPinnedBottomMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('@onegrid/svelte — createOneGrid', () => {
  it('mounts when attach is called with a non-empty config', () => {
    const api = createOneGrid({
      columns: [aCol('id')],
      rowSource: aRowSource(10),
      rowHeight: 24,
    });
    const node = document.createElement('div');
    api.attach(node);
    expect(constructorMock).toHaveBeenCalledTimes(1);
    expect(get(api.grid)).not.toBeNull();
  });

  it('does NOT mount when columns are empty', () => {
    const api = createOneGrid({
      columns: [],
      rowSource: aRowSource(10),
      rowHeight: 24,
    });
    api.attach(document.createElement('div'));
    expect(constructorMock).not.toHaveBeenCalled();
  });

  it('calls setRowSource (no recreate) on rowSource change via setOptions', () => {
    const initial: CreateOneGridOptions = {
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    const api = createOneGrid(initial);
    api.attach(document.createElement('div'));
    expect(constructorMock).toHaveBeenCalledTimes(1);
    api.setOptions({
      columns: [aCol('id')],
      rowSource: aRowSource(50),
      rowHeight: 24,
    });
    expect(setRowSourceMock).toHaveBeenCalledTimes(1);
    expect(constructorMock).toHaveBeenCalledTimes(1);
  });

  it('recreates the Grid when the column SHAPE changes via setOptions', () => {
    const api = createOneGrid({
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    });
    api.attach(document.createElement('div'));
    expect(constructorMock).toHaveBeenCalledTimes(1);
    api.setOptions({
      columns: [aCol('id'), aCol('name')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    });
    expect(destroyMock).toHaveBeenCalled();
    expect(constructorMock).toHaveBeenCalledTimes(2);
  });

  it('attach action destroy cleans up the Grid', () => {
    const api = createOneGrid({
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    });
    const { destroy } = api.attach(document.createElement('div'));
    expect(constructorMock).toHaveBeenCalledTimes(1);
    destroy();
    expect(destroyMock).toHaveBeenCalled();
    expect(get(api.grid)).toBeNull();
  });
});
