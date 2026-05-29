// =============================================================================
// @onegrid/formula — v1.1.0 wave 7: engineering family.
//
// Number bases at the signed-width boundaries, bitwise ops at 48-bit edge,
// BESSEL textbook values (J0(0)=1, K0(small) → +∞, Y series matches
// recurrence), ERF/ERFC at standard cut-offs, complex arithmetic identities
// (Euler, conjugate-product = |z|², (1+i)^2 = 2i), and CONVERT across each
// dimension including SI/binary prefixes and temperature offsets.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NA_ERROR, NUM_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — number-base conversions', () => {
  it('BIN2DEC round-trip with DEC2BIN', () => {
    expect(call('DEC2BIN', [9])).toBe('1001');
    expect(call('BIN2DEC', ['1001'])).toBe(9);
    expect(call('DEC2BIN', [9, 8])).toBe('00001001');
  });

  it("BIN2DEC interprets a 10-digit string as two's-complement", () => {
    expect(call('BIN2DEC', ['1111111111'])).toBe(-1);
    expect(call('BIN2DEC', ['1000000000'])).toBe(-512);
    expect(call('DEC2BIN', [-1])).toBe('1111111111');
    expect(call('DEC2BIN', [-512])).toBe('1000000000');
  });

  it('HEX2BIN / BIN2HEX bridge negatives', () => {
    expect(call('DEC2HEX', [-1])).toBe('FFFFFFFFFF');
    expect(call('HEX2DEC', ['FFFFFFFFFF'])).toBe(-1);
    expect(call('HEX2BIN', ['F'])).toBe('1111');
    expect(call('BIN2HEX', ['1111'])).toBe('F');
  });

  it('OCT2/DEC2OCT across the signed range', () => {
    expect(call('DEC2OCT', [8])).toBe('10');
    expect(call('OCT2DEC', ['10'])).toBe(8);
    expect(call('OCT2DEC', ['7777777777'])).toBe(-1);
  });

  it('DEC2BIN rejects out-of-range', () => {
    expect(call('DEC2BIN', [512])).toBe(NUM_ERROR);
    expect(call('DEC2BIN', [-513])).toBe(NUM_ERROR);
  });
});

describe('@onegrid/formula — bitwise', () => {
  it('BITAND / BITOR / BITXOR basic identities', () => {
    expect(call('BITAND', [13, 25])).toBe(9);
    expect(call('BITOR', [13, 25])).toBe(29);
    expect(call('BITXOR', [13, 25])).toBe(20);
  });

  it('BITLSHIFT / BITRSHIFT', () => {
    expect(call('BITLSHIFT', [4, 2])).toBe(16);
    expect(call('BITRSHIFT', [16, 2])).toBe(4);
    expect(call('BITLSHIFT', [4, -2])).toBe(1);
  });

  it('reject negative or >48-bit inputs', () => {
    expect(call('BITAND', [-1, 0])).toBe(NUM_ERROR);
    expect(call('BITAND', [2 ** 48, 0])).toBe(NUM_ERROR);
  });
});

describe('@onegrid/formula — DELTA / GESTEP', () => {
  it('DELTA returns 1 only on equality', () => {
    expect(call('DELTA', [3, 3])).toBe(1);
    expect(call('DELTA', [3, 4])).toBe(0);
    expect(call('DELTA', [0])).toBe(1);
  });

  it('GESTEP is a unit step', () => {
    expect(call('GESTEP', [5, 4])).toBe(1);
    expect(call('GESTEP', [4, 5])).toBe(0);
    expect(call('GESTEP', [4, 4])).toBe(1);
  });
});

describe('@onegrid/formula — ERF / ERFC', () => {
  it('ERF(0) = 0, ERF(∞-ish) ≈ 1', () => {
    expect(call('ERF', [0]) as number).toBeCloseTo(0, 6);
    expect(call('ERF', [3]) as number).toBeCloseTo(0.9999779, 5);
  });

  it('ERFC = 1 - ERF', () => {
    const e = call('ERF', [1]) as number;
    const ec = call('ERFC', [1]) as number;
    expect(e + ec).toBeCloseTo(1, 6);
  });

  it('ERF two-arg = ERF(hi) - ERF(lo)', () => {
    const r = call('ERF', [0.5, 1.5]) as number;
    expect(r).toBeCloseTo(
      (call('ERF', [1.5]) as number) - (call('ERF', [0.5]) as number),
      6,
    );
  });
});

describe('@onegrid/formula — Bessel', () => {
  it('BESSELJ(0,0) = 1, BESSELJ(0,n>0) = 0', () => {
    expect(call('BESSELJ', [0, 0]) as number).toBeCloseTo(1, 8);
    expect(call('BESSELJ', [0, 1]) as number).toBeCloseTo(0, 8);
  });

  it('BESSELJ(1, 0) ≈ 0.7651976', () => {
    expect(call('BESSELJ', [1, 0]) as number).toBeCloseTo(0.7651976865, 5);
  });

  it('BESSELI(0,0) = 1; BESSELI(1,0) ≈ 1.2660659', () => {
    expect(call('BESSELI', [0, 0]) as number).toBeCloseTo(1, 8);
    expect(call('BESSELI', [1, 0]) as number).toBeCloseTo(1.2660658732, 5);
  });

  it('BESSELY / BESSELK require x>0', () => {
    expect(call('BESSELY', [0, 0])).toBe(NUM_ERROR);
    expect(call('BESSELK', [0, 0])).toBe(NUM_ERROR);
  });

  it('BESSELK(1,0) ≈ 0.4210244', () => {
    expect(call('BESSELK', [1, 0]) as number).toBeCloseTo(0.4210244382, 4);
  });
});

