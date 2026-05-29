// =============================================================================
// @onegrid/wc — <one-grid> custom element test.
//
// jsdom ships customElements + HTMLElement; Grid is stubbed via vi.mock
// so the spec runs without canvas / WebGL. Verifies the same
// imperative-update vs recreate semantics the other framework adapters
// guarantee.
// =============================================================================

// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { defineOneGridElement, ONE_GRID_TAG_NAME, OneGridElement } from '../index';
import type { OneGridElementOptions } from '../index';
import type { ColumnDef, RowSource } from '@onegrid/core';

const TAG = 'og-test-lifecycle';

beforeAll(() => {
  // Lifecycle tests share one registered tag. We can't re-register the
  // same OneGridElement constructor against different tags — the second
  // define() throws "already registered". The register-twice test below
  // uses a distinct tag and subclass.
  defineOneGridElement(TAG);
});

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
  // Re-register the element under a unique tag per test so multiple
  // tests don't trip the "tag already defined" error.
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('@onegrid/wc — defineOneGridElement', () => {
  it('exports the default tag name', () => {
    expect(ONE_GRID_TAG_NAME).toBe('one-grid');
  });

  it('register-twice is a no-op', () => {
    // Subclass: each custom-element constructor can only register
    // against one tag, so we make a fresh one to avoid colliding
    // with the lifecycle-tests tag.
    class OneGridTwiceElement extends OneGridElement {}
    const tag = 'og-test-register-twice';
    customElements.define(tag, OneGridTwiceElement);
    // Calling defineOneGridElement under the same tag must short-circuit.
    defineOneGridElement(tag);
    expect(customElements.get(tag)).toBe(OneGridTwiceElement);
  });
});

describe('@onegrid/wc — OneGridElement lifecycle', () => {
  it('mounts a Grid when options + connection arrive', () => {
    const el = document.createElement(TAG) as OneGridElement;
    el.options = {
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    } satisfies OneGridElementOptions;
    document.body.appendChild(el);
    expect(constructorMock).toHaveBeenCalledTimes(1);
    expect(el.grid).not.toBeNull();
    el.remove();
  });

  it('does NOT mount when columns are empty', () => {
    const el = document.createElement(TAG) as OneGridElement;
    el.options = {
      columns: [],
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    document.body.appendChild(el);
    expect(constructorMock).not.toHaveBeenCalled();
    el.remove();
  });

  it('calls setRowSource (no recreate) when only rowSource changes', () => {
    const el = document.createElement(TAG) as OneGridElement;
    el.options = {
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    document.body.appendChild(el);
    expect(constructorMock).toHaveBeenCalledTimes(1);
    el.options = {
      columns: [aCol('id')],
      rowSource: aRowSource(50),
      rowHeight: 24,
    };
    expect(setRowSourceMock).toHaveBeenCalledTimes(1);
    expect(constructorMock).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it('recreates the Grid when the column SHAPE changes', () => {
    const el = document.createElement(TAG) as OneGridElement;
    el.options = {
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    document.body.appendChild(el);
    expect(constructorMock).toHaveBeenCalledTimes(1);
    el.options = {
      columns: [aCol('id'), aCol('name')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    expect(destroyMock).toHaveBeenCalled();
    expect(constructorMock).toHaveBeenCalledTimes(2);
    el.remove();
  });

  it('destroys the Grid on disconnect', () => {
    const el = document.createElement(TAG) as OneGridElement;
    el.options = {
      columns: [aCol('id')],
      rowSource: aRowSource(5),
      rowHeight: 24,
    };
    document.body.appendChild(el);
    expect(constructorMock).toHaveBeenCalledTimes(1);
    el.remove();
    expect(destroyMock).toHaveBeenCalled();
    expect(el.grid).toBeNull();
  });
});
