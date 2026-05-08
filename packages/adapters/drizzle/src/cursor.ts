// =============================================================================
// Cursor encoding / decoding for keyset pagination.
//
// Wire format aligns with the canonical codec in `@onegrid/ssrm`:
//
//   ks:<base64-of-utf8-of-json({s: sortValues, r: rowId}))>
//
// The `ks:` prefix is the version sentinel — future cursor formats can
// ship behind a different prefix without breaking existing clients
// (they'll throw on decode, the consumer migrates at their own pace).
// Decoder is tolerant of older payload shapes (long-form `sortValues`
// / `rowId` keys, no prefix) so cursors emitted by pre-v0.0.8 versions
// of this adapter still round-trip cleanly.
//
// This file is intentionally a self-contained copy rather than a
// re-export from `@onegrid/ssrm` — adapters depend only on
// `@onegrid/protocol` per the architectural guardrail in
// CONTRIBUTING.md. Same wire format, no extra runtime dependency.
// =============================================================================

const KEYSET_PREFIX = 'ks:';

export interface KeysetCursor {
  readonly sortValues: ReadonlyArray<unknown>;
  readonly rowId: string | number;
}

export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({ s: cursor.sortValues, r: cursor.rowId });
  const b64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(json)
      : Buffer.from(json, 'utf-8').toString('base64');
  return KEYSET_PREFIX + b64;
}

export function decodeCursor(cursor: string): KeysetCursor {
  const b64 = cursor.startsWith(KEYSET_PREFIX)
    ? cursor.slice(KEYSET_PREFIX.length)
    : cursor;
  let json: string;
  if (typeof globalThis.atob === 'function') {
    json = globalThis.atob(b64);
  } else {
    json = Buffer.from(b64, 'base64').toString('utf-8');
  }
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('decodeCursor: malformed cursor payload.');
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.s) && 'r' in obj) {
    return { sortValues: obj.s, rowId: obj.r as string | number };
  }
  if (Array.isArray(obj.sortValues) && 'rowId' in obj) {
    return {
      sortValues: obj.sortValues,
      rowId: obj.rowId as string | number,
    };
  }
  throw new Error('decodeCursor: malformed cursor payload.');
}
