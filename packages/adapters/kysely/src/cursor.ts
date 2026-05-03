// Cursor encoding shared with the Drizzle adapter — same shape, same wire
// representation, so a server using one adapter can serve clients using
// the other transparently.

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
