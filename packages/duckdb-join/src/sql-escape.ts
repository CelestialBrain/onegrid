// =============================================================================
// SQL escape helpers for the duckdb-join cross-source composition layer.
//
// Internal — NOT exported through src/index.ts so the api surface
// stays unchanged. The fuzz harness imports these directly to assert
// the two escape contracts the SECURITY threat model relies on:
//
//   - escapeIdent: every double-quote in the input is doubled. When
//     the result is wrapped in `"..."`, the identifier is safely
//     quoted even for adversarial input.
//   - sqlLiteral: literal values are typed (NULL / TRUE / FALSE /
//     finite number / TIMESTAMP / 'string-with-doubled-apostrophes')
//     and never include an unescaped single quote in the string path.
// =============================================================================

export function escapeIdent(name: string): string {
  return name.replace(/"/g, '""');
}

export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `TIMESTAMP '${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
