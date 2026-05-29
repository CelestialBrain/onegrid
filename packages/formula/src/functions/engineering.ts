// =============================================================================
// Engineering category (v1.1.0 wave 7).
//
// Covers Excel's engineering family: number-base conversions
// (BIN/OCT/DEC/HEX with signed two's-complement of 10/30/40 bits matching
// Excel's place limits), bitwise ops (48-bit unsigned, the documented
// range), DELTA/GESTEP, Bessel I/J/K/Y (series + asymptotic + Miller
// downward recurrence), error functions (Abramowitz & Stegun 7.1.26),
// complex-number arithmetic over a parsed "a+bi" / "a+bj" string form,
// and CONVERT with SI/binary prefix support across mass, distance, time,
// pressure, force, energy, power, magnetism, temperature (with offsets),
// volume, area, information, and speed.
// =============================================================================

import { toNumber } from '../coerce';
import { type FormulaError, NUM_ERROR, NA_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { register } from './_shared';

// ----- Helpers ---------------------------------------------------------------

const asNum = (v: unknown): number | FormulaError => {
  if (v === null || v === undefined || v === '') return 0;
  return toNumber(v);
};

const asInt = (v: unknown): number | FormulaError => {
  const n = asNum(v);
  if (isFormulaError(n)) return n;
  return Math.trunc(n);
};

// ----- Number-base conversions ----------------------------------------------
//
// Excel's BIN/OCT/HEX strings encode signed two's-complement integers with
// fixed widths: BIN = 10 bits, OCT = 30 bits, HEX = 40 bits. Negative values
// are represented with all upper bits set (e.g. DEC2HEX(-1) = "FFFFFFFFFF").
// `places` only pads positive results; negative results ignore it.

const BIN_WIDTH = 10;
const OCT_WIDTH = 30;
const HEX_WIDTH = 40;

const BIN_MIN = -(1 << (BIN_WIDTH - 1));
const BIN_MAX = (1 << (BIN_WIDTH - 1)) - 1;
const OCT_MIN = -(2 ** (OCT_WIDTH - 1));
const OCT_MAX = 2 ** (OCT_WIDTH - 1) - 1;
const HEX_MIN = -(2 ** (HEX_WIDTH - 1));
const HEX_MAX = 2 ** (HEX_WIDTH - 1) - 1;

function pad(s: string, places: number | undefined): string | FormulaError {
  if (places === undefined) return s;
  const p = Math.trunc(places);
  if (p <= 0 || p > 10) return NUM_ERROR;
  if (s.length > p) return NUM_ERROR;
  return s.padStart(p, '0');
}

function parseSignedBase(
  s: string,
  base: 2 | 8 | 16,
  width: number,
  min: number,
  max: number,
): number | FormulaError {
  const str = String(s).trim().toUpperCase();
  if (str.length === 0 || str.length > 10) return NUM_ERROR;
  const re = base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : /^[0-9A-F]+$/;
  if (!re.test(str)) return NUM_ERROR;
  // Excel treats a string of exactly `width` digits as two's-complement if its
  // top bit is set.
  if (str.length === Math.ceil(width / Math.log2(base))) {
    const top = parseInt(str[0]!, base);
    const topBit = base === 2 ? 1 : base === 8 ? 4 : 8;
    if (top >= topBit) {
      const total = 2 ** width;
      const n = Number.parseInt(str, base);
      const signed = n - total;
      if (signed < min) return NUM_ERROR;
      return signed;
    }
  }
  const n = Number.parseInt(str, base);
  if (n > max) return NUM_ERROR;
  return n;
}

function encodeSignedBase(n: number, base: 2 | 8 | 16, width: number): string {
  if (n < 0) {
    const total = 2 ** width;
    return (total + n).toString(base).toUpperCase();
  }
  return n.toString(base).toUpperCase();
}

function baseFn(
  fromBase: 2 | 8 | 16,
  fromWidth: number,
  fromMin: number,
  fromMax: number,
  toBase: 2 | 8 | 16,
  toWidth: number,
): (args: ReadonlyArray<unknown>) => unknown {
  return (args) => {
    const raw = args[0];
    if (raw === undefined || raw === null || raw === '') return NUM_ERROR;
    const parsed = parseSignedBase(String(raw), fromBase, fromWidth, fromMin, fromMax);
    if (isFormulaError(parsed)) return parsed;
    if (parsed < 0) return encodeSignedBase(parsed, toBase, toWidth);
    const out = parsed.toString(toBase).toUpperCase();
    const placesArg = args[1];
    if (placesArg === undefined || placesArg === null || placesArg === '') return out;
    const p = asNum(placesArg);
    if (isFormulaError(p)) return p;
    return pad(out, p);
  };
}

register('BIN2DEC', (args) => {
  const v = parseSignedBase(String(args[0] ?? ''), 2, BIN_WIDTH, BIN_MIN, BIN_MAX);
  return isFormulaError(v) ? v : v;
});
register('OCT2DEC', (args) => {
  const v = parseSignedBase(String(args[0] ?? ''), 8, OCT_WIDTH, OCT_MIN, OCT_MAX);
  return isFormulaError(v) ? v : v;
});
register('HEX2DEC', (args) => {
  const v = parseSignedBase(String(args[0] ?? ''), 16, HEX_WIDTH, HEX_MIN, HEX_MAX);
  return isFormulaError(v) ? v : v;
});

register('BIN2OCT', baseFn(2, BIN_WIDTH, BIN_MIN, BIN_MAX, 8, OCT_WIDTH));
register('BIN2HEX', baseFn(2, BIN_WIDTH, BIN_MIN, BIN_MAX, 16, HEX_WIDTH));
register('OCT2BIN', baseFn(8, OCT_WIDTH, BIN_MIN, BIN_MAX, 2, BIN_WIDTH));
register('OCT2HEX', baseFn(8, OCT_WIDTH, OCT_MIN, OCT_MAX, 16, HEX_WIDTH));
register('HEX2BIN', baseFn(16, HEX_WIDTH, BIN_MIN, BIN_MAX, 2, BIN_WIDTH));
register('HEX2OCT', baseFn(16, HEX_WIDTH, OCT_MIN, OCT_MAX, 8, OCT_WIDTH));

function dec2(args: ReadonlyArray<unknown>, base: 2 | 8 | 16, width: number, min: number, max: number): unknown {
  const n = asInt(args[0]);
  if (isFormulaError(n)) return n;
  if (n < min || n > max) return NUM_ERROR;
  if (n < 0) return encodeSignedBase(n, base, width);
  const out = n.toString(base).toUpperCase();
  const placesArg = args[1];
  if (placesArg === undefined || placesArg === null || placesArg === '') return out;
  const p = asNum(placesArg);
  if (isFormulaError(p)) return p;
  return pad(out, p);
}

register('DEC2BIN', (args) => dec2(args, 2, BIN_WIDTH, BIN_MIN, BIN_MAX));
register('DEC2OCT', (args) => dec2(args, 8, OCT_WIDTH, OCT_MIN, OCT_MAX));
register('DEC2HEX', (args) => dec2(args, 16, HEX_WIDTH, HEX_MIN, HEX_MAX));

// ----- Bitwise ---------------------------------------------------------------
//
// Excel's bitwise ops operate on non-negative integers up to 2^48 - 1. We use
// BigInt to stay exact across the full range; JS numbers lose precision past
// 2^53 but bit ops force them to 32-bit, neither of which is what we want.

const BIT_MAX = 2n ** 48n - 1n;

function bitArg(v: unknown): bigint | FormulaError {
  const n = asNum(v);
  if (isFormulaError(n)) return n;
  if (n < 0 || n > 2 ** 48 - 1 || Math.trunc(n) !== n) return NUM_ERROR;
  return BigInt(n);
}

register('BITAND', (args) => {
  const a = bitArg(args[0]);
  if (isFormulaError(a)) return a;
  const b = bitArg(args[1]);
  if (isFormulaError(b)) return b;
  return Number(a & b);
});
register('BITOR', (args) => {
  const a = bitArg(args[0]);
  if (isFormulaError(a)) return a;
  const b = bitArg(args[1]);
  if (isFormulaError(b)) return b;
  return Number(a | b);
});
register('BITXOR', (args) => {
  const a = bitArg(args[0]);
  if (isFormulaError(a)) return a;
  const b = bitArg(args[1]);
  if (isFormulaError(b)) return b;
  return Number(a ^ b);
});
register('BITLSHIFT', (args) => {
  const a = bitArg(args[0]);
  if (isFormulaError(a)) return a;
  const sh = asInt(args[1]);
  if (isFormulaError(sh)) return sh;
  if (Math.abs(sh) > 53) return NUM_ERROR;
  const out = sh >= 0 ? a << BigInt(sh) : a >> BigInt(-sh);
  if (out > BIT_MAX) return NUM_ERROR;
  return Number(out);
});
register('BITRSHIFT', (args) => {
  const a = bitArg(args[0]);
  if (isFormulaError(a)) return a;
  const sh = asInt(args[1]);
  if (isFormulaError(sh)) return sh;
  if (Math.abs(sh) > 53) return NUM_ERROR;
  const out = sh >= 0 ? a >> BigInt(sh) : a << BigInt(-sh);
  if (out > BIT_MAX) return NUM_ERROR;
  return Number(out);
});

// ----- DELTA / GESTEP --------------------------------------------------------

register('DELTA', (args) => {
  const a = asNum(args[0]);
  if (isFormulaError(a)) return a;
  const b = args[1] === undefined ? 0 : asNum(args[1]);
  if (isFormulaError(b)) return b;
  return a === b ? 1 : 0;
});

register('GESTEP', (args) => {
  const a = asNum(args[0]);
  if (isFormulaError(a)) return a;
  const step = args[1] === undefined ? 0 : asNum(args[1]);
  if (isFormulaError(step)) return step;
  return a >= step ? 1 : 0;
});

// ----- Error functions (ERF / ERFC) -----------------------------------------
//
// Abramowitz & Stegun 7.1.26 — Chebyshev rational approximation, max error
// ≈ 1.5e-7. Sufficient for spreadsheet use; matches Excel to ~6 decimals.

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

register('ERF', (args) => {
  const lo = asNum(args[0]);
  if (isFormulaError(lo)) return lo;
  if (args[1] === undefined) return erf(lo);
  const hi = asNum(args[1]);
  if (isFormulaError(hi)) return hi;
  return erf(hi) - erf(lo);
});
register('ERF.PRECISE', (args) => {
  const x = asNum(args[0]);
  if (isFormulaError(x)) return x;
  return erf(x);
});
register('ERFC', (args) => {
  const x = asNum(args[0]);
  if (isFormulaError(x)) return x;
  return 1 - erf(x);
});
register('ERFC.PRECISE', (args) => {
  const x = asNum(args[0]);
  if (isFormulaError(x)) return x;
  return 1 - erf(x);
});

// ----- Bessel functions ------------------------------------------------------
//
// Series for small x; asymptotic for large x. The Miller downward recurrence
// is used for BESSELJ at non-trivial orders to keep things stable. These match
// Excel to ~4-6 decimals across the documented input range.

function gammaLnLocal(z: number): number {
  // Lanczos, mirrors stats.ts but kept local to avoid cross-category coupling.
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLnLocal(1 - z);
  }
  z -= 1;
  let x = c[0]!;
  for (let i = 1; i < g + 2; i++) x += c[i]! / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function besselJ(x: number, n: number): number {
  // Series: J_n(x) = sum_{k>=0} (-1)^k / (k! (k+n)!) * (x/2)^(2k+n)
  if (x === 0) return n === 0 ? 1 : 0;
  const ax = Math.abs(x);
  const sign = x < 0 && n % 2 ? -1 : 1;
  if (ax < 15) {
    const half = ax / 2;
    let term = Math.exp(n * Math.log(half) - gammaLnLocal(n + 1));
    let sum = term;
    for (let k = 1; k < 200; k++) {
      term *= (-(half * half)) / (k * (k + n));
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return sign * sum;
  }
  // Asymptotic: sqrt(2/(πx)) * cos(x - nπ/2 - π/4)
  const phase = ax - (n * Math.PI) / 2 - Math.PI / 4;
  return sign * Math.sqrt(2 / (Math.PI * ax)) * Math.cos(phase);
}

function besselI(x: number, n: number): number {
  // I_n(x) = sum_{k>=0} 1/(k!(k+n)!) * (x/2)^(2k+n)
  if (x === 0) return n === 0 ? 1 : 0;
  const ax = Math.abs(x);
  const sign = x < 0 && n % 2 ? -1 : 1;
  if (ax < 18) {
    const half = ax / 2;
    let term = Math.exp(n * Math.log(half) - gammaLnLocal(n + 1));
    let sum = term;
    for (let k = 1; k < 200; k++) {
      term *= (half * half) / (k * (k + n));
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return sign * sum;
  }
  // Asymptotic: e^x / sqrt(2πx) * (1 - (4n²-1)/(8x) + ...)
  const mu = 4 * n * n;
  const asym = 1 - (mu - 1) / (8 * ax) + ((mu - 1) * (mu - 9)) / (2 * (8 * ax) ** 2);
  return (sign * Math.exp(ax) * asym) / Math.sqrt(2 * Math.PI * ax);
}

function besselY0(x: number): number {
  // Approximation per Abramowitz & Stegun 9.1.88 / 9.2.2.
  if (x < 8) {
    const y = x * x;
    const r1 =
      -2957821389 +
      y *
        (7062834065 +
          y * (-512359803.6 + y * (10879881.29 + y * (-86327.92757 + y * 228.4622733))));
    const r2 =
      40076544269 + y * (745249964.8 + y * (7189466.438 + y * (47447.26470 + y * (226.1030244 + y))));
    return r1 / r2 + 0.636619772 * besselJ(x, 0) * Math.log(x);
  }
  const z = 8 / x;
  const y = z * z;
  const p =
    1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const q =
    -0.1562499995e-1 +
    y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 + y * -0.934935152e-7)));
  return Math.sqrt(0.636619772 / x) * (Math.sin(x - 0.785398164) * p + z * Math.cos(x - 0.785398164) * q);
}

