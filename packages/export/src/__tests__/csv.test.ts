import { describe, expect, it } from 'vitest';
import { exportToCsv } from '../csv';
import type { ExportColumn } from '../types';

const columns: ExportColumn[] = [
  { id: 'id', header: '#' },
  { id: 'name', header: 'Name' },
  { id: 'revenue', header: 'Revenue' },
];

describe('exportToCsv', () => {
  it('emits header and data rows', () => {
    const rows = [
      { id: 1, name: 'Alice', revenue: 100 },
      { id: 2, name: 'Bob', revenue: 200 },
    ];
    const csv = exportToCsv(rows, columns);
    expect(csv).toBe('#,Name,Revenue\r\n1,Alice,100\r\n2,Bob,200');
  });

  it('escapes cells containing the separator', () => {
    const rows = [{ id: 1, name: 'Smith, John', revenue: 50 }];
    const csv = exportToCsv(rows, columns);
    expect(csv.split('\r\n')[1]).toBe('1,"Smith, John",50');
  });

  it('escapes quotes by doubling', () => {
    const rows = [{ id: 1, name: 'She said "hi"', revenue: 0 }];
    const csv = exportToCsv(rows, columns);
    expect(csv.split('\r\n')[1]).toBe('1,"She said ""hi""",0');
  });

  it('escapes embedded newlines', () => {
    const rows = [{ id: 1, name: 'line1\nline2', revenue: 0 }];
    const csv = exportToCsv(rows, columns);
    expect(csv.split('\r\n')[1]).toBe('1,"line1\nline2",0');
  });

  it('honors a custom delimiter', () => {
    const rows = [{ id: 1, name: 'Alice', revenue: 100 }];
    const csv = exportToCsv(rows, columns, { delimiter: ';' });
    expect(csv).toBe('#;Name;Revenue\r\n1;Alice;100');
  });

  it('prepends a BOM when requested', () => {
    const csv = exportToCsv([{ id: 1 }], [{ id: 'id', header: '#' }], { bom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('omits the header when configured', () => {
    const rows = [{ id: 1, name: 'Alice', revenue: 100 }];
    const csv = exportToCsv(rows, columns, { omitHeader: true });
    expect(csv).toBe('1,Alice,100');
  });

  it('formats Date values via toISOString by default', () => {
    const d = new Date('2026-05-03T12:00:00Z');
    const csv = exportToCsv([{ id: d }], [{ id: 'id', header: 'date' }]);
    expect(csv.split('\r\n')[1]).toBe('2026-05-03T12:00:00.000Z');
  });

  it('uses column.format when provided', () => {
    const cols: ExportColumn[] = [
      { id: 'amount', header: 'Amount', format: (v) => `$${String(v as number)}` },
    ];
    const csv = exportToCsv([{ amount: 42 }], cols);
    expect(csv.split('\r\n')[1]).toBe('$42');
  });

  it('treats null and undefined as empty', () => {
    const csv = exportToCsv(
      [{ id: null, name: undefined, revenue: 0 }],
      columns,
      { emitEmptyRows: true },
    );
    expect(csv.split('\r\n')[1]).toBe(',,0');
  });
});
