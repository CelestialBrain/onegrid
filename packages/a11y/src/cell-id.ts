// =============================================================================
// Cell-id helpers.
//
// `aria-activedescendant` on the grid root must point at a stable id of
// the active cell's a11y shadow node. Keep id construction in a shared
// utility so the renderer (which mounts cells) and any consumer that
// drives focus programmatically agree on the format.
// =============================================================================

/** Build the canonical cell id for a (gridId, row, col) tuple. */
export function ariaCellId(gridId: string, row: number, col: number): string {
  return `${gridId}-r${String(row)}-c${String(col)}`;
}

/** Inverse of ariaCellId. Returns null if the input doesn't match the
 *  expected shape (e.g. a generated id outside this convention). */
export function parseAriaCellId(
  id: string,
): { gridId: string; row: number; col: number } | null {
  // Match anywhere in the string for forward-compat with prefixed ids.
  const m = /^(.*)-r(\d+)-c(\d+)$/.exec(id);
  if (!m) return null;
  const gridId = m[1] ?? '';
  const row = Number(m[2]);
  const col = Number(m[3]);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return { gridId, row, col };
}
