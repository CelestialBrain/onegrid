// =============================================================================
// Text category — LEN/UPPER/LOWER/TRIM/CONCAT/LEFT/RIGHT/MID/FIND/SUBSTITUTE
// + v1.1.0 VALUE/NUMBERVALUE/TEXT/DOLLAR/FIXED/REPT/REPLACE/SEARCH/CLEAN/EXACT/
// PROPER/CHAR/CODE/UNICODE/UNICHAR/T/TEXTJOIN/TEXTSPLIT/TEXTBEFORE/TEXTAFTER.
// =============================================================================

import { toBoolean, toNumber, toString_ } from '../coerce';
import { NA_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { flatten, register } from './_shared';

register('LEN', (args) => toString_(args[0]).length);
register('UPPER', (args) => toString_(args[0]).toUpperCase());
register('LOWER', (args) => toString_(args[0]).toLowerCase());
register('TRIM', (args) => toString_(args[0]).trim());

register('CONCAT', (args) => {
  let out = '';
  for (const a of flatten(args)) {
    if (isFormulaError(a)) return a;
    out += toString_(a);
  }
  return out;
});

register('LEFT', (args) => {
  const s = toString_(args[0]);
  const n = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(n)) return n;
  return s.slice(0, Math.max(0, n));
});

register('RIGHT', (args) => {
  const s = toString_(args[0]);
  const n = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(n)) return n;
  if (n <= 0) return '';
  return s.slice(-n);
});

register('MID', (args) => {
  const s = toString_(args[0]);
  const start = toNumber(args[1]);
  const len = toNumber(args[2]);
  if (isFormulaError(start) || isFormulaError(len)) return VALUE_ERROR;
  if (start < 1 || len < 0) return VALUE_ERROR;
  return s.slice(start - 1, start - 1 + len);
});

register('FIND', (args) => {
  const needle = toString_(args[0]);
  const haystack = toString_(args[1]);
  const startAt = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(startAt)) return startAt;
  const idx = haystack.indexOf(needle, Math.max(0, startAt - 1));
  return idx < 0 ? VALUE_ERROR : idx + 1;
});

register('SUBSTITUTE', (args) => {
  const s = toString_(args[0]);
  const from = toString_(args[1]);
  const to = toString_(args[2]);
  return s.split(from).join(to);
});

// ----- v1.1.0 expansion -----------------------------------------------------

register('VALUE', (args) => {
  const v = args[0];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined || v === '') return 0;
  const s = toString_(v).trim();
  let body = s.replace(/^\+/, '');
  const percent = body.endsWith('%');
  if (percent) body = body.slice(0, -1).trim();
  body = body.replace(/^[$£€¥]/, '');
  body = body.replace(/,/g, '');
  const n = Number(body);
  if (!Number.isFinite(n)) return VALUE_ERROR;
  return percent ? n / 100 : n;
});

register('NUMBERVALUE', (args) => {
  const v = args[0];
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const s = toString_(v).trim();
  const dec = args.length > 1 ? toString_(args[1] ?? '.') : '.';
  const grp = args.length > 2 ? toString_(args[2] ?? ',') : ',';
  let body = s;
  if (grp) body = body.split(grp).join('');
  if (dec !== '.') body = body.split(dec).join('.');
  let scale = 1;
  while (body.endsWith('%')) {
    scale /= 100;
    body = body.slice(0, -1).trim();
  }
  const n = Number(body);
  if (!Number.isFinite(n)) return VALUE_ERROR;
  return n * scale;
});

