// =============================================================================
// Export — CSV + XLSX export buttons, hitting @onegrid/export + @onegrid/xlsx.
// =============================================================================

import { useState, type JSX } from 'react';
import * as exportPkg from '@onegrid/export';
import { writeWorkbook, type Workbook, type Cell } from '@onegrid/xlsx';
import { Btn, Card, Mono, Output } from '../ui';

const SAMPLE_ROWS = [
  { id: 1, name: 'Alpha', score: 87, status: 'active' },
  { id: 2, name: 'Beta', score: 64, status: 'paused' },
  { id: 3, name: 'Gamma', score: 92, status: 'active' },
  { id: 4, name: 'Delta', score: 51, status: 'archived' },
  { id: 5, name: 'Epsilon', score: 78, status: 'active' },
];

const COLUMNS = ['id', 'name', 'score', 'status'] as const;

export function ExportTab(): JSX.Element {
  const [lastAction, setLastAction] = useState<string>('(no export yet)');

  async function exportCsv() {
    const lines: string[] = [];
    lines.push(COLUMNS.join(','));
    for (const row of SAMPLE_ROWS) {
      lines.push(COLUMNS.map((c) => String(row[c])).join(','));
    }
    const csv = lines.join('\n');
    download('export.csv', new Blob([csv], { type: 'text/csv' }));
    setLastAction(`csv exported (${csv.length} bytes, ${SAMPLE_ROWS.length} rows)`);
  }

  async function exportXlsx() {
    const cells: Cell[] = [];
    // Header row
    COLUMNS.forEach((col, ci) => {
      cells.push({ ref: refOf(0, ci), value: col, type: 's' });
    });
    // Data rows
    SAMPLE_ROWS.forEach((row, ri) => {
      COLUMNS.forEach((col, ci) => {
        const v = row[col];
        if (typeof v === 'number') {
          cells.push({ ref: refOf(ri + 1, ci), value: v, type: 'n' });
        } else {
          cells.push({ ref: refOf(ri + 1, ci), value: String(v), type: 's' });
        }
      });
    });
    // Add a SUM formula in the last row
    cells.push({
      ref: refOf(SAMPLE_ROWS.length + 1, 2),
      value: SAMPLE_ROWS.reduce((s, r) => s + r.score, 0),
      type: 'n',
      formula: `SUM(C2:C${SAMPLE_ROWS.length + 1})`,
      cachedValue: String(SAMPLE_ROWS.reduce((s, r) => s + r.score, 0)),
    });
    const wb: Workbook = {
      sheets: [{ name: 'Export', sheetId: 1, cells }],
      date1904: false,
      opc: undefined as unknown as Workbook['opc'],
    };
    const bytes = await writeWorkbook(wb);
    download('export.xlsx', new Blob([bytes.buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    setLastAction(`xlsx exported (${bytes.length} bytes, ${cells.length} cells incl. SUM formula)`);
  }

  return (
    <div>
      <Card title="Data to export">
        <Output>{COLUMNS.join('\t') + '\n' + SAMPLE_ROWS.map((r) => COLUMNS.map((c) => r[c]).join('\t')).join('\n')}</Output>
      </Card>

      <Card title="Export">
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={exportCsv}>Download CSV</Btn>
          <Btn onClick={exportXlsx}>Download XLSX (with SUM formula)</Btn>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          <Mono>{lastAction}</Mono>
        </div>
      </Card>

      <Card title="Package exports">
        <Output>@onegrid/export: {Object.keys(exportPkg).sort().join(', ')}</Output>
      </Card>
    </div>
  );
}

function refOf(row: number, col: number): string {
  let n = col + 1;
  let letters = '';
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row + 1}`;
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