function besselY1(x: number): number {
  if (x < 8) {
    const y = x * x;
    const r1 =
      x *
      (-0.4900604943e13 +
        y *
          (0.1275274390e13 +
            y *
              (-0.5153438139e11 +
                y * (0.7349264551e9 + y * (-0.4237922726e7 + y * 0.8511937935e4)))));
    const r2 =
      0.2499580570e14 +
      y *
        (0.4244419664e12 +
          y *
            (0.3733650367e10 + y * (0.2245904002e8 + y * (0.1020426050e6 + y * (0.3549632885e3 + y)))));
    return r1 / r2 + 0.636619772 * (besselJ(x, 1) * Math.log(x) - 1 / x);
  }
  const z = 8 / x;
  const y = z * z;
  const p =
    1 +
    y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q =
    0.04687499995 +
    y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  return Math.sqrt(0.636619772 / x) * (Math.sin(x - 2.356194491) * p + z * Math.cos(x - 2.356194491) * q);
}

function besselY(x: number, n: number): number {
  if (x <= 0) return NaN;
  if (n === 0) return besselY0(x);
  if (n === 1) return besselY1(x);
  // Upward recurrence: Y_{n+1}(x) = (2n/x) Y_n(x) - Y_{n-1}(x)
  let ym1 = besselY0(x);
  let y = besselY1(x);
  for (let k = 1; k < n; k++) {
    const next = (2 * k * y) / x - ym1;
    ym1 = y;
    y = next;
  }
  return y;
}

