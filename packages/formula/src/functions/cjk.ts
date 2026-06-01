// =============================================================================
// CJK locale text functions (v1.1.0 wave 20).
//
// BAHTTEXT — convert a number to Thai-baht text. Uses a tiny lookup table
//            for digit names + place values.
// ASC      — convert full-width katakana / ASCII to half-width.
// JIS      — convert half-width katakana / ASCII to full-width.
// DBCS     — alias of JIS (Excel's name for the same op in Asian locales).
// PHONETIC — extract furigana / ruby-text from a string. Without ruby
//            markup the documented adopter-friendly fallback is to return
//            the source text unchanged.
//
// Public source only: behavior follows Microsoft's published function docs;
// no proprietary Excel source consulted.
// =============================================================================

import { toString_ } from '../coerce';
import { register } from './_shared';

// ----- BAHTTEXT --------------------------------------------------------------

const TH_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const TH_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function bahtUnits(n: number): string {
  if (n === 0) return 'ศูนย์';
  const s = String(Math.trunc(n));
  let out = '';
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = Number(s[i]);
    const place = len - i - 1;
    if (d === 0) continue;
    if (place === 0 && d === 1 && len > 1) {
      out += 'เอ็ด';
    } else if (place === 1 && d === 2) {
      out += 'ยี่' + TH_PLACES[1];
    } else if (place === 1 && d === 1) {
      out += TH_PLACES[1];
    } else {
      out += TH_DIGITS[d]! + (TH_PLACES[place] ?? '');
    }
  }
  return out;
}

register('BAHTTEXT', (args) => {
  const n = Number(args[0]);
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? 'ลบ' : '';
  const abs = Math.abs(n);
  const baht = Math.trunc(abs);
  const satang = Math.round((abs - baht) * 100);
  let out = sign;
  if (baht > 0) out += bahtUnits(baht) + 'บาท';
  else if (satang === 0) return 'ศูนย์บาทถ้วน';
  if (satang === 0) out += 'ถ้วน';
  else out += bahtUnits(satang) + 'สตางค์';
  return out;
});

// ----- ASC -------------------------------------------------------------------
//
// Maps full-width ASCII / katakana to half-width. Uses Unicode block
// arithmetic: full-width ASCII (U+FF01..U+FF5E) → half-width (0x21..0x7E)
// by subtracting 0xFEE0. Full-width katakana → half-width katakana via
// table. Full-width space (U+3000) → ASCII space.

const FW_KATAKANA_HW: Record<string, string> = {
  'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
  'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
  'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
  'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
  'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
  'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
  'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
  'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
  'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
  'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
  'ー': 'ｰ', '。': '｡', '、': '､', '「': '｢', '」': '｣', '・': '･',
};

const HW_KATAKANA_FW: Record<string, string> = Object.fromEntries(
  Object.entries(FW_KATAKANA_HW).map(([fw, hw]) => [hw, fw]),
);

register('ASC', (args) => {
  const s = toString_(args[0]);
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code === 0x3000) out += ' ';
    else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0);
    } else if (FW_KATAKANA_HW[ch]) {
      out += FW_KATAKANA_HW[ch];
    } else {
      out += ch;
    }
  }
  return out;
});

register('JIS', (args) => {
  const s = toString_(args[0]);
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code === 0x20) out += '　'; // ASCII space → full-width
    else if (code >= 0x21 && code <= 0x7e) {
      out += String.fromCodePoint(code + 0xfee0);
    } else if (HW_KATAKANA_FW[ch]) {
      out += HW_KATAKANA_FW[ch];
    } else {
      out += ch;
    }
  }
  return out;
});

// DBCS is the Asian-locale alias for JIS.
register('DBCS', (args) => {
  // Just dispatch via the JIS implementation (functions are upper-cased
  // in the registry; we register both names independently to keep the
  // surface clean).
  const s = toString_(args[0]);
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code === 0x20) out += '　';
    else if (code >= 0x21 && code <= 0x7e) {
      out += String.fromCodePoint(code + 0xfee0);
    } else if (HW_KATAKANA_FW[ch]) {
      out += HW_KATAKANA_FW[ch];
    } else {
      out += ch;
    }
  }
  return out;
});

// ----- PHONETIC --------------------------------------------------------------
//
// Real Excel returns the furigana (ruby annotation) attached to a cell.
// Adopter cells don't carry ruby annotations by default, so we return the
// source text unchanged (the documented fallback). Adopters with real
// ruby storage can override via `registerFormulaFunction('PHONETIC', ...)`.

register('PHONETIC', (args) => toString_(args[0]));
