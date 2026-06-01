// =============================================================================
// @onegrid/formula — v1.1.0 wave 18: structured table refs + named ranges.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createFormulaEngine, parseFormula } from '..';
import type { CellResolver } from '../evaluator';

// A tiny in-memory table fixture. Adopters typically wire `getTable` to
// their column store (Arrow, Drizzle rows, etc.); for tests we use literal
// arrays.
const tables: Record<
  string,
  { headers: string[]; rows: number[][]; totals?: number[] }
> = {
  Sales: {
    headers: ['Q', 'Amount'],
    rows: [
      [1, 100],
      [2, 200],
      [3, 300],
      [4, 400],
    ],
    totals: [4, 1000],
  },
};

const named: Record<string, unknown> = {
  TaxRate: 0.1,
  Hello: 'world',
  Budget: [[100], [200], [300]],
};

const cells: Record<string, unknown> = { A1: 5, A2: 10 };
const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: () => [],
  getTable: (table, column, selector) => {
    const t = tables[table];
    if (!t) return undefined;
    const colIdx = column !== undefined ? t.headers.indexOf(column) : -1;
    if (column !== undefined && colIdx < 0) return undefined;
    switch (selector) {
      case 'headers':
        return colIdx >= 0 ? t.headers[colIdx] : t.headers;
      case 'totals':
        return colIdx >= 0 ? t.totals?.[colIdx] : t.totals;
      case 'thisRow':
        // No caller-row context in tests; degrade to first data row.
        return colIdx >= 0 ? t.rows[0]?.[colIdx] : t.rows[0];
      case 'all':
        return [t.headers, ...t.rows, t.totals ?? []];
      case 'data':
      default:
        return colIdx >= 0 ? t.rows.map((r) => r[colIdx]) : t.rows;
    }
  },
  getNamedRange: (name) => (name in named ? named[name] : undefined),
};

const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 18 — tokenizer + parser', () => {
  it('Table1[Column] parses as tableRef', () => {
    const ast = parseFormula('=Sales[Amount]');
    expect(ast.kind).toBe('tableRef');
    if (ast.kind === 'tableRef') {
      expect(ast.table).toBe('Sales');
      expect(ast.column).toBe('Amount');
      expect(ast.selector).toBe('data');
    }
  });
  it('Table1[@Column] parses with thisRow selector', () => {
    const ast = parseFormula('=Sales[@Amount]');
    expect(ast.kind).toBe('tableRef');
    if (ast.kind === 'tableRef') expect(ast.selector).toBe('thisRow');
  });
  it('Table1[#Headers] parses with headers selector', () => {
    const ast = parseFormula('=Sales[#Headers]');
    expect(ast.kind).toBe('tableRef');
    if (ast.kind === 'tableRef') {
      expect(ast.selector).toBe('headers');
      expect(ast.column).toBeUndefined();
    }
  });
  it('Table1[[#All],[Column]] parses with all+column', () => {
    const ast = parseFormula('=Sales[[#All],[Amount]]');
    expect(ast.kind).toBe('tableRef');
    if (ast.kind === 'tableRef') {
      expect(ast.selector).toBe('all');
      expect(ast.column).toBe('Amount');
    }
  });
});

describe('@onegrid/formula — wave 18 — evaluation', () => {
  it('SUM(Sales[Amount]) sums the column', () => {
    expect(ev('=SUM(Sales[Amount])')).toBe(1000);
  });
  it('Sales[#Headers] returns the header row', () => {
    expect(ev('=Sales[#Headers]')).toEqual(['Q', 'Amount']);
  });
  it('Sales[#Totals] returns the totals row', () => {
    expect(ev('=Sales[#Totals]')).toEqual([4, 1000]);
  });
  it('Sales[@Amount] returns first-row amount (degraded thisRow)', () => {
    expect(ev('=Sales[@Amount]')).toBe(100);
  });
  it('unknown table → #REF!', () => {
    const r = ev('=Unknown[Col]') as { code?: string };
    expect(r?.code).toBe('#REF!');
  });
  it('unknown column → #REF!', () => {
    const r = ev('=Sales[Nope]') as { code?: string };
    expect(r?.code).toBe('#REF!');
  });
});

describe('@onegrid/formula — wave 18 — named ranges', () => {
  it('named range scalar resolves', () => {
    expect(ev('=TaxRate')).toBe(0.1);
  });
  it('named range string resolves', () => {
    expect(ev('=Hello')).toBe('world');
  });
  it('named range used in arithmetic', () => {
    expect(ev('=100 * TaxRate')).toBe(10);
  });
  it('named range used in higher-order: SUM(Budget)', () => {
    expect(ev('=SUM(Budget)')).toBe(600);
  });
  it('LET binding shadows named range', () => {
    expect(ev('=LET(TaxRate, 0.5, 100 * TaxRate)')).toBe(50);
  });
  it('unknown name → #NAME?', () => {
    const r = ev('=Nope') as { code?: string };
    expect(r?.code).toBe('#NAME?');
  });
});

describe('@onegrid/formula — wave 18 — composition with earlier waves', () => {
  it('REDUCE over a table column', () => {
    expect(ev('=REDUCE(0, Sales[Amount], LAMBDA(a, v, a+v))')).toBe(1000);
  });
  it('MAP over a table column', () => {
    // Sales[Amount] = [100,200,300,400] (1D). MAP wraps each as a 1-cell
    // row → [[200],[400],[600],[800]].
    expect(ev('=MAP(Sales[Amount], LAMBDA(x, x*2))')).toEqual([
      [200], [400], [600], [800],
    ]);
  });
});