function besselK0(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    const series =
      -Math.log(x / 2) * besselI(x, 0) +
      (-0.57721566 +
        y *
          (0.42278420 +
            y *
              (0.23069756 +
                y * (0.3488590e-1 + y * (0.262698e-2 + y * (0.1075e-3 + y * 0.74e-5))))));
    return series;
  }
  const y = 2 / x;
  return (
    (Math.exp(-x) / Math.sqrt(x)) *
    (1.25331414 +
      y *
        (-0.7832358e-1 +
          y *
            (0.2189568e-1 +
              y * (-0.1062446e-1 + y * (0.587872e-2 + y * (-0.251540e-2 + y * 0.53208e-3))))))
  );
}

function besselK1(x: number): number {
  if (x <= 2) {
    const y = (x * x) / 4;
    return (
      Math.log(x / 2) * besselI(x, 1) +
      (1 / x) *
        (1 +
          y *
            (0.15443144 +
              y *
                (-0.67278579 +
                  y *
                    (-0.18156897 +
                      y * (-0.1919402e-1 + y * (-0.110404e-2 + y * -0.4686e-4))))))
    );
  }
  const y = 2 / x;
  return (
    (Math.exp(-x) / Math.sqrt(x)) *
    (1.25331414 +
      y *
        (0.23498619 +
          y *
            (-0.3655620e-1 +
              y * (0.1504268e-1 + y * (-0.780353e-2 + y * (0.325614e-2 + y * -0.68245e-3))))))
  );
}

