// =============================================================================
// Cursor encoding / decoding for keyset pagination.
//
// Cursors are server-defined opaque strings to the client. Internally we
// encode the (sortValues, rowId) tuple as base64-encoded JSON. base64 keeps
// the cursor URL- and JSON-payload-safe. The decoder is tolerant of older
// cursor shapes (sortValues only, rowId only) so adapters can evolve without
// breaking existing clients mid-flight.
// =============================================================================

export interface KeysetCursor {
  readonly sortValues: ReadonlyArray<unknown>;
  readonly rowId: string | number;
}

export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify(cursor);
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(json);
  return Buffer.from(json, 'utf-8').toString('base64');
}

export function decodeCursor(cursor: string): KeysetCursor {
  let json: string;
  if (typeof globalThis.atob === 'function') {
    json = globalThis.atob(cursor);
  } else {
    json = Buffer.from(cursor, 'base64').toString('utf-8');
  }
  const parsed: unknown = JSON.parse(json);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { sortValues?: unknown }).sortValues) ||
    !('rowId' in parsed)
  ) {
    throw new Error('decodeCursor: malformed cursor payload.');
  }
  return parsed as KeysetCursor;
}