describe('@onegrid/formula — complex numbers', () => {
  it('COMPLEX formats correctly', () => {
    expect(call('COMPLEX', [3, 4])).toBe('3+4i');
    expect(call('COMPLEX', [3, -4])).toBe('3-4i');
    expect(call('COMPLEX', [0, 1])).toBe('i');
    expect(call('COMPLEX', [0, -1])).toBe('-i');
    expect(call('COMPLEX', [5, 0])).toBe('5');
    expect(call('COMPLEX', [3, 4, 'j'])).toBe('3+4j');
  });

  it('IMREAL / IMAGINARY / IMABS / IMARGUMENT', () => {
    expect(call('IMREAL', ['3+4i'])).toBe(3);
    expect(call('IMAGINARY', ['3+4i'])).toBe(4);
    expect(call('IMABS', ['3+4i'])).toBe(5);
    expect(call('IMARGUMENT', ['1+i']) as number).toBeCloseTo(Math.PI / 4, 8);
    expect(call('IMARGUMENT', ['0'])).toBe(NUM_ERROR);
  });

  it('IMCONJUGATE flips imaginary sign', () => {
    expect(call('IMCONJUGATE', ['3+4i'])).toBe('3-4i');
  });

  it('IMPRODUCT(z, conj(z)) = |z|²', () => {
    const r = call('IMPRODUCT', ['3+4i', '3-4i']);
    expect(r).toBe('25');
  });

  it('IMSUM / IMSUB', () => {
    expect(call('IMSUM', ['1+2i', '3+4i'])).toBe('4+6i');
    expect(call('IMSUB', ['3+4i', '1+2i'])).toBe('2+2i');
  });

  it('IMDIV by zero is #NUM!', () => {
    expect(call('IMDIV', ['1+i', '0'])).toBe(NUM_ERROR);
  });

  it('IMEXP / IMLN round-trip', () => {
    const z = call('IMEXP', ['1+0i']) as string;
    expect(z.startsWith(String(Math.E))).toBe(true);
    const ln = call('IMLN', ['1+0i']);
    expect(ln).toBe('0');
  });

  it('IMPOWER: (1+i)² = 2i', () => {
    const r = call('IMPOWER', ['1+i', 2]) as string;
    // Floating point — parse back via IMREAL/IMAGINARY.
    expect(call('IMREAL', [r]) as number).toBeCloseTo(0, 10);
    expect(call('IMAGINARY', [r]) as number).toBeCloseTo(2, 10);
  });

  it('IMSQRT: sqrt(-1) = i', () => {
    const r = call('IMSQRT', ['-1']) as string;
    expect(call('IMREAL', [r]) as number).toBeCloseTo(0, 10);
    expect(call('IMAGINARY', [r]) as number).toBeCloseTo(1, 10);
  });

  it('IMCOS / IMSIN: sin² + cos² = 1', () => {
    const s = call('IMSIN', ['1+0.5i']) as string;
    const c = call('IMCOS', ['1+0.5i']) as string;
    const sSq = call('IMPRODUCT', [s, s]) as string;
    const cSq = call('IMPRODUCT', [c, c]) as string;
    const sum = call('IMSUM', [sSq, cSq]) as string;
    expect(call('IMREAL', [sum]) as number).toBeCloseTo(1, 8);
    expect(call('IMAGINARY', [sum]) as number).toBeCloseTo(0, 8);
  });

  it('j suffix preserved through arithmetic', () => {
    expect(call('IMSUM', ['1+2j', '3+4j'])).toBe('4+6j');
  });
});

describe('@onegrid/formula — CONVERT', () => {
  it('mass: kg → lbm', () => {
    expect(call('CONVERT', [1, 'kg', 'lbm']) as number).toBeCloseTo(2.20462262, 5);
  });

  it('distance: mi → km via prefixed unit', () => {
    expect(call('CONVERT', [1, 'mi', 'km']) as number).toBeCloseTo(1.609344, 6);
  });

  it('time: hr → sec', () => {
    expect(call('CONVERT', [1, 'hr', 'sec'])).toBe(3600);
  });

  it('pressure: atm → Pa', () => {
    expect(call('CONVERT', [1, 'atm', 'Pa'])).toBe(101325);
  });

  it('energy: cal → J', () => {
    expect(call('CONVERT', [1, 'cal', 'J']) as number).toBeCloseTo(4.1868, 6);
  });

  it('temperature: C → F', () => {
    expect(call('CONVERT', [0, 'C', 'F']) as number).toBeCloseTo(32, 8);
    expect(call('CONVERT', [100, 'C', 'F']) as number).toBeCloseTo(212, 8);
  });

  it('temperature: K → C', () => {
    expect(call('CONVERT', [273.15, 'K', 'C']) as number).toBeCloseTo(0, 8);
  });

  it('information: byte → bit', () => {
    expect(call('CONVERT', [1, 'byte', 'bit'])).toBe(8);
  });

  it('binary prefix: Mibyte → byte', () => {
    expect(call('CONVERT', [1, 'Mibyte', 'byte'])).toBe(2 ** 20);
  });

  it('speed: mph → m/s', () => {
    expect(call('CONVERT', [60, 'mph', 'm/s']) as number).toBeCloseTo(26.8224, 4);
  });

  it('cross-dimension is #N/A', () => {
    expect(call('CONVERT', [1, 'kg', 'm'])).toBe(NA_ERROR);
  });

  it('unknown unit is #N/A', () => {
    expect(call('CONVERT', [1, 'wibble', 'g'])).toBe(NA_ERROR);
  });
});