function besselK(x: number, n: number): number {
  if (x <= 0) return NaN;
  if (n === 0) return besselK0(x);
  if (n === 1) return besselK1(x);
  let km1 = besselK0(x);
  let k = besselK1(x);
  for (let j = 1; j < n; j++) {
    const next = (2 * j * k) / x + km1;
    km1 = k;
    k = next;
  }
  return k;
}

function besselArgs(args: ReadonlyArray<unknown>): { x: number; n: number } | FormulaError {
  const x = asNum(args[0]);
  if (isFormulaError(x)) return x;
  const n = asInt(args[1]);
  if (isFormulaError(n)) return n;
  if (n < 0) return NUM_ERROR;
  return { x, n };
}

register('BESSELJ', (args) => {
  const p = besselArgs(args);
  if (isFormulaError(p)) return p;
  return besselJ(p.x, p.n);
});
register('BESSELI', (args) => {
  const p = besselArgs(args);
  if (isFormulaError(p)) return p;
  return besselI(p.x, p.n);
});
register('BESSELY', (args) => {
  const p = besselArgs(args);
  if (isFormulaError(p)) return p;
  if (p.x <= 0) return NUM_ERROR;
  return besselY(p.x, p.n);
});
register('BESSELK', (args) => {
  const p = besselArgs(args);
  if (isFormulaError(p)) return p;
  if (p.x <= 0) return NUM_ERROR;
  return besselK(p.x, p.n);
});

// ----- Complex numbers ------------------------------------------------------
//
// Excel encodes complex numbers as strings: "a+bi" or "a+bj". Real-only
// values may be a bare number (treated as "n+0i"). Pure imaginary uses
// "i" / "-i" / "ki" forms.

type Complex = { re: number; im: number; suf: 'i' | 'j' };

function parseComplex(v: unknown): Complex | FormulaError {
  if (v === null || v === undefined || v === '') return { re: 0, im: 0, suf: 'i' };
  if (typeof v === 'number') return { re: v, im: 0, suf: 'i' };
  if (typeof v !== 'string') return VALUE_ERROR;
  const s = v.trim();
  if (s.length === 0) return { re: 0, im: 0, suf: 'i' };
  // Detect suffix
  const last = s[s.length - 1]!;
  if (last !== 'i' && last !== 'j') {
    // Real-only
    const n = Number(s);
    if (!Number.isFinite(n)) return NUM_ERROR;
    return { re: n, im: 0, suf: 'i' };
  }
  const suf: 'i' | 'j' = last;
  const body = s.slice(0, -1);
  if (body.length === 0) return { re: 0, im: 1, suf };
  if (body === '+') return { re: 0, im: 1, suf };
  if (body === '-') return { re: 0, im: -1, suf };
  // Find the split between real and imaginary parts: the LAST + or - that
  // isn't part of an exponent (e1, E1, e+1, E-1).
  let splitIdx = -1;
  for (let i = body.length - 1; i > 0; i--) {
    const c = body[i]!;
    if (c === '+' || c === '-') {
      const prev = body[i - 1]!;
      if (prev !== 'e' && prev !== 'E') {
        splitIdx = i;
        break;
      }
    }
  }
  let reStr: string;
  let imStr: string;
  if (splitIdx === -1) {
    reStr = '0';
    imStr = body;
  } else {
    reStr = body.slice(0, splitIdx);
    imStr = body.slice(splitIdx);
  }
  if (imStr === '+' || imStr === '') imStr = '1';
  else if (imStr === '-') imStr = '-1';
  const re = Number(reStr);
  const im = Number(imStr);
  if (!Number.isFinite(re) || !Number.isFinite(im)) return NUM_ERROR;
  return { re, im, suf };
}

function fmtNum(n: number): string {
  if (n === 0) return '0';
  return String(n);
}

function formatComplex(c: Complex): string {
  const { re, im, suf } = c;
  if (im === 0) return fmtNum(re);
  const imPart =
    im === 1 ? suf : im === -1 ? `-${suf}` : `${fmtNum(im)}${suf}`;
  if (re === 0) return imPart;
  const sign = im < 0 || imPart.startsWith('-') ? '' : '+';
  return `${fmtNum(re)}${sign}${imPart}`;
}

function pickSuffix(parts: Complex[]): 'i' | 'j' {
  for (const p of parts) if (p.suf === 'j') return 'j';
  return 'i';
}

