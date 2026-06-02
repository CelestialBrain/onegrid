// =============================================================================
// Formula + .xlsx — drag a workbook in, see formulas parsed and evaluated.
// =============================================================================

import { useMemo, useState, type JSX } from 'react';
import {
  createFormulaEngine,
  parseFormula,
  type CellResolver,
} from '@onegrid/formula';
import { Btn, Card, Mono, Output } from '../ui';

const SAMPLE_FORMULAS = [
  '=SUM(1, 2, 3, 4, 5)',
  '=LET(x, 5, y, x+1, x*y)',
  '=REDUCE(0, A1:A5, LAMBDA(a, v, a+v))',
  '=BYROW(A1:B3, LAMBDA(r, SUM(r)))',
  '=MAP(A1:A3, LAMBDA(x, x*2))',
  '=MAKEARRAY(3, 3, LAMBDA(r, c, r*c))',
  '=IFS(A1>50, "high", A1>20, "mid", TRUE, "low")',
  '=REGEX.EXTRACT("foo:42", "(\\w+):(\\d+)", 2)',
  '=OFFSET(A1, 2, 0)',
  '=INDIRECT("A" & "1")',
  '=Sales[Amount]',
  '=Table1[#Headers]',
  '=DATEDIF(DATE(2020,1,1), DATE(2024,6,15), "M")',
  '=PMT(0.05/12, 360, -250000)',
  '=BIN2HEX("11111111")',
  '=BAHTTEXT(125)',
  '=JIS("hello")',
];

const CELLS: Record<string, unknown> = {
  A1: 10, A2: 20, A3: 30, A4: 40, A5: 50,
  B1: 100, B2: 200, B3: 300,
};

const RANGES: Record<string, ReadonlyArray<unknown>> = {
  'A1:A3': [10, 20, 30],
  'A1:A5': [10, 20, 30, 40, 50],
  'A1:B3': [[10, 100], [20, 200], [30, 300]],
  'B1:B3': [100, 200, 300],
};

const TABLES: Record<string, { headers: string[]; rows: number[][] }> = {
  Sales: {
    headers: ['Q', 'Amount'],
    rows: [[1, 100], [2, 200], [3, 300], [4, 400]],
  },
  Table1: {
    headers: ['Col1', 'Col2'],
    rows: [[1, 2], [3, 4]],
  },
};

export function FormulaXlsxTab(): JSX.Element {
  const [formula, setFormula] = useState(SAMPLE_FORMULAS[0]!);
  const [showAst, setShowAst] = useState(false);
  const engine = useMemo(() => createFormulaEngine(), []);

  const resolver = useMemo<CellResolver>(() => ({
    getCell: (ref) => CELLS[ref] ?? null,
    getRange: (ref) => RANGES[ref] ?? [],
    getTable: (table, column, selector) => {
      const t = TABLES[table];
      if (!t) return undefined;
      const idx = column !== undefined ? t.headers.indexOf(column) : -1;
      switch (selector) {
        case 'headers':
          return idx >= 0 ? t.headers[idx] : t.headers;
        case 'data':
        default:
          return idx >= 0 ? t.rows.map((r) => r[idx]) : t.rows;
      }
    },
  }), []);

  const result = useMemo(() => {
    try {
      return engine.evaluate(formula, resolver);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [engine, formula, resolver]);

  const ast = useMemo(() => {
    if (!showAst) return null;
    try {
      return parseFormula(formula);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [formula, showAst]);

  return (
    <div>
      <Card title="Formula bar">
        <input
          type="text"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            padding: '6px 10px',
            borderRadius: 4,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 13,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>result:</span>
          <Mono>{JSON.stringify(result)}</Mono>
          <span style={{ flex: 1 }} />
          <Btn onClick={() => setShowAst((v) => !v)}>
            {showAst ? 'Hide' : 'Show'} AST
          </Btn>
        </div>
        {showAst && ast && (
          <div style={{ marginTop: 8 }}>
            <Output>{JSON.stringify(ast, null, 2)}</Output>
          </div>
        )}
      </Card>

      <Card title="Sample formulas (click to load)">
        <div style={{ display: 'grid', gap: 4 }}>
          {SAMPLE_FORMULAS.map((f) => (
            <button
              key={f}
              onClick={() => setFormula(f)}
              style={{
                background: f === formula ? 'var(--accent)' : 'var(--panel)',
                color: f === formula ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
                padding: '4px 8px',
                borderRadius: 3,
                textAlign: 'left',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Available cells / ranges / tables">
        <Output>
{`cells:   ${Object.entries(CELLS).map(([k, v]) => `${k}=${v}`).join(', ')}
ranges:  ${Object.keys(RANGES).join(', ')}
tables:  ${Object.entries(TABLES).map(([n, t]) => `${n}[${t.headers.join(', ')}]`).join(', ')}`}
        </Output>
      </Card>
    </div>
  );
}
