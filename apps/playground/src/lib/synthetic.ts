/**
 * Synthetic dataset generator. Returns oneGrid-shaped ColumnDef[] + RowSource
 * + per-row heights so the playground can stress the same memory model
 * the real engine uses.
 *
 * Deterministic, seeded by row index so the data is reproducible across
 * benchmark runs.
 */

import type { ColumnDef, RowSource } from '@onegrid/react';

export interface SyntheticDataset {
  readonly columns: ReadonlyArray<ColumnDef>;
  readonly rowSource: RowSource;
  readonly heights: Float32Array;
}

const FIRST_NAMES = [
  'Aiko', 'Bashir', 'Camila', 'Dmitri', 'Elena', 'Farhan', 'Gabriela', 'Hideki',
  'Imani', 'Jin', 'Kalani', 'Lior', 'Maya', 'Nadir', 'Olamide', 'Priya',
  'Quentin', 'Ravi', 'Saskia', 'Tomás', 'Uma', 'Viktor', 'Wren', 'Xiomara',
  'Yara', 'Zane',
];

const LAST_NAMES = [
  'Adeyemi', 'Bukowski', 'Chen', 'Dvorak', 'Eriksen', 'Fitzgerald', 'Garibay',
  'Halevi', 'Ivanova', 'Jónsson', 'Kapur', 'Lindqvist', 'Mokoena', 'Nakamura',
  'Okonkwo', 'Petrov', 'Quesada', 'Rinaldi', 'Saito', 'Tahir', 'Ueda', 'Vargas',
  'Watanabe', 'Xu', 'Yusuf', 'Zografos',
];

const STATUSES = ['active', 'pending', 'archived', 'pilot', 'churned'] as const;

const STATUS_COLORS: Record<(typeof STATUSES)[number], string> = {
  active: '#62d68a',
  pending: '#f4c768',
  archived: '#7f8893',
  pilot: '#6ea8fe',
  churned: '#e56f6f',
};

/**
 * 30% of rows are tall (40 px), 70% short (24 px) so the FenwickHeights
 * variable-height path is exercised at every scroll.
 */
export function generateSynthetic(numRows: number): SyntheticDataset {
  const heights = new Float32Array(numRows);
  for (let i = 0; i < numRows; i++) {
    heights[i] = i % 10 < 3 ? 40 : 24;
  }

  const columns: ReadonlyArray<ColumnDef> = [
    {
      id: 'rowIndex',
      width: 80,
      displayName: '#',
      format: (_v, i) => i.toString(),
      color: () => '#8b929c',
    },
    {
      id: 'firstName',
      width: 130,
      displayName: 'First name',
      format: (_v, i) => FIRST_NAMES[i % FIRST_NAMES.length] ?? '',
    },
    {
      id: 'lastName',
      width: 150,
      displayName: 'Last name',
      format: (_v, i) => LAST_NAMES[(i * 17) % LAST_NAMES.length] ?? '',
    },
    {
      id: 'revenue',
      width: 130,
      displayName: 'Revenue',
      format: (_v, i) => {
        const v = ((i * 1009) % 1_000_000) / 100;
        return `$${v.toFixed(2)}`;
      },
    },
    {
      id: 'status',
      width: 110,
      displayName: 'Status',
      format: (_v, i) => STATUSES[i % STATUSES.length] ?? 'active',
      color: (_v, i) => STATUS_COLORS[STATUSES[i % STATUSES.length] ?? 'active'],
    },
    {
      id: 'score',
      width: 90,
      displayName: 'Score',
      format: (_v, i) => ((i * 31) % 100).toString(),
    },
    {
      id: 'updatedAt',
      width: 170,
      displayName: 'Updated',
      format: (_v, i) => {
        const t = 1_700_000_000_000 + i * 60_000;
        return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
      },
    },
  ];

  const rowSource: RowSource = {
    numRows,
    // Cell value is the row index itself; the column's format() does the lookup.
    // This keeps the synthetic dataset allocation-free at any size.
    getCell: (rowIndex) => rowIndex,
  };

  return { columns, rowSource, heights };
}