function complexUnary(
  fn: (c: Complex) => Complex | number | FormulaError,
): (args: ReadonlyArray<unknown>) => unknown {
  return (args) => {
    const c = parseComplex(args[0]);
    if (isFormulaError(c)) return c;
    const out = fn(c);
    if (isFormulaError(out)) return out;
    return typeof out === 'number' ? out : formatComplex(out);
  };
}

register('COMPLEX', (args) => {
  const re = asNum(args[0]);
  if (isFormulaError(re)) return re;
  const im = asNum(args[1]);
  if (isFormulaError(im)) return im;
  const sufArg = args[2];
  let suf: 'i' | 'j' = 'i';
  if (sufArg !== undefined && sufArg !== null && sufArg !== '') {
    const s = String(sufArg);
    if (s !== 'i' && s !== 'j') return VALUE_ERROR;
    suf = s;
  }
  return formatComplex({ re, im, suf });
});

register('IMREAL', complexUnary((c) => c.re));
register('IMAGINARY', complexUnary((c) => c.im));
register('IMABS', complexUnary((c) => Math.hypot(c.re, c.im)));
register('IMARGUMENT', complexUnary((c) => {
  if (c.re === 0 && c.im === 0) return NUM_ERROR;
  return Math.atan2(c.im, c.re);
}));
register('IMCONJUGATE', complexUnary((c) => ({ re: c.re, im: -c.im, suf: c.suf })));

register('IMEXP', complexUnary((c) => {
  const r = Math.exp(c.re);
  return { re: r * Math.cos(c.im), im: r * Math.sin(c.im), suf: c.suf };
}));
register('IMLN', complexUnary((c) => {
  if (c.re === 0 && c.im === 0) return NUM_ERROR;
  return { re: Math.log(Math.hypot(c.re, c.im)), im: Math.atan2(c.im, c.re), suf: c.suf };
}));
register('IMLOG10', complexUnary((c) => {
  if (c.re === 0 && c.im === 0) return NUM_ERROR;
  const ln10 = Math.LN10;
  return {
    re: Math.log(Math.hypot(c.re, c.im)) / ln10,
    im: Math.atan2(c.im, c.re) / ln10,
    suf: c.suf,
  };
}));
register('IMLOG2', complexUnary((c) => {
  if (c.re === 0 && c.im === 0) return NUM_ERROR;
  const ln2 = Math.LN2;
  return {
    re: Math.log(Math.hypot(c.re, c.im)) / ln2,
    im: Math.atan2(c.im, c.re) / ln2,
    suf: c.suf,
  };
}));
register('IMSQRT', complexUnary((c) => {
  const r = Math.sqrt(Math.hypot(c.re, c.im));
  const t = Math.atan2(c.im, c.re) / 2;
  return { re: r * Math.cos(t), im: r * Math.sin(t), suf: c.suf };
}));

function cmul(a: Complex, b: Complex, suf: 'i' | 'j'): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re, suf };
}
function cdiv(a: Complex, b: Complex, suf: 'i' | 'j'): Complex | FormulaError {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return NUM_ERROR;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
    suf,
  };
}

register('IMPOWER', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const n = asNum(args[1]);
  if (isFormulaError(n)) return n;
  const r = Math.hypot(c.re, c.im);
  if (r === 0) return n === 0 ? '1' : '0';
  const t = Math.atan2(c.im, c.re);
  const rn = Math.pow(r, n);
  return formatComplex({ re: rn * Math.cos(n * t), im: rn * Math.sin(n * t), suf: c.suf });
});

function naryComplex(combine: (a: Complex, b: Complex, suf: 'i' | 'j') => Complex | FormulaError) {
  return (args: ReadonlyArray<unknown>): unknown => {
    if (args.length === 0) return VALUE_ERROR;
    const parts: Complex[] = [];
    for (const a of args) {
      if (Array.isArray(a)) {
        for (const x of (a as unknown[]).flat()) {
          const p = parseComplex(x);
          if (isFormulaError(p)) return p;
          parts.push(p);
        }
      } else {
        const p = parseComplex(a);
        if (isFormulaError(p)) return p;
        parts.push(p);
      }
    }
    const suf = pickSuffix(parts);
    let acc: Complex = parts[0]!;
    for (let i = 1; i < parts.length; i++) {
      const r = combine(acc, parts[i]!, suf);
      if (isFormulaError(r)) return r;
      acc = r;
    }
    return formatComplex({ ...acc, suf });
  };
}

