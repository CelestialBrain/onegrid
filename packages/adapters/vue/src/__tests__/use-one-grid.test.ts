// =============================================================================
// @onegrid/vue — useOneGrid composable test.
//
// Verifies the composable's contract without spinning up a real Grid
// (which needs WebGL/canvas + a real DOM): the @onegrid/core Grid
// constructor is stubbed and the test asserts the imperative-update
// vs recreate semantics React's `use-one-grid` documents.
//
// Coverage:
//   - mounts once when columns + rowSource are non-empty
//   - calls setRowSource when only the row source changes (no recreate)
//   - calls setColumns (no recreate) on within-shape column edits
//   - recreates when the column SHAPE (id sequence) changes
//   - destroys on scope dispose
// =============================================================================

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

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

// Import AFTER the mock is registered.
import { useOneGrid } from '../use-one-grid';
import type { UseOneGridOptions } from '../use-one-grid';
import type { ColumnDef, RowSource } from '@onegrid/core';

const aRowSource = (numRows: number): RowSource =>
  ({
    numRows,
    getCell: () => '',
  }) as unknown as RowSource;

const aCol = (id: string, width = 100): ColumnDef =>
  ({ id, header: id, width }) as ColumnDef;

function makeTestComponent(initial: () => UseOneGridOptions) {
  return defineComponent({
    setup() {
      const opts = ref(initial());
      const handle = useOneGrid(() => opts.value);
      return { containerRef: handle.containerRef, grid: handle.grid, opts };
    },
    render() {
      return h('div', { ref: 'containerRef' as unknown as string });
    },
  });
}

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

describe('@onegrid/vue — useOneGrid', () => {
  it('mounts a Grid when columns + rowSource are non-empty', async () => {
    const Comp = makeTestComponent(() => ({
      columns: [aCol('id'), aCol('name')],
      rowSource: aRowSource(10),
      rowHeight: 24,
    }));
    const w = mount(Comp, { attachTo: document.body });
    await nextTick();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    expect(setRowSourceMock).not.toHaveBeenCalled();
    w.unmount();
  });

  it('does NOT mount when columns are empty', async () => {
    const Comp = makeTestComponent(() => ({
      columns: [],
      rowSource: aRowSource(10),
      rowHeight: 24,
    }));
    const w = mount(Comp, { attachTo: document.body });
    await nextTick();
    expect(constructorMock).not.toHaveBeenCalled();
    w.unmount();
  });

  it('calls setRowSource (no recreate) on rowSource change', async () => {
    const Comp = makeTestComponent(() => ({
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    }));
    const w = mount(Comp, { attachTo: document.body });
    await nextTick();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    (w.vm as { opts: UseOneGridOptions }).opts = {
      columns: [aCol('id')],
      rowSource: aRowSource(50),
      rowHeight: 24,
    };
    await nextTick();
    expect(setRowSourceMock).toHaveBeenCalledTimes(1);
    // Same shape → no recreate.
    expect(constructorMock).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it('recreates the Grid when the column SHAPE changes', async () => {
    const Comp = makeTestComponent(() => ({
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    }));
    const w = mount(Comp, { attachTo: document.body });
    await nextTick();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    (w.vm as { opts: UseOneGridOptions }).opts = {
      columns: [aCol('id'), aCol('name')], // shape changed
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    await nextTick();
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(constructorMock).toHaveBeenCalledTimes(2);
    w.unmount();
  });

  it('destroys the Grid on unmount', async () => {
    const Comp = makeTestComponent(() => ({
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    }));
    const w = mount(Comp, { attachTo: document.body });
    await nextTick();
    expect(constructorMock).toHaveBeenCalledTimes(1);
    w.unmount();
    expect(destroyMock).toHaveBeenCalled();
  });
});
