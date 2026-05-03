/**
 * Synthetic dataset generator. Columnar (Struct-of-Arrays) layout so we can
 * stress the same memory model the real engine will use.
 *
 * No Arrow JS dependency yet — that's Spike B's concern. Plain typed arrays
 * are enough to validate canvas + Fenwick FPS.
 */

export interface SyntheticDataset {
  readonly numRows: number;
  readonly columns: ReadonlyArray<SyntheticColumn>;
  readonly heights: Float32Array;
}

export interface SyntheticColumn {
  readonly id: string;
  readonly displayName: string;
  readonly width: number;
  readonly type: 'int' | 'float' | 'string' | 'bool' | 'date';
  /** Format the cell at row index → display string. */
  readonly format: (rowIndex: number) => string;
  /** Optional per-cell foreground color. */
  readonly color?: (rowIndex: number) => string | undefined;
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
 * Deterministic synthetic generator (seeded by row index). 30% of rows are
 * tall (40 px) to exercise the Fenwick variable-height path; the rest are
 * compact (24 px).
 */
export function generateSynthetic(numRows: number): SyntheticDataset {
  const heights = new Float32Array(numRows);
  for (let i = 0; i < numRows; i++) {
    heights[i] = i % 10 < 3 ? 40 : 24;
  }

  const columns: SyntheticColumn[] = [
    {
      id: 'rowIndex',
      displayName: '#',
      width: 80,
      type: 'int',
      format: (i) => i.toString(),
      color: () => '#8b929c',
    },
    {
      id: 'firstName',
      displayName: 'First name',
      width: 130,
      type: 'string',
      format: (i) => FIRST_NAMES[i % FIRST_NAMES.length] ?? '',
    },
    {
      id: 'lastName',
      displayName: 'Last name',
      width: 150,
      type: 'string',
      format: (i) => LAST_NAMES[(i * 17) % LAST_NAMES.length] ?? '',
    },
    {
      id: 'revenue',
      displayName: 'Revenue',
      width: 130,
      type: 'float',
      format: (i) => {
        const v = ((i * 1009) % 1_000_000) / 100;
        return `$${v.toFixed(2)}`;
      },
    },
    {
      id: 'status',
      displayName: 'Status',
      width: 110,
      type: 'string',
      format: (i) => STATUSES[i % STATUSES.length] ?? 'active',
      color: (i) => STATUS_COLORS[STATUSES[i % STATUSES.length] ?? 'active'],
    },
    {
      id: 'score',
      displayName: 'Score',
      width: 90,
      type: 'int',
      format: (i) => ((i * 31) % 100).toString(),
    },
    {
      id: 'updatedAt',
      displayName: 'Updated',
      width: 170,
      type: 'date',
      format: (i) => {
        const t = 1_700_000_000_000 + i * 60_000;
        return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
      },
    },
  ];

  return { numRows, columns, heights };
}