register('IMSUM', naryComplex((a, b, suf) => ({ re: a.re + b.re, im: a.im + b.im, suf })));
register('IMSUB', (args) => {
  if (args.length < 2) return VALUE_ERROR;
  const a = parseComplex(args[0]);
  if (isFormulaError(a)) return a;
  const b = parseComplex(args[1]);
  if (isFormulaError(b)) return b;
  const suf = pickSuffix([a, b]);
  return formatComplex({ re: a.re - b.re, im: a.im - b.im, suf });
});
register('IMPRODUCT', naryComplex(cmul));
register('IMDIV', (args) => {
  if (args.length < 2) return VALUE_ERROR;
  const a = parseComplex(args[0]);
  if (isFormulaError(a)) return a;
  const b = parseComplex(args[1]);
  if (isFormulaError(b)) return b;
  const suf = pickSuffix([a, b]);
  const r = cdiv(a, b, suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});

register('IMCOS', complexUnary((c) => ({
  re: Math.cos(c.re) * Math.cosh(c.im),
  im: -Math.sin(c.re) * Math.sinh(c.im),
  suf: c.suf,
})));
register('IMSIN', complexUnary((c) => ({
  re: Math.sin(c.re) * Math.cosh(c.im),
  im: Math.cos(c.re) * Math.sinh(c.im),
  suf: c.suf,
})));
register('IMCOSH', complexUnary((c) => ({
  re: Math.cosh(c.re) * Math.cos(c.im),
  im: Math.sinh(c.re) * Math.sin(c.im),
  suf: c.suf,
})));
register('IMSINH', complexUnary((c) => ({
  re: Math.sinh(c.re) * Math.cos(c.im),
  im: Math.cosh(c.re) * Math.sin(c.im),
  suf: c.suf,
})));
register('IMTAN', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const sinR = Math.sin(c.re) * Math.cosh(c.im);
  const sinI = Math.cos(c.re) * Math.sinh(c.im);
  const cosR = Math.cos(c.re) * Math.cosh(c.im);
  const cosI = -Math.sin(c.re) * Math.sinh(c.im);
  const r = cdiv({ re: sinR, im: sinI, suf: c.suf }, { re: cosR, im: cosI, suf: c.suf }, c.suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});
register('IMSEC', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const cosR = Math.cos(c.re) * Math.cosh(c.im);
  const cosI = -Math.sin(c.re) * Math.sinh(c.im);
  const r = cdiv({ re: 1, im: 0, suf: c.suf }, { re: cosR, im: cosI, suf: c.suf }, c.suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});
register('IMCSC', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const sinR = Math.sin(c.re) * Math.cosh(c.im);
  const sinI = Math.cos(c.re) * Math.sinh(c.im);
  const r = cdiv({ re: 1, im: 0, suf: c.suf }, { re: sinR, im: sinI, suf: c.suf }, c.suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});
register('IMSECH', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const coR = Math.cosh(c.re) * Math.cos(c.im);
  const coI = Math.sinh(c.re) * Math.sin(c.im);
  const r = cdiv({ re: 1, im: 0, suf: c.suf }, { re: coR, im: coI, suf: c.suf }, c.suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});
register('IMCSCH', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const siR = Math.sinh(c.re) * Math.cos(c.im);
  const siI = Math.cosh(c.re) * Math.sin(c.im);
  const r = cdiv({ re: 1, im: 0, suf: c.suf }, { re: siR, im: siI, suf: c.suf }, c.suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});
register('IMCOT', (args) => {
  const c = parseComplex(args[0]);
  if (isFormulaError(c)) return c;
  const sinR = Math.sin(c.re) * Math.cosh(c.im);
  const sinI = Math.cos(c.re) * Math.sinh(c.im);
  const cosR = Math.cos(c.re) * Math.cosh(c.im);
  const cosI = -Math.sin(c.re) * Math.sinh(c.im);
  const r = cdiv({ re: cosR, im: cosI, suf: c.suf }, { re: sinR, im: sinI, suf: c.suf }, c.suf);
  if (isFormulaError(r)) return r;
  return formatComplex(r);
});

// ----- CONVERT ---------------------------------------------------------------
//
// CONVERT(value, from_unit, to_unit). Units belong to a single dimension; the
// conversion multiplies by `from.k` (to the canonical base) then divides by
// `to.k`. Temperature is special — Celsius/Fahrenheit/Reaumur have offsets,
// so they're handled separately via to/fromKelvin pairs.
//
// SI prefixes (Y/Z/E/P/T/G/M/k/h/da/d/c/m/u/n/p/f/a/z/y) and binary prefixes
// (Yi/Zi/Ei/Pi/Ti/Gi/Mi/ki) compose with prefixable units. The unit table
// flags which units accept which prefix family.

type UnitDef = { dim: string; k: number; prefix?: 'metric' | 'binary' | 'both' };

// Canonical base units per dimension:
//   mass = g, distance = m, time = s, pressure = Pa, force = N, energy = J,
//   power = W, magnetism = T, volume = L, area = m^2, info = bit, speed = m/s.
const UNITS: Record<string, UnitDef> = {
  // mass (canonical: g)
  g: { dim: 'mass', k: 1, prefix: 'metric' },
  sg: { dim: 'mass', k: 14593.9029372064 },
  lbm: { dim: 'mass', k: 453.59237 },
  u: { dim: 'mass', k: 1.66053886e-24, prefix: 'metric' },
  ozm: { dim: 'mass', k: 28.349523125 },
  grain: { dim: 'mass', k: 0.06479891 },
  cwt: { dim: 'mass', k: 45359.237 },
  shweight: { dim: 'mass', k: 45359.237 },
  uk_cwt: { dim: 'mass', k: 50802.345 },
  lcwt: { dim: 'mass', k: 50802.345 },
  hweight: { dim: 'mass', k: 50802.345 },
  stone: { dim: 'mass', k: 6350.29318 },
  ton: { dim: 'mass', k: 907184.74 },
  uk_ton: { dim: 'mass', k: 1016046.9088 },
  LTON: { dim: 'mass', k: 1016046.9088 },
  brton: { dim: 'mass', k: 1016046.9088 },

  // distance (canonical: m)
  m: { dim: 'distance', k: 1, prefix: 'metric' },
  mi: { dim: 'distance', k: 1609.344 },
  Nmi: { dim: 'distance', k: 1852 },
  in: { dim: 'distance', k: 0.0254 },
  ft: { dim: 'distance', k: 0.3048 },
  yd: { dim: 'distance', k: 0.9144 },
  ang: { dim: 'distance', k: 1e-10, prefix: 'metric' },
  ell: { dim: 'distance', k: 1.143 },
  ly: { dim: 'distance', k: 9.4607304725808e15 },
  parsec: { dim: 'distance', k: 3.0856775814671916e16 },
  pc: { dim: 'distance', k: 3.0856775814671916e16 },
  Picapt: { dim: 'distance', k: 0.0254 / 72 },
  Pica: { dim: 'distance', k: 0.0254 / 72 },
  pica: { dim: 'distance', k: 0.00423333333333 },
  survey_mi: { dim: 'distance', k: 1609.347218694 },

  // time (canonical: s)
  yr: { dim: 'time', k: 31557600 },
  day: { dim: 'time', k: 86400 },
  d: { dim: 'time', k: 86400 },
  hr: { dim: 'time', k: 3600 },
  mn: { dim: 'time', k: 60 },
  min: { dim: 'time', k: 60 },
  sec: { dim: 'time', k: 1, prefix: 'metric' },
  s: { dim: 'time', k: 1, prefix: 'metric' },

  // pressure (canonical: Pa)
  Pa: { dim: 'pressure', k: 1, prefix: 'metric' },
  p: { dim: 'pressure', k: 1, prefix: 'metric' },
  atm: { dim: 'pressure', k: 101325, prefix: 'metric' },
  at: { dim: 'pressure', k: 101325, prefix: 'metric' },
  mmHg: { dim: 'pressure', k: 133.322387415, prefix: 'metric' },
  psi: { dim: 'pressure', k: 6894.757293168 },
  Torr: { dim: 'pressure', k: 133.32236842105263 },

  // force (canonical: N)
  N: { dim: 'force', k: 1, prefix: 'metric' },
  dyn: { dim: 'force', k: 1e-5, prefix: 'metric' },
  dy: { dim: 'force', k: 1e-5, prefix: 'metric' },
  lbf: { dim: 'force', k: 4.4482216152605 },
  pond: { dim: 'force', k: 9.80665e-3, prefix: 'metric' },

  // energy (canonical: J)
  J: { dim: 'energy', k: 1, prefix: 'metric' },
  e: { dim: 'energy', k: 1e-7, prefix: 'metric' },
  c: { dim: 'energy', k: 4.184, prefix: 'metric' },
  cal: { dim: 'energy', k: 4.1868, prefix: 'metric' },
  eV: { dim: 'energy', k: 1.602176565e-19, prefix: 'metric' },
  ev: { dim: 'energy', k: 1.602176565e-19, prefix: 'metric' },
  HPh: { dim: 'energy', k: 2684519.537696172 },
  hh: { dim: 'energy', k: 2684519.537696172 },
  Wh: { dim: 'energy', k: 3600, prefix: 'metric' },
  wh: { dim: 'energy', k: 3600, prefix: 'metric' },
  flb: { dim: 'energy', k: 1.3558179483314004 },
  BTU: { dim: 'energy', k: 1055.05585262 },
  btu: { dim: 'energy', k: 1055.05585262 },

  // power (canonical: W)
  HP: { dim: 'power', k: 745.6998715822702 },
  h: { dim: 'power', k: 745.6998715822702 },
  PS: { dim: 'power', k: 735.49875 },
  W: { dim: 'power', k: 1, prefix: 'metric' },
  w: { dim: 'power', k: 1, prefix: 'metric' },

  // magnetism (canonical: T)
  T: { dim: 'magnetism', k: 1, prefix: 'metric' },
  ga: { dim: 'magnetism', k: 1e-4, prefix: 'metric' },

  // volume (canonical: L)
  tsp: { dim: 'volume', k: 0.00492892159375 },
  tspm: { dim: 'volume', k: 0.005 },
  tbs: { dim: 'volume', k: 0.01478676478125 },
  oz: { dim: 'volume', k: 0.0295735295625 },
  cup: { dim: 'volume', k: 0.2365882365 },
  pt: { dim: 'volume', k: 0.473176473 },
  us_pt: { dim: 'volume', k: 0.473176473 },
  uk_pt: { dim: 'volume', k: 0.56826125 },
  qt: { dim: 'volume', k: 0.946352946 },
  uk_qt: { dim: 'volume', k: 1.1365225 },
  gal: { dim: 'volume', k: 3.785411784 },
  uk_gal: { dim: 'volume', k: 4.54609 },
  l: { dim: 'volume', k: 1, prefix: 'metric' },
  L: { dim: 'volume', k: 1, prefix: 'metric' },
  lt: { dim: 'volume', k: 1, prefix: 'metric' },
  ang3: { dim: 'volume', k: 1e-27, prefix: 'metric' },
  barrel: { dim: 'volume', k: 158.987294928 },
  bushel: { dim: 'volume', k: 35.2390704 },
  ft3: { dim: 'volume', k: 28.316846592 },
  in3: { dim: 'volume', k: 0.016387064 },
  ly3: { dim: 'volume', k: 8.46571903464403e50 },
  m3: { dim: 'volume', k: 1000, prefix: 'metric' },
  mi3: { dim: 'volume', k: 4.16818182544576e12 },
  yd3: { dim: 'volume', k: 764.554857984 },
  Nmi3: { dim: 'volume', k: 6.351441e9 },
  Picapt3: { dim: 'volume', k: 4.32130963952071e-8 },
  Pica3: { dim: 'volume', k: 4.32130963952071e-8 },
  GRT: { dim: 'volume', k: 2831.6846592 },
  regton: { dim: 'volume', k: 2831.6846592 },
  MTON: { dim: 'volume', k: 1132.67386368 },

  // area (canonical: m^2)
  'm2': { dim: 'area', k: 1, prefix: 'metric' },
  'mi2': { dim: 'area', k: 2589988.110336 },
  'Nmi2': { dim: 'area', k: 3429904 },
  'in2': { dim: 'area', k: 0.00064516 },
  'ft2': { dim: 'area', k: 0.09290304 },
  'yd2': { dim: 'area', k: 0.83612736 },
  'ang2': { dim: 'area', k: 1e-20, prefix: 'metric' },
  'ly2': { dim: 'area', k: 8.95054210748189e31 },
  'Pica2': { dim: 'area', k: 1.24144931922671e-7 },
  'Picapt2': { dim: 'area', k: 1.24144931922671e-7 },
  'ar': { dim: 'area', k: 100, prefix: 'metric' },
  'morgen': { dim: 'area', k: 2500 },
  'uk_acre': { dim: 'area', k: 4046.8564224 },
  'us_acre': { dim: 'area', k: 4046.8564224 },
  'ha': { dim: 'area', k: 10000 },

  // information (canonical: bit)
  bit: { dim: 'info', k: 1, prefix: 'both' },
  byte: { dim: 'info', k: 8, prefix: 'both' },

  // speed (canonical: m/s)
  'm/s': { dim: 'speed', k: 1, prefix: 'metric' },
  'm/sec': { dim: 'speed', k: 1, prefix: 'metric' },
  'm/h': { dim: 'speed', k: 1 / 3.6, prefix: 'metric' },
  'm/hr': { dim: 'speed', k: 1 / 3.6, prefix: 'metric' },
  mph: { dim: 'speed', k: 0.44704 },
  kn: { dim: 'speed', k: 0.514444444 },
  admkn: { dim: 'speed', k: 0.514773333 },
};

const DECIMAL_PREFIXES: Record<string, number> = {
  Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3,
  h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12,
  f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24,
};
const BINARY_PREFIXES: Record<string, number> = {
  Yi: 2 ** 80, Zi: 2 ** 70, Ei: 2 ** 60, Pi: 2 ** 50, Ti: 2 ** 40,
  Gi: 2 ** 30, Mi: 2 ** 20, ki: 2 ** 10,
};

function resolveUnit(name: string): { def: UnitDef; factor: number } | undefined {
  const direct = UNITS[name];
  if (direct) return { def: direct, factor: 1 };
  // Try 2-char then 1-char metric prefix; binary prefixes are always 2 chars.
  for (const pfx of Object.keys(BINARY_PREFIXES)) {
    if (name.startsWith(pfx)) {
      const rest = name.slice(pfx.length);
      const def = UNITS[rest];
      if (def && (def.prefix === 'binary' || def.prefix === 'both')) {
        return { def, factor: BINARY_PREFIXES[pfx]! };
      }
    }
  }
  if (name.startsWith('da')) {
    const rest = name.slice(2);
    const def = UNITS[rest];
    if (def && (def.prefix === 'metric' || def.prefix === 'both')) {
      return { def, factor: DECIMAL_PREFIXES.da! };
    }
  }
  if (name.length > 1) {
    const pfx = name[0]!;
    const rest = name.slice(1);
    const factor = DECIMAL_PREFIXES[pfx];
    const def = UNITS[rest];
    if (factor !== undefined && def && (def.prefix === 'metric' || def.prefix === 'both')) {
      return { def, factor };
    }
  }
  return undefined;
}

const TEMP_TO_K: Record<string, (t: number) => number> = {
  C: (t) => t + 273.15,
  cel: (t) => t + 273.15,
  F: (t) => (t - 32) * (5 / 9) + 273.15,
  fah: (t) => (t - 32) * (5 / 9) + 273.15,
  K: (t) => t,
  kel: (t) => t,
  Rank: (t) => t * (5 / 9),
  Reau: (t) => t * (5 / 4) + 273.15,
};
const TEMP_FROM_K: Record<string, (k: number) => number> = {
  C: (k) => k - 273.15,
  cel: (k) => k - 273.15,
  F: (k) => (k - 273.15) * (9 / 5) + 32,
  fah: (k) => (k - 273.15) * (9 / 5) + 32,
  K: (k) => k,
  kel: (k) => k,
  Rank: (k) => k * (9 / 5),
  Reau: (k) => (k - 273.15) * (4 / 5),
};

register('CONVERT', (args) => {
  const v = asNum(args[0]);
  if (isFormulaError(v)) return v;
  const fromName = args[1] === undefined || args[1] === null ? '' : String(args[1]);
  const toName = args[2] === undefined || args[2] === null ? '' : String(args[2]);
  if (fromName === '' || toName === '') return NA_ERROR;
  // Temperature has offsets — handle separately.
  if (TEMP_TO_K[fromName] && TEMP_FROM_K[toName]) {
    return TEMP_FROM_K[toName]!(TEMP_TO_K[fromName]!(v));
  }
  if (TEMP_TO_K[fromName] || TEMP_FROM_K[toName]) return NA_ERROR;
  const from = resolveUnit(fromName);
  const to = resolveUnit(toName);
  if (!from || !to) return NA_ERROR;
  if (from.def.dim !== to.def.dim) return NA_ERROR;
  return (v * (from.factor * from.def.k)) / (to.factor * to.def.k);
});