register('TEXT', (args) => {
  const value = args[0];
  const fmt = args.length > 1 ? toString_(args[1] ?? '') : '';
  if (fmt === '') return toString_(value);
  if (isFormulaError(value)) return value;

  if (/[ymdhs]/i.test(fmt)) {
    const d = value instanceof Date ? value : typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null;
    if (!d || Number.isNaN(d.getTime())) return VALUE_ERROR;
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return fmt
      .replace(/yyyy/g, String(d.getFullYear()))
      .replace(/yy/g, String(d.getFullYear()).slice(-2))
      .replace(/mm/g, pad(d.getMonth() + 1))
      .replace(/m(?![ms])/g, String(d.getMonth() + 1))
      .replace(/dd/g, pad(d.getDate()))
      .replace(/d(?![dy])/g, String(d.getDate()))
      .replace(/HH|hh/g, pad(d.getHours()))
      .replace(/h/g, String(d.getHours()))
      .replace(/MM/g, pad(d.getMinutes()))
      .replace(/ss/g, pad(d.getSeconds()))
      .replace(/s(?!s)/g, String(d.getSeconds()));
  }

  const n = toNumber(value);
  if (isFormulaError(n)) return n;
  const isPercent = /%/.test(fmt);
  const decimalsMatch = /\.(0+|#+)/.exec(fmt);
  const decimals = decimalsMatch ? decimalsMatch[1]!.length : 0;
  const useThousands = /#,##/.test(fmt) || /,##/.test(fmt);
  const leadingLiteral = /^[$£€¥]/.exec(fmt)?.[0] ?? '';
  const trailingLiteral = isPercent ? '%' : '';
  const scaled = isPercent ? n * 100 : n;
  let body = scaled.toFixed(decimals);
  if (useThousands) {
    const [intPart, fracPart] = body.split('.');
    body = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fracPart ? '.' + fracPart : '');
  }
  return leadingLiteral + body + trailingLiteral;
});

