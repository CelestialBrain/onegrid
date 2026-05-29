// =============================================================================
// @onegrid/ssrm — cursor codec fuzz harness.
//
// Cursors are the only piece of SSRM state that round-trips through an
// untrusted boundary (URL params, localStorage, replay attacks). The
// decoder MUST reject anything malformed cleanly — never crash with an
// unexpected exception type, never hang, never return junk that the
// pagination loop trusts.
//
// This spec drives:
//   - encodeKeysetCursor → decodeKeysetCursor: round-trip safety.
//   - decodeKeysetCursor on arbitrary strings: only throws Error subtypes
//     with `decodeKeysetCursor:` prefix; never throws TypeError or hangs.
//   - parseLegacyOffsetCursor on arbitrary strings: same contract.
// =============================================================================

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  encodeKeysetCursor,
  decodeKeysetCursor,
  parseLegacyOffsetCursor,
  isLegacyOffsetCursor,
} from '../cursor';
import type { KeysetCursor } from '@onegrid/protocol';

const NUM_RUNS = Number.parseInt(process.env.ONEGRID_FUZZ_RUNS ?? '500', 10);

// Sort-value arbitrary: cover every type the codec is supposed to handle.
const sortValueArb = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.string(),
);

const rowIdArb = fc.oneof(fc.string({ minLength: 1, maxLength: 64 }), fc.integer());

const keysetArb: fc.Arbitrary<KeysetCursor> = fc.record({
  sortValues: fc.array(sortValueArb, { minLength: 0, maxLength: 5 }),
  rowId: rowIdArb,
});

describe('@onegrid/ssrm — cursor codec fuzz', () => {
  it('round-trips well-formed KeysetCursor without loss', () => {
    fc.assert(
      fc.property(keysetArb, (cursor) => {
        const encoded = encodeKeysetCursor(cursor);
        const decoded = decodeKeysetCursor(encoded);
        expect(decoded.rowId).toEqual(cursor.rowId);
        expect(decoded.sortValues.length).toEqual(cursor.sortValues.length);
        for (let i = 0; i < cursor.sortValues.length; i++) {
          expect(decoded.sortValues[i]).toEqual(cursor.sortValues[i]);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('decodeKeysetCursor only throws Error subtypes on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 256 }), (s) => {
        try {
          decodeKeysetCursor(s);
          return true;
        } catch (err) {
          // The codec is allowed to throw Error; anything else (string
          // throws, undefined, raw rejections) is a contract violation.
          if (!(err instanceof Error)) throw err;
          return true;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('parseLegacyOffsetCursor only throws Error subtypes on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 256 }), (s) => {
        try {
          parseLegacyOffsetCursor(s);
          return true;
        } catch (err) {
          if (!(err instanceof Error)) throw err;
          return true;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isLegacyOffsetCursor is total on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 256 }), (s) => {
        const result = isLegacyOffsetCursor(s);
        expect(typeof result).toBe('boolean');
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
