// =============================================================================
// @onegrid/xlsx — SpreadsheetML readWorkbook / writeWorkbook (wave 22).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { readWorkbook, writeWorkbook, type Cell, type Sheet, type Workbook } from '../workbook';

const enc = new TextEncoder();
void enc;

describe('@onegrid/xlsx — writeWorkbook → readWorkbook round-trip', () => {
  it('round-trips a one-sheet workbook with mixed cell types', async () => {
    const cells: Cell[] = [
      { ref: 'A1', value: 42, type: 'n' },
      { ref: 'A2', value: 'hello', type: 's' },
      { ref: 'A3', value: true, type: 'b' },
      {
        ref: 'A4',
        value: 60,
        type: 'n',
        formula: 'SUM(A1:A1)',
        cachedValue: '60',
      },
    ];
    const wb: Workbook = {
      sheets: [{ name: 'Sheet1', sheetId: 1, cells }],
      date1904: false,
      opc: undefined as unknown as Workbook['opc'], // not consumed on write
    };
    const bytes = await writeWorkbook(wb);
    const reread = await readWorkbook(bytes);
    expect(reread.sheets.length).toBe(1);
    expect(reread.sheets[0]!.name).toBe('Sheet1');
    const sheet = reread.sheets[0]!;
    expect(sheet.cells.length).toBe(4);
    expect(sheet.cells.find((c) => c.ref === 'A1')?.value).toBe(42);
    expect(sheet.cells.find((c) => c.ref === 'A2')?.value).toBe('hello');
    expect(sheet.cells.find((c) => c.ref === 'A3')?.value).toBe(true);
    const a4 = sheet.cells.find((c) => c.ref === 'A4')!;
    expect(a4.formula).toBe('SUM(A1:A1)');
    expect(a4.formulaAst?.kind).toBe('call');
    expect(a4.cachedValue).toBe('60');
  });

  it('multi-sheet workbook preserves ordering and names', async () => {
    const sheets: Sheet[] = [
      { name: 'Alpha', sheetId: 1, cells: [{ ref: 'A1', value: 1, type: 'n' }] },
      { name: 'Beta', sheetId: 2, cells: [{ ref: 'A1', value: 2, type: 'n' }] },
      { name: 'Gamma', sheetId: 3, cells: [{ ref: 'A1', value: 3, type: 'n' }] },
    ];
    const bytes = await writeWorkbook({
      sheets,
      date1904: false,
      opc: undefined as unknown as Workbook['opc'],
    });
    const reread = await readWorkbook(bytes);
    expect(reread.sheets.map((s) => s.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(reread.sheets[0]!.cells[0]!.value).toBe(1);
    expect(reread.sheets[2]!.cells[0]!.value).toBe(3);
  });

  it('shared strings dedup: same string used in two cells maps to one entry', async () => {
    const wb: Workbook = {
      sheets: [
        {
          name: 'Sheet1',
          sheetId: 1,
          cells: [
            { ref: 'A1', value: 'shared', type: 's' },
            { ref: 'A2', value: 'shared', type: 's' },
            { ref: 'A3', value: 'unique', type: 's' },
          ],
        },
      ],
      date1904: false,
      opc: undefined as unknown as Workbook['opc'],
    };
    const bytes = await writeWorkbook(wb);
    const reread = await readWorkbook(bytes);
    const sstPart = reread.opc.getPart('xl/sharedStrings.xml');
    expect(sstPart?.text).toContain('count="2"');
    expect(sstPart?.text).toContain('shared');
    expect(sstPart?.text).toContain('unique');
  });

  it('date1904 flag round-trips', async () => {
    const bytes = await writeWorkbook({
      sheets: [{ name: 'S', sheetId: 1, cells: [] }],
      date1904: true,
      opc: undefined as unknown as Workbook['opc'],
    });
    const reread = await readWorkbook(bytes);
    expect(reread.date1904).toBe(true);
  });

  it('formula AST round-trip preserves the structure (not the literal text)', async () => {
    const wb: Workbook = {
      sheets: [
        {
          name: 'Sheet1',
          sheetId: 1,
          cells: [{ ref: 'A1', value: 11, type: 'n', formula: 'B1+B2*B3' }],
        },
      ],
      date1904: false,
      opc: undefined as unknown as Workbook['opc'],
    };
    const bytes = await writeWorkbook(wb);
    const reread = await readWorkbook(bytes);
    const cell = reread.sheets[0]!.cells[0]!;
    expect(cell.formulaAst?.kind).toBe('binary');
    expect(cell.formula).toBe('B1+B2*B3');
  });

  it('XML escapes in cell strings round-trip', async () => {
    const wb: Workbook = {
      sheets: [
        {
          name: 'Sheet1',
          sheetId: 1,
          cells: [{ ref: 'A1', value: 'a & b < c > d "e"', type: 's' }],
        },
      ],
      date1904: false,
      opc: undefined as unknown as Workbook['opc'],
    };
    const bytes = await writeWorkbook(wb);
    const reread = await readWorkbook(bytes);
    expect(reread.sheets[0]!.cells[0]!.value).toBe('a & b < c > d "e"');
  });
});

describe('@onegrid/xlsx — workbook resolution graph', () => {
  it('readWorkbook surfaces the OpcPackage for adopter access', async () => {
    const bytes = await writeWorkbook({
      sheets: [{ name: 'Sheet1', sheetId: 1, cells: [{ ref: 'A1', value: 1, type: 'n' }] }],
      date1904: false,
      opc: undefined as unknown as Workbook['opc'],
    });
    const wb = await readWorkbook(bytes);
    // Adopter can reach the raw worksheet XML.
    const sheet1 = wb.opc.getPart('xl/worksheets/sheet1.xml');
    expect(sheet1?.text).toContain('<c r="A1"');
  });
});