register('DOLLAR', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const decimals = args.length > 1 ? toNumber(args[1]) : 2;
  if (isFormulaError(decimals)) return decimals;
  const d = Math.trunc(decimals);
  const sign = n < 0 ? '-' : '';
  const body = Math.abs(n)
    .toFixed(Math.max(0, d))
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${body}`;
});

register('FIXED', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const decimals = args.length > 1 ? toNumber(args[1]) : 2;
  if (isFormulaError(decimals)) return decimals;
  const noCommas = args.length > 2 ? toBoolean(args[2]) : false;
  if (isFormulaError(noCommas)) return noCommas;
  const body = n.toFixed(Math.max(0, Math.trunc(decimals)));
  if (noCommas) return body;
  const [intPart, fracPart] = body.split('.');
  return (
    (intPart!.startsWith('-') ? '-' : '') +
    intPart!.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (fracPart ? '.' + fracPart : '')
  );
});

register('REPT', (args) => {
  const s = toString_(args[0]);
  const n = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  const k = Math.trunc(n);
  if (k < 0) return VALUE_ERROR;
  if (k * s.length > 32_767) return VALUE_ERROR;
  return s.repeat(k);
});

register('REPLACE', (args) => {
  const s = toString_(args[0]);
  const start = toNumber(args[1]);
  const numChars = toNumber(args[2]);
  if (isFormulaError(start)) return start;
  if (isFormulaError(numChars)) return numChars;
  const newText = toString_(args[3]);
  const s0 = Math.max(0, Math.trunc(start) - 1);
  const n = Math.max(0, Math.trunc(numChars));
  return s.slice(0, s0) + newText + s.slice(s0 + n);
});

register('SEARCH', (args) => {
  const needleRaw = toString_(args[0]);
  const haystack = toString_(args[1]);
  const startAt = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(startAt)) return startAt;
  const start = Math.max(0, Math.trunc(startAt) - 1);
  if (/[*?]/.test(needleRaw)) {
    const re = new RegExp(
      needleRaw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'),
      'i',
    );
    const m = re.exec(haystack.slice(start));
    return m ? m.index + start + 1 : VALUE_ERROR;
  }
  const idx = haystack.toLowerCase().indexOf(needleRaw.toLowerCase(), start);
  return idx < 0 ? VALUE_ERROR : idx + 1;
});

register('CLEAN', (args) => {
  const s = toString_(args[0]);
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F]/g, '');
});

register('EXACT', (args) => toString_(args[0]) === toString_(args[1]));

register('PROPER', (args) => {
  const s = toString_(args[0]);
  let out = '';
  let capitalizeNext = true;
  for (const ch of s) {
    if (/\p{L}/u.test(ch)) {
      out += capitalizeNext ? ch.toUpperCase() : ch.toLowerCase();
      capitalizeNext = false;
    } else {
      out += ch;
      capitalizeNext = true;
    }
  }
  return out;
});

register('CHAR', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const code = Math.trunc(n);
  if (code < 1 || code > 0x10ffff) return VALUE_ERROR;
  try {
    return String.fromCodePoint(code);
  } catch {
    return VALUE_ERROR;
  }
});

register('CODE', (args) => {
  const s = toString_(args[0]);
  if (s === '') return VALUE_ERROR;
  return s.charCodeAt(0);
});

register('UNICODE', (args) => {
  const s = toString_(args[0]);
  if (s === '') return VALUE_ERROR;
  const cp = s.codePointAt(0);
  return cp ?? VALUE_ERROR;
});

register('T', (args) => (typeof args[0] === 'string' ? args[0] : ''));

register('TEXTJOIN', (args) => {
  const delim = toString_(args[0]);
  const ignore = toBoolean(args[1]);
  if (isFormulaError(ignore)) return ignore;
  const parts: string[] = [];
  for (const a of flatten(args.slice(2))) {
    if (isFormulaError(a)) return a;
    if (ignore && (a === null || a === undefined || a === '')) continue;
    parts.push(toString_(a));
  }
  const joined = parts.join(delim);
  if (joined.length > 32_767) return VALUE_ERROR;
  return joined;
});

register('TEXTSPLIT', (args) => {
  const text = toString_(args[0]);
  const colDelim = args[1];
  const rowDelim = args.length > 2 ? args[2] : null;
  const ignoreEmpty = args.length > 3 ? toBoolean(args[3]) : false;
  if (isFormulaError(ignoreEmpty)) return ignoreEmpty;
  const colDelims = Array.isArray(colDelim)
    ? (colDelim as unknown[]).map(toString_)
    : [toString_(colDelim)];
  const rowDelims = rowDelim === null
    ? null
    : Array.isArray(rowDelim)
      ? (rowDelim as unknown[]).map(toString_)
      : [toString_(rowDelim)];
  const splitWith = (s: string, delims: string[]): string[] => {
    if (delims.length === 1) return s.split(delims[0]!);
    const escaped = delims.map((d) => d.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
    return s.split(new RegExp(escaped.join('|')));
  };
  const dropEmpty = (a: string[]): string[] => (ignoreEmpty ? a.filter((x) => x !== '') : a);
  if (rowDelims === null) {
    return [dropEmpty(splitWith(text, colDelims))];
  }
  const rowStrings = dropEmpty(splitWith(text, rowDelims));
  return rowStrings.map((rs) => dropEmpty(splitWith(rs, colDelims)));
});

register('TEXTBEFORE', (args) => {
  const text = toString_(args[0]);
  const delim = toString_(args[1]);
  const instance = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(instance)) return instance;
  const matchMode = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const ifNotFound = args.length > 5 ? args[5] : NA_ERROR;
  const haystack = matchMode === 1 ? text.toLowerCase() : text;
  const needle = matchMode === 1 ? delim.toLowerCase() : delim;
  const inst = Math.trunc(instance);
  if (inst === 0 || delim === '') return text;
  if (inst > 0) {
    let pos = -1;
    for (let i = 0; i < inst; i++) {
      pos = haystack.indexOf(needle, pos + 1);
      if (pos < 0) return ifNotFound;
    }
    return text.slice(0, pos);
  }
  let pos = haystack.length;
  for (let i = 0; i < -inst; i++) {
    pos = haystack.lastIndexOf(needle, pos - 1);
    if (pos < 0) return ifNotFound;
  }
  return text.slice(0, pos);
});

register('TEXTAFTER', (args) => {
  const text = toString_(args[0]);
  const delim = toString_(args[1]);
  const instance = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(instance)) return instance;
  const matchMode = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const ifNotFound = args.length > 5 ? args[5] : NA_ERROR;
  const haystack = matchMode === 1 ? text.toLowerCase() : text;
  const needle = matchMode === 1 ? delim.toLowerCase() : delim;
  const inst = Math.trunc(instance);
  if (inst === 0 || delim === '') return text;
  if (inst > 0) {
    let pos = -1;
    for (let i = 0; i < inst; i++) {
      pos = haystack.indexOf(needle, pos + 1);
      if (pos < 0) return ifNotFound;
    }
    return text.slice(pos + delim.length);
  }
  let pos = haystack.length;
  for (let i = 0; i < -inst; i++) {
    pos = haystack.lastIndexOf(needle, pos - 1);
    if (pos < 0) return ifNotFound;
  }
  return text.slice(pos + delim.length);
});
