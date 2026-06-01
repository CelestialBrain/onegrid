// =============================================================================
// @onegrid/formula — v1.1.0 wave 20: CJK locale text functions.
//
// BAHTTEXT (Thai), ASC (full→half width), JIS / DBCS (half→full width),
// PHONETIC (furigana extraction; falls back to source text without ruby).
//
// Iterative calculation for circular references is deferred to v1.1.x —
// it needs cycle-aware dependency-graph traversal in `incremental.ts`.
// Long-period odd bonds (ODDF/L PRICE/YIELD long-first/long-last variants)
// are deferred to v1.1.x — multi-quasi-coupon traversal is a separate
// numerical lift.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createFormulaEngine } from '..';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = {};
const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: () => [],
};
const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 20 — BAHTTEXT', () => {
  it('BAHTTEXT(0) returns "ศูนย์บาทถ้วน"', () => {
    expect(ev('=BAHTTEXT(0)')).toBe('ศูนย์บาทถ้วน');
  });
  it('BAHTTEXT(1) returns one-baht text', () => {
    expect(ev('=BAHTTEXT(1)')).toBe('หนึ่งบาทถ้วน');
  });
  it('BAHTTEXT(21) uses the "yi-sib" form for 21', () => {
    const r = ev('=BAHTTEXT(21)') as string;
    expect(r).toContain('ยี่สิบ'); // 21 = "ยี่สิบเอ็ด"
    expect(r).toContain('เอ็ด');
  });
  it('BAHTTEXT(1.50) carries both baht and satang', () => {
    const r = ev('=BAHTTEXT(1.5)') as string;
    expect(r).toContain('บาท');
    expect(r).toContain('สตางค์');
  });
});

describe('@onegrid/formula — wave 20 — ASC / JIS / DBCS (width conversion)', () => {
  it('ASC: full-width ASCII → half-width', () => {
    expect(ev('=ASC("ＨＥＬＬＯ")')).toBe('HELLO');
  });
  it('JIS: half-width ASCII → full-width', () => {
    expect(ev('=JIS("HELLO")')).toBe('ＨＥＬＬＯ');
  });
  it('DBCS aliases JIS', () => {
    expect(ev('=DBCS("abc")')).toBe(ev('=JIS("abc")'));
  });
  it('ASC: full-width space → ASCII space', () => {
    expect(ev('=ASC("a　b")')).toBe('a b');
  });
  it('JIS: ASCII space → full-width', () => {
    expect(ev('=JIS("a b")')).toBe('ａ　ｂ');
  });
  it('ASC: full-width katakana → half-width katakana', () => {
    expect(ev('=ASC("カタカナ")')).toBe('ｶﾀｶﾅ');
  });
  it('JIS: half-width katakana → full-width katakana', () => {
    expect(ev('=JIS("ｶﾀｶﾅ")')).toBe('カタカナ');
  });
  it('round-trip ASC(JIS(x)) = x for ASCII', () => {
    expect(ev('=ASC(JIS("Hello 123"))')).toBe('Hello 123');
  });
});

describe('@onegrid/formula — wave 20 — PHONETIC', () => {
  it('PHONETIC degrades to source text (no ruby markup)', () => {
    expect(ev('=PHONETIC("ありがとう")')).toBe('ありがとう');
  });
});

describe('@onegrid/formula — wave 20 — iterative calc + long-period bonds (deferred)', () => {
  it('long-period ODDFPRICE still returns #NUM!', () => {
    // The short-period subset works (covered in wave 13). The long-first
    // case — when the first coupon is more than one quasi-period out from
    // issue — needs multi-quasi-coupon traversal. We lock the deferral.
    const issue = new Date(2008, 0, 1);
    const settle = new Date(2008, 1, 1);
    const firstCoupon = new Date(2009, 6, 1); // > one semi-period
    const maturity = new Date(2020, 6, 1);
    const r = ev(
      `=ODDFPRICE(DATE(2008,2,1), DATE(2020,7,1), DATE(2008,1,1), DATE(2009,7,1), 0.05, 0.06, 100, 2, 1)`,
    ) as { code?: string };
    // void the unused fixtures
    void issue; void settle; void firstCoupon; void maturity;
    expect(r?.code).toBe('#NUM!');
  });
});
